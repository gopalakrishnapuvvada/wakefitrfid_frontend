"""FastAPI REST routes for device adapter administration, health, and testing."""

import asyncio
import logging
import time
from typing import Any, Optional
from fastapi import APIRouter, HTTPException, Query, Request, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from uaim_device.adapters.handheld.classifier import RS38ScanClassifier
from uaim_device.api.websocket import WS_MANAGER
from uaim_device.core.events import IdentificationEvent
from uaim_device.core.manager import GLOBAL_DEVICE_MANAGER
from uaim_device.core.models import (
    DeviceHealth,
    DeviceInfo,
    DeviceType,
    EntityType,
    EventType,
    IdentifierType,
    ReaderMode,
)
from uaim_device.metrics.metrics import GLOBAL_METRICS
from uaim_device.processing.dispatcher import EventConsumer

logger = logging.getLogger(__name__)

router = APIRouter()


class ScanBroadcastHub(EventConsumer):
    """Event consumer that fans out scan events to asynchronous HTTP subscribers."""

    def __init__(self) -> None:
        self._subscribers: set[asyncio.Queue[IdentificationEvent]] = set()

    def subscribe(self) -> asyncio.Queue[IdentificationEvent]:
        q: asyncio.Queue[IdentificationEvent] = asyncio.Queue(maxsize=100)
        self._subscribers.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue[IdentificationEvent]) -> None:
        self._subscribers.discard(q)

    async def consume(self, event: IdentificationEvent) -> None:
        if event.event_type not in (EventType.IDENTIFICATION, EventType.UNKNOWN_SCAN):
            return
        for q in list(self._subscribers):
            try:
                q.put_nowait(event)
            except (asyncio.QueueFull, Exception):
                pass


SCAN_BROADCAST_HUB = ScanBroadcastHub()
GLOBAL_DEVICE_MANAGER.dispatcher.add_consumer(SCAN_BROADCAST_HUB)


class RawScanRequest(BaseModel):
    raw_scan: str = Field(..., description="Raw keystroke buffer string received from RS38 keyboard wedge")
    reader_mode: Optional[ReaderMode] = Field(None, description="Current client-tracked reader mode")
    input_method: str = Field("KEYBOARD_WEDGE", description="Ingestion mechanism")
    station_id: Optional[str] = Field(None, description="Optional station or operator identifier")


class KeyEventDiagnosticRequest(BaseModel):
    key: str
    code: str
    key_code: int
    alt_key: bool = False
    ctrl_key: bool = False
    shift_key: bool = False
    meta_key: bool = False
    timestamp: float
    duration_ms: Optional[float] = None


class CommandRequest(BaseModel):
    command: str
    kwargs: dict[str, Any] = Field(default_factory=dict)


class WriteTagRequest(BaseModel):
    epc: str = Field(..., description="The new EPC/UII hex string to encode (e.g. 'E2801190A504006FA2BF55AB')")
    target_epc: Optional[str] = Field(None, description="Optional current EPC of the tag (for addressed mode). If omitted, uses non-addressed mode")
    memory_bank: int = Field(1, description="Target memory bank (1 = EPC/UII, 3 = User Memory, 0 = Reserved)")
    word_offset: int = Field(2, description="Starting word offset in memory bank (Word 2 for Gen2 EPC data)")
    retries: int = Field(32, description="Number of write retries by reader hardware")
    antenna_id: Optional[int] = Field(1, description="Specific antenna channel (1-4)")


class SimulateScanRequest(BaseModel):
    identifier: str
    identifier_type: IdentifierType = IdentifierType.RFID_EPC
    rssi: Optional[float] = -50.0
    antenna_id: Optional[int] = 1
    metadata: dict[str, Any] = Field(default_factory=dict)


class UpdateConfigRequest(BaseModel):
    name: Optional[str] = None
    host: Optional[str] = None
    port: Optional[int] = None
    station_id: Optional[str] = None
    enabled: Optional[bool] = None
    fixed_mode: Optional[str] = None  # AUTOSCAN, EVENT_BASED
    handheld_mode: Optional[str] = None  # KEYSTROKE_EMULATION, WEBSOCKET_PUSH, TCP_STREAM, HTTP_WEBHOOK
    deduplication_window_ms: Optional[int] = None
    prefix: Optional[str] = None
    suffix: Optional[str] = None
    strip_prefix: Optional[str] = None
    epc_filter_prefix: Optional[str] = None
    min_rssi_dbm: Optional[float] = None
    format_mode: Optional[str] = None  # RAW, HEX_CLEAN, ASCII_DECODED, JSON_WRAPPED
    configuration: Optional[dict[str, Any]] = None


@router.get("/devices", response_model=list[DeviceInfo])
async def list_devices() -> list[DeviceInfo]:
    """List all registered identification devices."""
    return GLOBAL_DEVICE_MANAGER.list_devices()


@router.get("/devices/{device_id}", response_model=DeviceInfo)
async def get_device(device_id: str) -> DeviceInfo:
    """Get metadata and configuration for a specific device."""
    try:
        adapter = GLOBAL_DEVICE_MANAGER.get_adapter(device_id)
        return adapter.device_info
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/devices/{device_id}/health", response_model=DeviceHealth)
async def get_device_health(device_id: str) -> DeviceHealth:
    """Get current operational health and statistics for a device."""
    try:
        adapter = GLOBAL_DEVICE_MANAGER.get_adapter(device_id)
        return await adapter.health()
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/devices/{device_id}/connect")
async def connect_device(device_id: str):
    """Establish connection to the physical or virtual device."""
    try:
        adapter = GLOBAL_DEVICE_MANAGER.get_adapter(device_id)
        await adapter.connect()
        GLOBAL_METRICS.record_connected(device_id)
        return {"status": "ok", "state": adapter.state.value}
    except Exception as e:
        GLOBAL_METRICS.record_connection_error(device_id)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/devices/{device_id}/disconnect")
async def disconnect_device(device_id: str):
    """Disconnect and release device resources."""
    try:
        adapter = GLOBAL_DEVICE_MANAGER.get_adapter(device_id)
        await adapter.disconnect()
        GLOBAL_METRICS.record_disconnected(device_id)
        return {"status": "ok", "state": adapter.state.value}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/devices/{device_id}/start")
async def start_device(device_id: str):
    """Start reading and event emission for a device."""
    try:
        adapter = GLOBAL_DEVICE_MANAGER.get_adapter(device_id)
        await adapter.start()
        # Ensure event worker is running
        if device_id not in GLOBAL_DEVICE_MANAGER._adapter_event_tasks or GLOBAL_DEVICE_MANAGER._adapter_event_tasks[device_id].done():
            import asyncio
            task = asyncio.create_task(
                GLOBAL_DEVICE_MANAGER._consume_adapter_events(adapter),
                name=f"EventPump-{device_id}"
            )
            GLOBAL_DEVICE_MANAGER._adapter_event_tasks[device_id] = task
        return {"status": "ok", "state": adapter.state.value}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/devices/{device_id}/stop")
async def stop_device(device_id: str):
    """Pause reading operations on the device."""
    try:
        adapter = GLOBAL_DEVICE_MANAGER.get_adapter(device_id)
        await adapter.stop()
        return {"status": "ok", "state": adapter.state.value}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/devices/{device_id}/events")
async def get_device_events(device_id: str, limit: int = Query(50, ge=1, le=500)):
    """Retrieve recent normalized events observed by this device."""
    events = [e for e in GLOBAL_DEVICE_MANAGER.recent_events if e.device_id == device_id]
    return events[-limit:]


@router.get("/scans/latest")
@router.get("/tags/latest")
async def get_latest_scan(device_id: Optional[str] = Query(None, description="Filter by device ID (e.g. RFID-001)")):
    """
    Retrieve the most recently scanned RFID tag or barcode.
    
    Returns HTTP 200 with the latest scan details, or status 'no_scans' if nothing has been scanned yet.
    """
    scans = [
        e for e in GLOBAL_DEVICE_MANAGER.recent_events
        if e.event_type in (EventType.IDENTIFICATION, EventType.UNKNOWN_SCAN)
        and (device_id is None or e.device_id == device_id)
    ]
    if not scans:
        return {
            "status": "no_scans",
            "message": "No scans recorded yet. Scan a tag with SICK RFU630 or handheld scanner.",
            "data": None
        }

    latest = scans[-1]
    is_epc = "EPC" in latest.identifier_type.value or latest.identifier_type == IdentifierType.RFID_EPC
    return {
        "status": "success",
        "data": {
            "identifier": latest.identifier,
            "identifier_type": latest.identifier_type.value,
            "epc": latest.identifier if is_epc else None,
            "antenna_id": latest.antenna_id,
            "rssi": latest.rssi,
            "device_id": latest.device_id,
            "device_type": latest.device_type.value,
            "station_id": latest.station_id,
            "reader_mode": latest.reader_mode.value if latest.reader_mode else None,
            "timestamp": latest.timestamp.isoformat(),
            "event_id": latest.event_id,
            "metadata": latest.metadata,
        }
    }


@router.get("/scans")
@router.get("/tags")
async def list_recent_scans(
    limit: int = Query(50, ge=1, le=500, description="Number of recent scans to return"),
    device_id: Optional[str] = Query(None, description="Filter by device ID (e.g. RFID-001)"),
    identifier_type: Optional[str] = Query(None, description="Filter by identifier type (e.g. RFID_EPC)")
):
    """
    List recent scanned tags in reverse chronological order (newest first).
    """
    scans = [
        e for e in GLOBAL_DEVICE_MANAGER.recent_events
        if e.event_type in (EventType.IDENTIFICATION, EventType.UNKNOWN_SCAN)
        and (device_id is None or e.device_id == device_id)
        and (identifier_type is None or e.identifier_type.value == identifier_type)
    ]
    scans_subset = scans[-limit:]
    scans_subset.reverse()

    formatted = [
        {
            "event_id": e.event_id,
            "identifier": e.identifier,
            "identifier_type": e.identifier_type.value,
            "epc": e.identifier if ("EPC" in e.identifier_type.value or e.identifier_type == IdentifierType.RFID_EPC) else None,
            "antenna_id": e.antenna_id,
            "rssi": e.rssi,
            "device_id": e.device_id,
            "station_id": e.station_id,
            "timestamp": e.timestamp.isoformat(),
        }
        for e in scans_subset
    ]
    return {
        "status": "success",
        "total": len(formatted),
        "data": formatted
    }


@router.get("/scans/next")
async def wait_for_next_scan(
    timeout: float = Query(30.0, ge=1.0, le=120.0, description="Max seconds to wait for a scan"),
    device_id: Optional[str] = Query(None, description="Filter by device ID (e.g. RFID-001)")
):
    """
    Long-polling API: Holds the HTTP request open until a new RFID tag is scanned.
    
    Returns HTTP 200 immediately upon scan detection, or status 'timeout' after timeout expires.
    """
    queue = SCAN_BROADCAST_HUB.subscribe()
    start_time = time.time()
    try:
        while True:
            remaining = timeout - (time.time() - start_time)
            if remaining <= 0:
                return {
                    "status": "timeout",
                    "message": f"No scan detected within {timeout} seconds",
                    "data": None
                }

            try:
                event = await asyncio.wait_for(queue.get(), timeout=remaining)
                if device_id is None or event.device_id == device_id:
                    is_epc = "EPC" in event.identifier_type.value or event.identifier_type == IdentifierType.RFID_EPC
                    return {
                        "status": "success",
                        "data": {
                            "identifier": event.identifier,
                            "identifier_type": event.identifier_type.value,
                            "epc": event.identifier if is_epc else None,
                            "antenna_id": event.antenna_id,
                            "rssi": event.rssi,
                            "device_id": event.device_id,
                            "station_id": event.station_id,
                            "timestamp": event.timestamp.isoformat(),
                            "event_id": event.event_id,
                        }
                    }
            except asyncio.TimeoutError:
                return {
                    "status": "timeout",
                    "message": f"No scan detected within {timeout} seconds",
                    "data": None
                }
    finally:
        SCAN_BROADCAST_HUB.unsubscribe(queue)


@router.get("/scans/stream")
async def stream_scans_sse(
    device_id: Optional[str] = Query(None, description="Filter by device ID")
):
    """
    Server-Sent Events (SSE) HTTP stream.
    
    Streams live scan events in real time over standard HTTP. Visible directly in browser DevTools Network tab.
    """
    async def sse_generator():
        queue = SCAN_BROADCAST_HUB.subscribe()
        try:
            yield ": connected\n\n"
            while True:
                event = await queue.get()
                if device_id is None or event.device_id == device_id:
                    data = event.model_dump_json()
                    yield f"event: scan\ndata: {data}\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            SCAN_BROADCAST_HUB.unsubscribe(queue)

    return StreamingResponse(
        sse_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


class WebhookConfigRequest(BaseModel):
    enabled: bool = Field(True, description="Enable or disable the webhook forwarder")
    url: str = Field(..., description="Destination webhook URL (e.g. http://127.0.0.1:8000/post_fixed_rfid or external backend)")
    only_tag: bool = Field(True, description="If True, sends {'rfid_tag': '...'} alone")
    payload_field: str = Field("rfidUniqueId", description="JSON field name for the RFID tag")


@router.post("/post_fixed_rfid")
async def api_receive_post_fixed_rfid(request: Request):
    """
    Direct receiver endpoint for fixed RFID tag POST requests.
    Accepts JSON body: {"rfid_tag": "..."} or raw text.
    """
    try:
        data = await request.json()
    except Exception:
        body = await request.body()
        data = {"raw": body.decode("utf-8", errors="ignore")}
    logger.info(f"[POST_FIXED_RFID] Received tag payload: {data}")
    return {"status": "success", "received": data}


@router.get("/webhook/config")
async def get_webhook_config():
    """Retrieve current HTTP webhook forwarder status and settings."""
    from uaim_device.processing.dispatcher import HttpWebhookForwarder
    forwarders = [c for c in GLOBAL_DEVICE_MANAGER.dispatcher._consumers if isinstance(c, HttpWebhookForwarder)]
    if not forwarders:
        return {"configured": False, "enabled": False}
    f = forwarders[0]
    return {
        "configured": True,
        "enabled": f.enabled,
        "url": f.target_url,
        "only_tag": f.only_tag,
        "payload_field": f.payload_field
    }


@router.post("/webhook/config")
async def configure_webhook(req: WebhookConfigRequest):
    """
    Configure or update the HTTP webhook forwarder at runtime without restarting the server.
    """
    from uaim_device.processing.dispatcher import HttpWebhookForwarder
    for c in list(GLOBAL_DEVICE_MANAGER.dispatcher._consumers):
        if isinstance(c, HttpWebhookForwarder):
            GLOBAL_DEVICE_MANAGER.dispatcher.remove_consumer(c)

    if req.enabled and req.url:
        forwarder = HttpWebhookForwarder(
            target_url=req.url,
            enabled=req.enabled,
            only_tag=req.only_tag,
            payload_field=req.payload_field
        )
        GLOBAL_DEVICE_MANAGER.dispatcher.add_consumer(forwarder)
        logger.info(f"Updated HTTP Webhook Forwarder target to: {req.url} (only_tag={req.only_tag})")
        return {"status": "success", "message": f"Webhook forwarder configured to: {req.url}"}
    return {"status": "disabled", "message": "Webhook forwarder disabled"}


@router.post("/devices/{device_id}/command")
async def execute_command(device_id: str, req: CommandRequest):
    """Execute raw or CoLa-A command directly on the device."""
    try:
        adapter = GLOBAL_DEVICE_MANAGER.get_adapter(device_id)
        res = await adapter.execute_command(req.command, **req.kwargs)
        return {"status": "ok", "result": res}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/devices/{device_id}/tag/write")
async def write_tag_to_device(device_id: str, req: WriteTagRequest):
    """
    Write EPC/UII or memory bank data to an RFID transponder via SICK RFU630 reader.
    
    Supports both non-addressed (single tag in field) and addressed (specific target EPC) modes.
    """
    try:
        adapter = GLOBAL_DEVICE_MANAGER.get_adapter(device_id)
        if not hasattr(adapter, "write_tag"):
            raise HTTPException(
                status_code=400,
                detail=f"Device '{device_id}' of type '{adapter.device_info.device_type.value}' does not support direct RFID tag writing."
            )
        
        result = await adapter.write_tag(
            epc=req.epc,
            target_epc=req.target_epc,
            memory_bank=req.memory_bank,
            word_offset=req.word_offset,
            retries=req.retries,
            antenna_id=req.antenna_id,
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



@router.post("/devices/{device_id}/simulate-scan")
async def simulate_scan(device_id: str, req: SimulateScanRequest):
    """
    Simulate a manual RFID tag or Barcode/QR scan on a device.
    Useful for testing deduplication, read-cycles, and UI display.
    """
    try:
        adapter = GLOBAL_DEVICE_MANAGER.get_adapter(device_id)
        event = IdentificationEvent(
            device_id=device_id,
            device_type=adapter.device_info.device_type,
            vendor=adapter.device_info.vendor,
            model=adapter.device_info.model,
            event_type=EventType.IDENTIFICATION,
            identifier_type=req.identifier_type,
            identifier=req.identifier,
            rssi=req.rssi,
            antenna_id=req.antenna_id,
            station_id=adapter.device_info.station_id,
            metadata={"simulated": True, **req.metadata}
        )

        # Record and dispatch directly through the pipeline
        await GLOBAL_DEVICE_MANAGER._record_and_dispatch(event)

        return {"status": "ok", "event_id": event.event_id, "identifier": event.identifier}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/devices/{device_id}/read-cycle/start")
async def start_read_cycle(device_id: str, cycle_id: Optional[str] = None):
    """Start an explicit read cycle / reading gate operation."""
    try:
        adapter = GLOBAL_DEVICE_MANAGER.get_adapter(device_id)
        cid = cycle_id or f"RC-{int(asyncio.get_event_loop().time() * 1000)}"
        cycle = GLOBAL_DEVICE_MANAGER.read_cycle_processor.start_cycle(
            device_id=device_id,
            cycle_id=cid,
            station_id=adapter.device_info.station_id
        )
        # Emit cycle started event
        start_event = IdentificationEvent(
            device_id=device_id,
            device_type=adapter.device_info.device_type,
            vendor=adapter.device_info.vendor,
            model=adapter.device_info.model,
            event_type=EventType.READ_CYCLE_STARTED,
            identifier_type=IdentifierType.RFID_EPC,
            identifier=cid,
            read_cycle_id=cid,
            station_id=adapter.device_info.station_id
        )
        await GLOBAL_DEVICE_MANAGER._record_and_dispatch(start_event)
        return {"status": "ok", "read_cycle": cycle}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/devices/{device_id}/read-cycle/complete")
async def complete_read_cycle(device_id: str):
    """Complete active read cycle and generate summary."""
    try:
        summary = GLOBAL_DEVICE_MANAGER.read_cycle_processor.complete_cycle(device_id)
        if summary:
            await GLOBAL_DEVICE_MANAGER._record_and_dispatch(summary)
            return {"status": "ok", "summary": summary}
        return {"status": "no_active_cycle", "device_id": device_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/devices/{device_id}/config")
async def update_device_config(device_id: str, req: UpdateConfigRequest):
    """Update settings for a connected device."""
    try:
        adapter = GLOBAL_DEVICE_MANAGER.get_adapter(device_id)
        info = adapter.device_info
        if req.name is not None:
            info.name = req.name
        if req.host is not None:
            info.host = req.host
        if req.port is not None:
            info.port = req.port
        if req.station_id is not None:
            info.station_id = req.station_id
        if req.enabled is not None:
            info.enabled = req.enabled
        if req.fixed_mode is not None:
            from uaim_device.core.models import FixedRfidMode
            info.fixed_mode = FixedRfidMode(req.fixed_mode)
        if req.handheld_mode is not None:
            from uaim_device.core.models import HandheldInputMode
            info.handheld_mode = HandheldInputMode(req.handheld_mode)
        if req.deduplication_window_ms is not None:
            info.deduplication.window_ms = req.deduplication_window_ms
            if device_id in GLOBAL_DEVICE_MANAGER.deduplicators:
                GLOBAL_DEVICE_MANAGER.deduplicators[device_id].config.window_ms = req.deduplication_window_ms
        if req.prefix is not None:
            info.formatting.prefix = req.prefix
        if req.suffix is not None:
            info.formatting.suffix = req.suffix
        if req.strip_prefix is not None:
            info.formatting.strip_prefix = req.strip_prefix
        if req.epc_filter_prefix is not None:
            info.formatting.epc_filter_prefix = req.epc_filter_prefix
        if req.min_rssi_dbm is not None:
            info.formatting.min_rssi_dbm = req.min_rssi_dbm
        if req.format_mode is not None:
            from uaim_device.core.models import FormatMode
            info.formatting.format_mode = FormatMode(req.format_mode)
        if req.configuration is not None:
            info.configuration.update(req.configuration)

        return {"status": "ok", "device_info": info}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/devices/{device_id}/scan")
async def ingest_scan(device_id: str, req: RawScanRequest):
    """
    Ingest raw scan payload from CipherLab RS38 Keyboard Wedge or REST client.
    
    Performs authoritative business rule classification:
    - Control char assertions: RS (0x1E) -> RFID, GS (0x1D) -> QR, Terminator: 0x0D
    - Stateless prefix classification:
        - RS + EPC -> RFID_EPC, MATERIAL
        - GS + 100... -> MATERIAL_QR, MATERIAL
        - GS + 200... / 400... -> WORK_ORDER_QR, WORK_ORDER
        - GS + Other -> UNKNOWN_SCAN (UNKNOWN_QR_PREFIX)
        - Missing prefix -> UNKNOWN_SCAN (UNKNOWN_PREFIX)
    - Deduplication window suppression
    - Realtime event dispatching & metrics update
    """
    try:
        adapter = GLOBAL_DEVICE_MANAGER.get_adapter(device_id)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Device '{device_id}' not found: {e}")

    cls_config = getattr(adapter.device_info, "classification", None)
    
    # 1. Authoritative Business Rule Classification
    result = RS38ScanClassifier.classify(
        raw_scan=req.raw_scan,
        current_reader_mode=req.reader_mode,
        config=cls_config,
    )

    # 2. Track Mode Changes in metrics
    if result.inferred_mode != ReaderMode.UNKNOWN:
        GLOBAL_METRICS.record_scanner_mode_change(device_id, result.inferred_mode.value)

    # 3. Build standardized IdentificationEvent
    event = IdentificationEvent(
        device_id=device_id,
        device_type=adapter.device_info.device_type,
        vendor=adapter.device_info.vendor,
        model=adapter.device_info.model,
        event_type=EventType.IDENTIFICATION if result.is_valid else EventType.UNKNOWN_SCAN,
        identifier_type=result.identifier_type,
        identifier=result.clean_value,
        reader_mode=result.inferred_mode,
        source=result.source,
        entity_type=result.entity_type,
        input_method=req.input_method,
        diagnostic_warning=result.diagnostic_warning,
        raw_payload=req.raw_scan,
        station_id=req.station_id or adapter.device_info.station_id,
        metadata={
            "raw_length": len(req.raw_scan),
            "error_code": result.error_code,
            **result.metadata,
        },
    )

    # 4. Handle Invalid / Unclassified Scans
    if not result.is_valid:
        GLOBAL_METRICS.record_scanner_scan(device_id, is_duplicate=False, is_unknown=True)
        GLOBAL_METRICS.record_parse_error(device_id)
        await GLOBAL_DEVICE_MANAGER._record_and_dispatch(event)
        return {
            "status": "rejected",
            "error": result.error_code,
            "warning": result.diagnostic_warning,
            "event": event.model_dump(),
            "classification": result.to_dict(),
        }

    # 5. Handle Valid Scans: Deduplication & Dispatch
    deduplicator = GLOBAL_DEVICE_MANAGER.deduplicators.get(device_id)
    is_unique = deduplicator.is_unique(event) if deduplicator else True

    if not is_unique:
        GLOBAL_METRICS.record_scanner_scan(device_id, is_duplicate=True, is_unknown=False)
        GLOBAL_METRICS.record_identification(device_id, is_duplicate=True)
        logger.info(f"[{device_id}] Suppressed duplicate scan for '{event.identifier}' within window")
        return {
            "status": "duplicate_suppressed",
            "is_duplicate": True,
            "event": event.model_dump(),
            "classification": result.to_dict(),
        }

    GLOBAL_METRICS.record_scanner_scan(device_id, is_duplicate=False, is_unknown=False)
    GLOBAL_METRICS.record_identification(device_id, is_duplicate=False)
    await GLOBAL_DEVICE_MANAGER._record_and_dispatch(event)

    return {
        "status": "accepted",
        "is_duplicate": False,
        "event": event.model_dump(),
        "classification": result.to_dict(),
    }


@router.post("/devices/{device_id}/diagnostic/key-event")
async def log_key_event_diagnostic(device_id: str, req: KeyEventDiagnosticRequest):
    """
    Diagnostic endpoint to receive browser key events and monitor for physical trigger switches.
    """
    logger.debug(
        f"[{device_id}] Diagnostic Key Event: key={req.key!r} code={req.code!r} "
        f"keyCode={req.key_code} alt={req.alt_key} ctrl={req.ctrl_key} shift={req.shift_key}"
    )
    return {"status": "ok", "logged": True}


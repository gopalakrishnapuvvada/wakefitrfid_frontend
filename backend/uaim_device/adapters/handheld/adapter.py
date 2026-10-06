"""Adapter for CipherLab RS38 (AS38N8RF4NSG1) Handheld Mobile Computer."""

import asyncio
import logging
from typing import Any, AsyncIterator, Optional
from uaim_device.adapters.handheld.models import HandheldConfig, HandheldTransportType
from uaim_device.adapters.handheld.parser import HandheldParser
from uaim_device.adapters.handheld.transport import (
    HandheldTransport,
    HidHandheldTransport,
    HttpHandheldTransport,
    TcpHandheldTransport,
)
from uaim_device.core.adapter import DeviceAdapter
from uaim_device.core.events import IdentificationEvent
from uaim_device.core.health import HealthMonitor
from uaim_device.core.lifecycle import ConnectionStateMachine
from uaim_device.core.models import (
    DeviceHealth,
    DeviceInfo,
    DeviceState,
    DeviceType,
    EventType,
    IdentifierType,
)
from uaim_device.core.registry import register_adapter

logger = logging.getLogger(__name__)


@register_adapter("handheld")
class HandheldAdapter(DeviceAdapter):
    """
    Production adapter for the CipherLab RS38 Rugged Android Mobile Computer (AS38N8RF4NSG1).
    
    Supports:
    - Multi-modal scan ingestion: UHF RFID transponder reads + 1D/2D Barcode/QR imager reads.
    - Multiple transports:
        1. TCP Stream (Software Reader / DataWedge network socket stream over Wi-Fi)
        2. HTTP REST / Webhook Push (CipherLab Android application JSON POST)
        3. USB / Bluetooth HID Keystroke Emulation (Operator barcode gun wedge)
        4. Android Intent broadcast integration
    """

    def __init__(self, device_info: DeviceInfo) -> None:
        self._device_info = device_info
        self.device_id = device_info.device_id
        self.config = HandheldConfig(
            transport_type=HandheldTransportType(device_info.configuration.get("transport", "TCP").upper()),
            host=device_info.host or "0.0.0.0",
            port=device_info.port or 9001,
            default_identifier_type=device_info.configuration.get("default_type", "RFID_EPC"),
            device_model=device_info.model or "RS38 (AS38N8RF4NSG1)",
            vendor=device_info.vendor or "CipherLab",
        )

        self.state_machine = ConnectionStateMachine(self.device_id)
        self.health_monitor = HealthMonitor(self.device_id)
        self._transport: HandheldTransport = self._init_transport()

        self._event_queue: asyncio.Queue[IdentificationEvent] = asyncio.Queue(maxsize=5000)
        self._worker_task: Optional[asyncio.Task] = None
        self._is_running: bool = False
        self._shutdown_event = asyncio.Event()

    def _init_transport(self) -> HandheldTransport:
        t_type = self.config.transport_type
        if t_type == HandheldTransportType.TCP:
            return TcpHandheldTransport(self.device_id, self.config.host, self.config.port)
        elif t_type == HandheldTransportType.HTTP:
            return HttpHandheldTransport(self.device_id)
        else:
            return HidHandheldTransport(self.device_id)

    @property
    def device_info(self) -> DeviceInfo:
        return self._device_info

    @property
    def state(self) -> DeviceState:
        return self.state_machine.current_state

    async def connect(self) -> None:
        if self.state in (DeviceState.CONNECTED, DeviceState.RUNNING):
            return

        self.state_machine.transition(DeviceState.CONNECTING)
        try:
            await self._transport.start()
            self.state_machine.transition(DeviceState.CONNECTED)
            self.health_monitor.on_connected()
            logger.info(
                f"[{self.device_id}] CipherLab RS38 adapter connected on transport {self.config.transport_type.value}"
            )
        except Exception as e:
            self.state_machine.transition(DeviceState.ERROR)
            self.health_monitor.on_error(str(e))
            raise

    async def disconnect(self) -> None:
        self._is_running = False
        self._shutdown_event.set()
        await self.stop()
        await self._transport.stop()
        self.state_machine.transition(DeviceState.DISCONNECTED)
        self.health_monitor.on_disconnected()

    async def start(self) -> None:
        if self.state == DeviceState.RUNNING:
            return
        if self.state != DeviceState.CONNECTED:
            await self.connect()

        self._is_running = True
        self._shutdown_event.clear()
        self.state_machine.transition(DeviceState.RUNNING)
        self.health_monitor.on_running()

        if self._worker_task is None or self._worker_task.done():
            self._worker_task = asyncio.create_task(
                self._process_scans_loop(),
                name=f"CipherLabRS38Worker-{self.device_id}"
            )

    async def stop(self) -> None:
        self._is_running = False
        if self._worker_task and not self._worker_task.done():
            self._worker_task.cancel()
            try:
                await self._worker_task
            except (asyncio.CancelledError, Exception):
                pass
            self._worker_task = None
        if self._transport.is_connected:
            self.state_machine.transition(DeviceState.CONNECTED)
        else:
            self.state_machine.transition(DeviceState.DISCONNECTED)

    async def health(self) -> DeviceHealth:
        return self.health_monitor.get_health()

    async def events(self) -> AsyncIterator[IdentificationEvent]:
        while not self._shutdown_event.is_set():
            try:
                event = await asyncio.wait_for(self._event_queue.get(), timeout=1.0)
                yield event
                self._event_queue.task_done()
            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                break

    async def execute_command(self, command: str, **kwargs: Any) -> Any:
        """Inject or simulate a handheld scan directly."""
        if command in ("simulate_scan", "inject"):
            payload = kwargs.get("payload", "")
            await self._transport.inject_scan(payload)
            return {"status": "injected", "payload": payload}
        return {"status": "unsupported_command", "command": command}

    async def _process_scans_loop(self) -> None:
        while self._is_running:
            try:
                raw_scan = await self._transport.incoming_data.get()
                self.health_monitor.record_message()
                parsed = HandheldParser.parse(raw_scan, default_type=self.config.default_identifier_type)

                if parsed.identifier or not parsed.is_valid:
                    event = IdentificationEvent(
                        device_id=self.device_id,
                        device_type=self.device_info.device_type,
                        vendor=self.device_info.vendor,
                        model=self.device_info.model,
                        event_type=EventType.IDENTIFICATION if parsed.is_valid else EventType.UNKNOWN_SCAN,
                        identifier_type=parsed.identifier_type,
                        identifier=parsed.identifier,
                        rssi=parsed.rssi,
                        antenna_id=parsed.antenna_id,
                        station_id=self.device_info.station_id,
                        reader_mode=parsed.reader_mode,
                        source=parsed.source,
                        entity_type=parsed.entity_type,
                        input_method="KEYBOARD_WEDGE" if self.config.transport_type == HandheldTransportType.HID else self.config.transport_type.value,
                        diagnostic_warning=parsed.diagnostic_warning,
                        raw_payload=raw_scan,
                        metadata=parsed.metadata,
                    )
                    self.health_monitor.record_identification(is_unique=True)
                    await self._event_queue.put(event)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"[{self.device_id}] Error in CipherLab RS38 scan processor: {e}", exc_info=True)

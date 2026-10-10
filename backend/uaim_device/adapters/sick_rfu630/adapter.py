"""Production-grade SICK RFU630 UHF RFID Reader Adapter."""

import asyncio
from datetime import datetime, timezone
import logging
import time
from typing import Any, AsyncIterator, Optional
from uaim_device.adapters.sick_rfu630.cola.commands import SickColaCommands
from uaim_device.adapters.sick_rfu630.connection import SickTcpConnection
from uaim_device.adapters.sick_rfu630.models import SickRFU630Config
from uaim_device.adapters.sick_rfu630.parser import SickRFU630Parser
from uaim_device.core.adapter import DeviceAdapter
from uaim_device.core.events import IdentificationEvent
from uaim_device.core.exceptions import DeviceConnectionError
from uaim_device.core.health import HealthMonitor
from uaim_device.core.lifecycle import ConnectionStateMachine, ExponentialBackoff
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


@register_adapter("sick_rfu630")
class SickRFU630Adapter(DeviceAdapter):
    """
    Adapter for SICK RFU630 fixed UHF RFID readers using CoLa-A protocol over Ethernet/TCP.
    """

    def __init__(self, device_info: DeviceInfo) -> None:
        self._device_info = device_info
        self.device_id = device_info.device_id
        self.config = SickRFU630Config(
            host=device_info.host or "192.168.10.50",
            port=device_info.port or 2111,
            **device_info.configuration
        )

        self.state_machine = ConnectionStateMachine(self.device_id)
        self.health_monitor = HealthMonitor(self.device_id)
        self.backoff = ExponentialBackoff(device_info.reconnect)

        self._connection: Optional[SickTcpConnection] = None
        self._event_queue: asyncio.Queue[IdentificationEvent] = asyncio.Queue(maxsize=10000)

        self._reader_task: Optional[asyncio.Task] = None
        self._heartbeat_task: Optional[asyncio.Task] = None
        self._reconnect_task: Optional[asyncio.Task] = None
        self._is_running: bool = False
        self._shutdown_event = asyncio.Event()

    @property
    def device_info(self) -> DeviceInfo:
        return self._device_info

    @property
    def state(self) -> DeviceState:
        return self.state_machine.current_state

    async def connect(self) -> None:
        """Establish low-level TCP link and verify CoLa-A communication."""
        if self.state in (DeviceState.CONNECTED, DeviceState.RUNNING):
            return

        self.state_machine.transition(DeviceState.CONNECTING)
        try:
            self._connection = SickTcpConnection(
                host=self.config.host,
                port=self.config.port,
                device_id=self.device_id,
                command_timeout=self.config.command_timeout_sec,
            )
            await self._connection.connect()

            # Verify communication by reading DeviceIdent
            try:
                t0 = time.perf_counter()
                resp = await self._connection.execute_command(f"sRN {SickColaCommands.VAR_DEVICE_IDENT}")
                latency_ms = (time.perf_counter() - t0) * 1000.0
                ident_str = " ".join(resp.tokens) if resp.tokens else "RFU630"
                self._device_info.firmware_version = ident_str
                self.health_monitor.record_message(latency_ms=latency_ms)
                self.health_monitor.set_detail("device_ident", ident_str)
                logger.info(f"[{self.device_id}] SICK RFU630 verified. Ident: {ident_str}")
            except Exception as e:
                logger.warning(f"[{self.device_id}] DeviceIdent check failed ({e}), continuing connection.")

            self.state_machine.transition(DeviceState.CONNECTED)
            self.health_monitor.on_connected()
            self.backoff.reset()

            # Emit connected event
            await self._emit_lifecycle_event(EventType.DEVICE_CONNECTED, f"Connected to {self.config.host}:{self.config.port}")

        except Exception as e:
            self.state_machine.transition(DeviceState.ERROR)
            self.health_monitor.on_error(str(e))
            await self._emit_lifecycle_event(EventType.DEVICE_ERROR, str(e))
            raise DeviceConnectionError(f"Connection failed: {e}", device_id=self.device_id)

    async def disconnect(self) -> None:
        """Disconnect and clean up all background tasks."""
        self._is_running = False
        self._shutdown_event.set()

        if self._reconnect_task and not self._reconnect_task.done():
            self._reconnect_task.cancel()
            self._reconnect_task = None

        await self.stop()

        if self._connection:
            await self._connection.disconnect()
            self._connection = None

        if self.state != DeviceState.DISCONNECTED:
            self.state_machine.transition(DeviceState.DISCONNECTED)
        self.health_monitor.on_disconnected()
        await self._emit_lifecycle_event(EventType.DEVICE_DISCONNECTED, "Device disconnected.")

    async def start(self) -> None:
        """Start background telegram reader and heartbeat tasks."""
        if self.state == DeviceState.RUNNING:
            return

        self._is_running = True
        self._shutdown_event.clear()

        # Start supervisor reconnect watcher
        if self.device_info.reconnect.enabled and (self._reconnect_task is None or self._reconnect_task.done()):
            self._reconnect_task = asyncio.create_task(self._supervisor_loop(), name=f"SickSupervisor-{self.device_id}")

        if self.state != DeviceState.CONNECTED:
            try:
                await self.connect()
            except Exception as e:
                logger.warning(f"[{self.device_id}] Initial connection failed: {e}. Reconnect supervisor will continue trying in background.")
                return

        self.state_machine.transition(DeviceState.RUNNING)
        self.health_monitor.on_running()

        # Send SOPAS Run and event subscription commands
        if self.config.auto_start_on_connect and self._connection:
            try:
                await self._connection.execute_command(f"sMN {SickColaCommands.METHOD_RUN}")
                logger.info(f"[{self.device_id}] SICK Run mode activated.")
            except Exception as e:
                logger.debug(f"[{self.device_id}] Run command notice: {e}")

            # Subscribe to standard RFID event telegrams
            for event_name in ("ReadResult", "RFIOpData", "LMDscandata"):
                try:
                    await self._connection.send_raw(SickColaCommands.subscribe_event(event_name, enable=True))
                except Exception:
                    pass

        # Start streaming processor task
        if self._reader_task is None or self._reader_task.done():
            self._reader_task = asyncio.create_task(self._process_telegrams_loop(), name=f"SickProcessLoop-{self.device_id}")

        # Start periodic heartbeat task
        if self.config.enable_heartbeat and (self._heartbeat_task is None or self._heartbeat_task.done()):
            self._heartbeat_task = asyncio.create_task(self._heartbeat_loop(), name=f"SickHeartbeat-{self.device_id}")

    async def stop(self) -> None:
        """Pause reading operations without dropping physical connection."""
        if self.state in (DeviceState.STOPPING, DeviceState.DISCONNECTED):
            return

        self._is_running = False
        if self.state in (DeviceState.CONNECTED, DeviceState.RUNNING):
            self.state_machine.transition(DeviceState.STOPPING)

        if self._connection and self._connection.is_connected:
            try:
                await self._connection.execute_command(f"sMN {SickColaCommands.METHOD_FREEZE}")
            except Exception:
                pass

        if self._heartbeat_task and not self._heartbeat_task.done():
            self._heartbeat_task.cancel()
            self._heartbeat_task = None

        if self._reader_task and not self._reader_task.done():
            self._reader_task.cancel()
            try:
                await self._reader_task
            except (asyncio.CancelledError, Exception):
                pass
            self._reader_task = None

        if self._connection and self._connection.is_connected:
            self.state_machine.transition(DeviceState.CONNECTED)
        else:
            self.state_machine.transition(DeviceState.DISCONNECTED)

    async def health(self) -> DeviceHealth:
        """Return operational health snapshot."""
        return self.health_monitor.get_health()

    async def events(self) -> AsyncIterator[IdentificationEvent]:
        """Yield real-time normalized IdentificationEvent items."""
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
        """Send a raw or named CoLa-A command to the RFU630."""
        if not self._connection or not self._connection.is_connected:
            raise DeviceConnectionError("Device not connected", device_id=self.device_id)
        
        resp = await self._connection.execute_command(command)
        return {
            "command_type": resp.command_type,
            "name": resp.name,
            "tokens": resp.tokens,
            "raw": resp.raw_content
        }

    async def write_tag(
        self,
        epc: str,
        target_epc: Optional[str] = None,
        memory_bank: int = 1,
        word_offset: int = 2,
        retries: int = 32,
        antenna_id: Optional[int] = None,
        **kwargs: Any
    ) -> dict[str, Any]:
        """
        Write EPC/UII data to an RFID transponder in the RF field using SICK CoLa-A (TAwriteTagData).
        
        Args:
            epc: The new EPC/UII hex string to encode (e.g. 'E2801190A504006FA2BF55AB').
            target_epc: Optional current EPC of the specific tag for addressed mode. If None, uses non-addressed mode.
            memory_bank: Target memory bank (1 = EPC/UII, 3 = User memory, 0 = Reserved).
            word_offset: Starting word offset (Word 2 for Gen2 EPC data).
            retries: Number of RF write attempts by reader firmware (default 32).
            antenna_id: Specific antenna channel (1-4).
        """
        if not self._connection or not self._connection.is_connected:
            raise DeviceConnectionError("Cannot write tag: SICK RFU630 is not connected.", device_id=self.device_id)

        clean_epc = "".join(c for c in epc.strip() if c.isalnum()).upper()
        if not clean_epc:
            raise ValueError("EPC data must not be empty.")
        if len(clean_epc) % 2 != 0:
            raise ValueError(f"EPC hex string length must be even (got {len(clean_epc)} characters).")

        # Build verified SICK RFU630 CoLa-A command string (TAextWriteTagData)
        cmd_str = SickColaCommands.build_write_tag_epc_cmd(
            epc_hex=clean_epc,
            target_epc=target_epc,
            memory_bank=memory_bank,
            word_offset=word_offset,
            retries=retries,
            antenna_id=antenna_id or 1,
        )

        logger.info(f"[{self.device_id}] Executing Real-Time Tag Write: '{cmd_str}'")
        t0 = time.perf_counter()

        try:
            resp = await self._connection.execute_command(cmd_str)
            latency_ms = (time.perf_counter() - t0) * 1000.0

            # SICK TAextWriteTagData Response Format: sAN TAextWriteTagData <token0> <words_written>
            # Success returns words_written >= expected_words (e.g. 6 words for 24-char 96-bit EPC)
            expected_words = len(clean_epc) // 4
            words_written = 0
            if resp.tokens and len(resp.tokens) > 1:
                try:
                    words_written = int(resp.tokens[1].lstrip("+"))
                except ValueError:
                    words_written = 0
            elif resp.tokens and len(resp.tokens) == 1:
                try:
                    words_written = int(resp.tokens[0].lstrip("+"))
                except ValueError:
                    words_written = 0

            is_success = (words_written >= expected_words) and (words_written > 0)

            if is_success:
                status_token = "0"
                status_desc = f"Success ({words_written} words / {words_written * 16} bits written and verified on transponder)"
                logger.info(f"[{self.device_id}] ✅ Successfully encoded EPC [{clean_epc}] ({words_written} words written in {latency_ms:.1f}ms)")
            else:
                status_token = "1"
                if target_epc:
                    status_desc = f"Write Failed (0 words written). Target transponder '{target_epc}' was not found in antenna RF field or memory is locked."
                else:
                    status_desc = "Write Failed (0 words written). No transponder was detected in antenna RF field or RF power insufficient."
                logger.warning(f"[{self.device_id}] ❌ Tag write failed: {status_desc} (Raw: {resp.raw_content})")

            result = {
                "success": is_success,
                "device_id": self.device_id,
                "epc": clean_epc,
                "target_epc": target_epc.strip() if target_epc else None,
                "memory_bank": memory_bank,
                "word_offset": word_offset,
                "word_count": expected_words,
                "words_written": words_written,
                "status_code": status_token,
                "status_message": status_desc,
                "command_sent": cmd_str,
                "raw_response": resp.raw_content,
                "latency_ms": round(latency_ms, 2),
                "timestamp": datetime.now(timezone.utc).isoformat()
            }

            # Emit write event to event bus & WebSocket stream
            event_type = EventType.TAG_WRITTEN if is_success else EventType.TAG_WRITE_FAILED
            event = IdentificationEvent(
                device_id=self.device_id,
                device_type=DeviceType.RFID_FIXED,
                vendor="SICK",
                model="RFU630",
                event_type=event_type,
                identifier_type=IdentifierType.RFID_EPC,
                identifier=clean_epc,
                timestamp=datetime.now(timezone.utc),
                antenna_id=antenna_id or 1,
                station_id=self.device_info.station_id,
                metadata={
                    "action": "TAG_WRITE",
                    "target_epc": target_epc,
                    "words_written": words_written,
                    "words_expected": expected_words,
                    "status_code": status_token,
                    "status_message": status_desc,
                    "latency_ms": round(latency_ms, 2),
                    "raw": resp.raw_content
                }
            )
            await self._enqueue_event(event)
            return result

        except Exception as e:
            latency_ms = (time.perf_counter() - t0) * 1000.0
            logger.error(f"[{self.device_id}] Tag write execution failed: {e}")
            return {
                "success": False,
                "device_id": self.device_id,
                "epc": clean_epc,
                "target_epc": target_epc,
                "status_code": "ERROR",
                "status_message": str(e),
                "command_sent": cmd_str,
                "raw_response": None,
                "latency_ms": round(latency_ms, 2),
                "timestamp": datetime.now(timezone.utc).isoformat()
            }


    async def _process_telegrams_loop(self) -> None:
        """Consumes raw telegrams from TCP connection and converts them to IdentificationEvents."""
        logger.info(f"[{self.device_id}] Telegram processing loop started.")
        while self._is_running and self._connection:
            try:
                telegram = await self._connection.incoming_telegrams.get()
                self.health_monitor.record_message()

                if self.config.raw_logging:
                    logger.info(f"[{self.device_id}] RAW INCOMING: '{telegram.raw_content}' (cmd={telegram.command_type}, name={telegram.name})")

                # Parse RFID Read Result from any CoLa event or raw host port message
                result = SickRFU630Parser.parse_read_result(telegram, self.device_id)
                if result.tags:
                    for tag in result.tags:
                        if not tag.epc:
                            continue
                        
                        logger.info(f"[{self.device_id}] >>> REAL-TIME TAG READ: EPC={tag.epc}, Ant={tag.antenna_id}, RSSI={tag.rssi}")
                        event = IdentificationEvent(
                            device_id=self.device_id,
                            device_type=DeviceType.RFID_FIXED,
                            vendor="SICK",
                            model="RFU630",
                            event_type=EventType.IDENTIFICATION,
                            identifier_type=IdentifierType.RFID_EPC,
                            identifier=tag.epc,
                            timestamp=tag.timestamp,
                            rssi=tag.rssi,
                            antenna_id=tag.antenna_id,
                            read_cycle_id=result.cycle_id,
                            station_id=self.device_info.station_id,
                            metadata={
                                "tid": tag.tid,
                                "user_memory": tag.user_memory,
                                "read_count": tag.read_count,
                                "source": "sick_rfu630",
                                "raw": telegram.raw_content
                            }
                        )
                        self.health_monitor.record_identification(is_unique=True)
                        await self._enqueue_event(event)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"[{self.device_id}] Error in telegram processing loop: {e}", exc_info=True)

        logger.info(f"[{self.device_id}] Telegram processing loop finished.")

    async def _heartbeat_loop(self) -> None:
        """Periodically ping device with DeviceIdent or SCdevicestate to verify reader health."""
        while self._is_running:
            try:
                await asyncio.sleep(self.config.heartbeat_interval_sec)
                if self._connection and self._connection.is_connected:
                    t0 = time.perf_counter()
                    resp = await self._connection.execute_command(f"sRN {SickColaCommands.VAR_DEVICE_STATE}")
                    latency_ms = (time.perf_counter() - t0) * 1000.0
                    self.health_monitor.record_message(latency_ms=latency_ms)
                    self.health_monitor.set_detail("device_state", " ".join(resp.tokens))
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.warning(f"[{self.device_id}] SICK Heartbeat check failed ({e}). Dropping stale connection to trigger automatic reconnection.")
                if self._connection:
                    try:
                        await self._connection.disconnect()
                    except Exception:
                        pass
                break

    async def _supervisor_loop(self) -> None:
        """Supervises connection health and triggers automatic exponential backoff reconnection."""
        while not self._shutdown_event.is_set():
            await asyncio.sleep(0.5)
            if self._is_running:
                is_conn = self._connection and self._connection.is_connected
                if not is_conn and self.state not in (DeviceState.CONNECTING, DeviceState.RECONNECTING):
                    logger.warning(f"[{self.device_id}] Detected dropped connection. Initiating reconnect loop...")
                    self.state_machine.transition(DeviceState.ERROR)
                    self.health_monitor.on_reconnecting()
                    
                    while self._is_running and not self._shutdown_event.is_set():
                        delay = self.backoff.next_delay()
                        logger.info(f"[{self.device_id}] Reconnecting in {delay:.1f}s (attempt {self.backoff.attempt})...")
                        self.state_machine.transition(DeviceState.RECONNECTING)
                        await asyncio.sleep(delay)
                        try:
                            # Clean up old connection instance before attempting fresh socket
                            if self._connection:
                                try:
                                    await self._connection.disconnect()
                                except Exception:
                                    pass
                                self._connection = None

                            await self.connect()
                            if self.config.auto_start_on_connect and self._connection:
                                try:
                                    await self._connection.execute_command(f"sMN {SickColaCommands.METHOD_RUN}")
                                    logger.info(f"[{self.device_id}] SICK Run mode activated.")
                                except Exception as e:
                                    logger.debug(f"[{self.device_id}] Run command notice: {e}")
                                for event_name in ("ReadResult", "RFIOpData", "LMDscandata"):
                                    try:
                                        await self._connection.send_raw(SickColaCommands.subscribe_event(event_name, enable=True))
                                    except Exception:
                                        pass
                            # Restart processing loop
                            if self._reader_task is None or self._reader_task.done():
                                self._reader_task = asyncio.create_task(self._process_telegrams_loop())
                            if self.config.enable_heartbeat and (self._heartbeat_task is None or self._heartbeat_task.done()):
                                self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())
                            self.state_machine.transition(DeviceState.RUNNING)
                            self.health_monitor.on_running()
                            logger.info(f"[{self.device_id}] Successfully connected to SICK RFU630 and active in Run mode!")
                            break
                        except Exception as e:
                            logger.warning(f"[{self.device_id}] Reconnect failed: {e}")

    async def _enqueue_event(self, event: IdentificationEvent) -> None:
        try:
            self._event_queue.put_nowait(event)
        except asyncio.QueueFull:
            logger.warning(f"[{self.device_id}] Adapter event queue is full; dropping oldest event.")
            try:
                self._event_queue.get_nowait()
            except asyncio.QueueEmpty:
                pass
            self._event_queue.put_nowait(event)

    async def _emit_lifecycle_event(self, event_type: EventType, message: str) -> None:
        event = IdentificationEvent(
            device_id=self.device_id,
            device_type=DeviceType.RFID_FIXED,
            vendor="SICK",
            model="RFU630",
            event_type=event_type,
            identifier_type=IdentifierType.RFID_EPC,
            identifier=f"STATUS:{event_type.value}",
            station_id=self.device_info.station_id,
            metadata={"message": message}
        )
        await self._enqueue_event(event)

"""Low-level asyncio TCP client for SICK RFU630 CoLa-A communication."""

import asyncio
import logging
import time
from typing import Optional
from uaim_device.adapters.sick_rfu630.cola.framing import ColaFrameDecoder, encode_cola_a_telegram
from uaim_device.adapters.sick_rfu630.cola.parser import ColaParser, ColaTelegram
from uaim_device.core.exceptions import DeviceCommandError, DeviceConnectionError, DeviceTimeoutError

logger = logging.getLogger(__name__)


class SickTcpConnection:
    """Manages raw TCP socket connection, streaming frame decoding, and request-response matching."""

    def __init__(self, host: str, port: int, device_id: str, command_timeout: float = 3.0) -> None:
        self.host = host
        self.port = port
        self.device_id = device_id
        self.command_timeout = command_timeout

        self._reader: Optional[asyncio.StreamReader] = None
        self._writer: Optional[asyncio.StreamWriter] = None
        self._decoder = ColaFrameDecoder()
        self._read_task: Optional[asyncio.Task] = None

        # Queue for incoming asynchronous telegrams (sSN events)
        self.incoming_telegrams: asyncio.Queue[ColaTelegram] = asyncio.Queue()

        # Command-response matching map: command_name -> Future
        self._pending_commands: dict[str, asyncio.Future[ColaTelegram]] = {}
        self._is_connected: bool = False
        self._lock = asyncio.Lock()

    @property
    def is_connected(self) -> bool:
        return self._is_connected and self._writer is not None and not self._writer.is_closing()

    async def connect(self) -> None:
        """Establish TCP socket connection and spawn reader worker task."""
        async with self._lock:
            if self.is_connected:
                return

            ports_to_try = [self.port]
            fallback_port = 2111 if self.port == 2112 else (2112 if self.port == 2111 else None)
            if fallback_port and fallback_port not in ports_to_try:
                ports_to_try.append(fallback_port)

            last_error: Optional[Exception] = None
            for target_port in ports_to_try:
                logger.info(f"[{self.device_id}] Connecting TCP socket to {self.host}:{target_port}...")
                try:
                    self._reader, self._writer = await asyncio.wait_for(
                        asyncio.open_connection(self.host, target_port),
                        timeout=self.command_timeout
                    )
                    self._is_connected = True
                    self.port = target_port
                    self._decoder.reset()
                    self._read_task = asyncio.create_task(self._socket_read_loop(), name=f"SickReadLoop-{self.device_id}")
                    logger.info(f"[{self.device_id}] Connected successfully to {self.host}:{self.port}")
                    return
                except Exception as e:
                    self._is_connected = False
                    last_error = e
                    err_detail = str(e) if str(e) else f"{type(e).__name__} (Timed out after {self.command_timeout}s)"
                    if len(ports_to_try) > 1 and target_port != ports_to_try[-1]:
                        logger.warning(f"[{self.device_id}] Connection to {self.host}:{target_port} failed ({err_detail}). Trying alternate port {ports_to_try[-1]}...")
                    else:
                        logger.error(f"[{self.device_id}] TCP Connection failed to {self.host}:{target_port}: {err_detail}")
                    await self._cleanup()

            err_msg = str(last_error) if str(last_error) else f"{type(last_error).__name__} (Timed out)"
            raise DeviceConnectionError(f"Failed to connect to {self.host} on ports {ports_to_try}: {err_msg}", device_id=self.device_id)

    async def disconnect(self) -> None:
        """Gracefully close TCP socket and cancel reader task."""
        async with self._lock:
            await self._cleanup()

    async def _cleanup(self) -> None:
        self._is_connected = False
        if self._read_task and not self._read_task.done():
            self._read_task.cancel()
            try:
                await self._read_task
            except (asyncio.CancelledError, Exception):
                pass
            self._read_task = None

        if self._writer:
            try:
                self._writer.close()
                await self._writer.wait_closed()
            except Exception as e:
                logger.debug(f"[{self.device_id}] Error closing socket writer: {e}")
            self._writer = None
            self._reader = None

        # Fail any pending command futures
        for cmd_name, fut in list(self._pending_commands.items()):
            if not fut.done():
                fut.set_exception(DeviceConnectionError("Connection closed while waiting for response", device_id=self.device_id))
        self._pending_commands.clear()
        self._decoder.reset()
        logger.info(f"[{self.device_id}] Disconnected TCP connection.")

    async def send_raw(self, data: bytes) -> None:
        """Transmit raw framed bytes over the socket."""
        if not self.is_connected or not self._writer:
            raise DeviceConnectionError("Cannot send data: socket is not connected", device_id=self.device_id)
        try:
            self._writer.write(data)
            await self._writer.drain()
        except Exception as e:
            logger.error(f"[{self.device_id}] Socket write failed: {e}")
            self._is_connected = False
            raise DeviceConnectionError(f"Socket write error: {e}", device_id=self.device_id)

    async def execute_command(self, command_text: str) -> ColaTelegram:
        """
        Send a synchronous CoLa-A command and await the corresponding response telegram.
        
        Example: 'sRN DeviceIdent' -> awaits 'sRA DeviceIdent' or 'sFA'
        """
        if not self.is_connected:
            raise DeviceConnectionError("Socket not connected", device_id=self.device_id)

        parts = command_text.strip().split()
        if not parts:
            raise DeviceCommandError("Empty command string", device_id=self.device_id)

        # Expected key for matching response (e.g. DeviceIdent, Run, or generic)
        cmd_key = parts[1] if len(parts) > 1 else parts[0]
        loop = asyncio.get_running_loop()
        future: asyncio.Future[ColaTelegram] = loop.create_future()
        self._pending_commands[cmd_key] = future

        framed_bytes = encode_cola_a_telegram(command_text)
        t_start = time.perf_counter()

        try:
            await self.send_raw(framed_bytes)
            response = await asyncio.wait_for(future, timeout=self.command_timeout)
            latency_ms = (time.perf_counter() - t_start) * 1000.0

            if response.is_fault:
                raise DeviceCommandError(
                    f"SICK CoLa Fault: {response.fault_code} - {response.fault_description}",
                    device_id=self.device_id,
                    details={"fault_code": response.fault_code, "latency_ms": latency_ms}
                )
            return response
        except asyncio.TimeoutError:
            raise DeviceTimeoutError(f"Command '{command_text}' timed out after {self.command_timeout}s", device_id=self.device_id)
        finally:
            self._pending_commands.pop(cmd_key, None)

    async def _socket_read_loop(self) -> None:
        """Continuous background task reading chunks from socket and decoding CoLa telegrams."""
        logger.debug(f"[{self.device_id}] Socket read loop started.")
        try:
            while self._is_connected and self._reader:
                try:
                    chunk = await self._reader.read(4096)
                except (ConnectionResetError, asyncio.IncompleteReadError) as e:
                    logger.warning(f"[{self.device_id}] Socket connection reset during read: {e}")
                    break
                except asyncio.CancelledError:
                    break

                if not chunk:
                    logger.warning(f"[{self.device_id}] Socket reached EOF (remote host closed connection).")
                    break

                # Feed bytes into CoLa frame decoder
                try:
                    for telegram_str in self._decoder.feed(chunk):
                        telegram = ColaParser.parse(telegram_str)
                        self._handle_incoming_telegram(telegram)
                except Exception as e:
                    logger.error(f"[{self.device_id}] Error decoding/parsing telegram chunk: {e}")

        except Exception as e:
            logger.error(f"[{self.device_id}] Unexpected error in socket read loop: {e}", exc_info=True)
        finally:
            self._is_connected = False
            logger.info(f"[{self.device_id}] Socket read loop terminated.")

    def _handle_incoming_telegram(self, telegram: ColaTelegram) -> None:
        """Route incoming telegram to either a waiting command response or the async event queue."""
        # Check if there is a pending command waiting for this response
        matched = False
        if telegram.name and telegram.name in self._pending_commands:
            fut = self._pending_commands[telegram.name]
            if not fut.done():
                fut.set_result(telegram)
                matched = True
        elif telegram.is_fault and self._pending_commands:
            # Fault answers may not have the variable name; resolve oldest pending command
            first_key = next(iter(self._pending_commands.keys()))
            fut = self._pending_commands[first_key]
            if not fut.done():
                fut.set_result(telegram)
                matched = True

        if not matched or telegram.is_event:
            # Queue for event consumers
            try:
                self.incoming_telegrams.put_nowait(telegram)
            except asyncio.QueueFull:
                logger.warning(f"[{self.device_id}] Incoming telegram queue full, dropping telegram.")

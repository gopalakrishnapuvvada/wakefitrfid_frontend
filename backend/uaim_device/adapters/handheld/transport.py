"""Transport abstraction and implementations for Handheld devices."""

import asyncio
import logging
from abc import ABC, abstractmethod
from typing import Optional
from uaim_device.core.exceptions import DeviceConnectionError

logger = logging.getLogger(__name__)


class HandheldTransport(ABC):
    """Abstract transport medium for handheld scanners (TCP, HTTP, Bluetooth, HID)."""

    def __init__(self, device_id: str) -> None:
        self.device_id = device_id
        self.incoming_data: asyncio.Queue[str] = asyncio.Queue(maxsize=5000)
        self.is_connected: bool = False

    @abstractmethod
    async def start(self) -> None:
        """Initialize transport resources."""
        pass

    @abstractmethod
    async def stop(self) -> None:
        """Release transport resources."""
        pass

    async def inject_scan(self, raw_scan: str) -> None:
        """Inject a raw scan string (useful for HTTP push, Android Intents, or testing)."""
        await self.incoming_data.put(raw_scan)


class TcpHandheldTransport(HandheldTransport):
    """Listens as a TCP server to receive scan streams pushed by Wi-Fi handheld terminals."""

    def __init__(self, device_id: str, host: str = "0.0.0.0", port: int = 9001) -> None:
        super().__init__(device_id)
        self.host = host
        self.port = port
        self._server: Optional[asyncio.Server] = None
        self._active_clients: list[asyncio.StreamWriter] = []

    async def start(self) -> None:
        try:
            self._server = await asyncio.start_server(self._handle_client, self.host, self.port)
            self.is_connected = True
            logger.info(f"[{self.device_id}] Handheld TCP listener active on {self.host}:{self.port}")
        except Exception as e:
            self.is_connected = False
            raise DeviceConnectionError(f"Failed to bind handheld TCP server on {self.host}:{self.port}: {e}", device_id=self.device_id)

    async def stop(self) -> None:
        self.is_connected = False
        if self._server:
            self._server.close()
            await self._server.wait_closed()
            self._server = None
        for writer in self._active_clients:
            try:
                writer.close()
                await writer.wait_closed()
            except Exception:
                pass
        self._active_clients.clear()
        logger.info(f"[{self.device_id}] Handheld TCP transport stopped.")

    async def _handle_client(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        addr = writer.get_extra_info("peername")
        logger.info(f"[{self.device_id}] Handheld client connected from {addr}")
        self._active_clients.append(writer)
        try:
            while self.is_connected:
                line = await reader.readline()
                if not line:
                    break
                decoded = line.decode("utf-8", errors="ignore").strip()
                if decoded:
                    await self.incoming_data.put(decoded)
        except Exception as e:
            logger.warning(f"[{self.device_id}] Handheld client {addr} connection error: {e}")
        finally:
            if writer in self._active_clients:
                self._active_clients.remove(writer)
            try:
                writer.close()
                await writer.wait_closed()
            except Exception:
                pass
            logger.info(f"[{self.device_id}] Handheld client {addr} disconnected.")


class HttpHandheldTransport(HandheldTransport):
    """Transport receiving scans directly via HTTP REST push / Android intents."""

    async def start(self) -> None:
        self.is_connected = True
        logger.info(f"[{self.device_id}] Handheld HTTP push receiver ready.")

    async def stop(self) -> None:
        self.is_connected = False


class HidHandheldTransport(HandheldTransport):
    """Transport representing keyboard wedge / USB HID emulation."""

    async def start(self) -> None:
        self.is_connected = True
        logger.info(f"[{self.device_id}] Handheld HID wedge receiver ready.")

    async def stop(self) -> None:
        self.is_connected = False



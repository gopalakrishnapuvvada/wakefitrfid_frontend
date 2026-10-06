"""WebSocket event streaming manager for real-time UI and external consumers."""

import asyncio
import json
import logging
from typing import Optional
from fastapi import WebSocket, WebSocketDisconnect
from uaim_device.core.events import IdentificationEvent
from uaim_device.processing.dispatcher import EventConsumer

logger = logging.getLogger(__name__)


class WebSocketManager(EventConsumer):
    """Manages connected WebSocket clients and broadcasts normalized identification events."""

    def __init__(self) -> None:
        self.active_connections: list[WebSocket] = []
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self.active_connections.append(websocket)
        logger.info(f"WebSocket client connected. Total active: {len(self.active_connections)}")

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            if websocket in self.active_connections:
                self.active_connections.remove(websocket)
        logger.info(f"WebSocket client disconnected. Total active: {len(self.active_connections)}")

    async def broadcast_json(self, data: dict) -> None:
        async with self._lock:
            clients = list(self.active_connections)

        if not clients:
            return

        dead_connections = []
        payload_str = json.dumps(data)

        for client in clients:
            try:
                await client.send_text(payload_str)
            except Exception as e:
                logger.debug(f"Failed to send to WebSocket client: {e}")
                dead_connections.append(client)

        if dead_connections:
            async with self._lock:
                for dead in dead_connections:
                    if dead in self.active_connections:
                        self.active_connections.remove(dead)

    async def consume(self, event: IdentificationEvent) -> None:
        """Implements EventConsumer interface to broadcast events automatically."""
        # Convert event to JSON-friendly dict
        payload = {
            "type": "IDENTIFICATION_EVENT",
            "event": {
                "event_id": event.event_id,
                "device_id": event.device_id,
                "device_type": event.device_type.value,
                "vendor": event.vendor,
                "model": event.model,
                "event_type": event.event_type.value,
                "identifier_type": event.identifier_type.value,
                "identifier": event.identifier,
                "timestamp": event.timestamp.isoformat(),
                "rssi": event.rssi,
                "antenna_id": event.antenna_id,
                "read_cycle_id": event.read_cycle_id,
                "station_id": event.station_id,
                "metadata": event.metadata,
            }
        }
        await self.broadcast_json(payload)


# Singleton WebSocket manager
WS_MANAGER = WebSocketManager()

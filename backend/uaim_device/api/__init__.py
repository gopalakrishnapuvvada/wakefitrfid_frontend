"""UAIM API Package."""

from uaim_device.api.routes import router
from uaim_device.api.websocket import WS_MANAGER, WebSocketManager

__all__ = ["router", "WS_MANAGER", "WebSocketManager"]

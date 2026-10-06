"""Health monitoring and diagnostics tracker for device adapters."""

from datetime import datetime, timezone
from typing import Any, Optional
from uaim_device.core.models import DeviceHealth, DeviceState


class HealthMonitor:
    """Maintains real-time operational statistics and diagnostic health for a device."""

    def __init__(self, device_id: str) -> None:
        self.device_id = device_id
        self._connected: bool = False
        self._operational: bool = False
        self._state: DeviceState = DeviceState.DISCONNECTED
        self._started_at: Optional[datetime] = None
        self._connected_at: Optional[datetime] = None
        self._last_message_at: Optional[datetime] = None
        self._last_identification_at: Optional[datetime] = None
        self._reconnect_count: int = 0
        self._total_events: int = 0
        self._total_unique_identifications: int = 0
        self._last_error: Optional[str] = None
        self._last_latency_ms: Optional[float] = None
        self._custom_details: dict[str, Any] = {}

    def on_connected(self) -> None:
        self._connected = True
        self._connected_at = datetime.now(timezone.utc)
        self._state = DeviceState.CONNECTED
        self._last_error = None

    def on_running(self) -> None:
        self._operational = True
        self._state = DeviceState.RUNNING

    def on_disconnected(self) -> None:
        self._connected = False
        self._operational = False
        self._state = DeviceState.DISCONNECTED

    def on_error(self, error_message: str) -> None:
        self._operational = False
        self._last_error = error_message
        self._state = DeviceState.ERROR

    def on_reconnecting(self) -> None:
        self._reconnect_count += 1
        self._connected = False
        self._operational = False
        self._state = DeviceState.RECONNECTING

    def record_message(self, latency_ms: Optional[float] = None) -> None:
        self._last_message_at = datetime.now(timezone.utc)
        self._total_events += 1
        if latency_ms is not None:
            self._last_latency_ms = round(latency_ms, 2)

    def record_identification(self, is_unique: bool = True) -> None:
        self._last_identification_at = datetime.now(timezone.utc)
        if is_unique:
            self._total_unique_identifications += 1

    def set_detail(self, key: str, value: Any) -> None:
        self._custom_details[key] = value

    def get_health(self) -> DeviceHealth:
        """Compute the current snapshot of device health."""
        now = datetime.now(timezone.utc)
        uptime = 0.0
        if self._connected and self._connected_at:
            uptime = (now - self._connected_at).total_seconds()

        return DeviceHealth(
            device_id=self.device_id,
            connected=self._connected,
            operational=self._operational,
            adapter_state=self._state,
            last_message_at=self._last_message_at,
            last_identification_at=self._last_identification_at,
            reconnect_count=self._reconnect_count,
            total_events=self._total_events,
            total_unique_identifications=self._total_unique_identifications,
            last_error=self._last_error,
            uptime_seconds=round(uptime, 1),
            latency_ms=self._last_latency_ms,
            details=self._custom_details.copy(),
        )

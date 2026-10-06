"""Core exception hierarchy for UAIM device adapters."""

from typing import Any, Optional


class DeviceAdapterError(Exception):
    """Base class for all device adapter exceptions."""

    def __init__(self, message: str, device_id: Optional[str] = None, details: Optional[dict[str, Any]] = None) -> None:
        super().__init__(message)
        self.message = message
        self.device_id = device_id
        self.details = details or {}

    def __str__(self) -> str:
        prefix = f"[{self.device_id}] " if self.device_id else ""
        return f"{prefix}{self.message}"


class DeviceConnectionError(DeviceAdapterError):
    """Raised when establishing or maintaining device connection fails."""
    pass


class DeviceTimeoutError(DeviceAdapterError):
    """Raised when an operation or command execution times out."""
    pass


class DeviceProtocolError(DeviceAdapterError):
    """Raised when framing or low-level protocol violation occurs."""
    pass


class DeviceParseError(DeviceAdapterError):
    """Raised when payload or telegram cannot be parsed into structured data."""
    pass


class DeviceConfigurationError(DeviceAdapterError):
    """Raised when device configuration is invalid or missing required parameters."""
    pass


class DeviceNotSupportedError(DeviceAdapterError):
    """Raised when requested feature, transport, or command is unsupported."""
    pass


class DeviceCommandError(DeviceAdapterError):
    """Raised when the physical device responds with an error status to a command."""
    pass

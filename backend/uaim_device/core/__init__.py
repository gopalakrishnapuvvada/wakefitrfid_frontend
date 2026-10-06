"""UAIM Device Adapter Core Package."""

from uaim_device.core.adapter import DeviceAdapter
from uaim_device.core.events import IdentificationEvent
from uaim_device.core.exceptions import (
    DeviceAdapterError,
    DeviceCommandError,
    DeviceConfigurationError,
    DeviceConnectionError,
    DeviceNotSupportedError,
    DeviceParseError,
    DeviceProtocolError,
    DeviceTimeoutError,
)
from uaim_device.core.health import HealthMonitor
from uaim_device.core.lifecycle import ConnectionStateMachine, ExponentialBackoff
from uaim_device.core.models import (
    ConnectionType,
    DeduplicationConfig,
    DeviceHealth,
    DeviceInfo,
    DeviceState,
    DeviceType,
    EventType,
    FixedRfidMode,
    FormatMode,
    HandheldInputMode,
    IdentifierType,
    OutputFormattingConfig,
    ReadCycle,
    ReconnectConfig,
    RFIDTag,
)
from uaim_device.core.registry import AdapterRegistry, register_adapter

__all__ = [
    "DeviceAdapter",
    "IdentificationEvent",
    "DeviceAdapterError",
    "DeviceCommandError",
    "DeviceConfigurationError",
    "DeviceConnectionError",
    "DeviceNotSupportedError",
    "DeviceParseError",
    "DeviceProtocolError",
    "DeviceTimeoutError",
    "HealthMonitor",
    "ConnectionStateMachine",
    "ExponentialBackoff",
    "ConnectionType",
    "DeduplicationConfig",
    "DeviceHealth",
    "DeviceInfo",
    "DeviceState",
    "DeviceType",
    "EventType",
    "FixedRfidMode",
    "HandheldInputMode",
    "FormatMode",
    "OutputFormattingConfig",
    "IdentifierType",
    "ReadCycle",
    "ReconnectConfig",
    "RFIDTag",
    "AdapterRegistry",
    "register_adapter",
]

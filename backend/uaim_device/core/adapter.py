"""Common abstract base class defining the Device Adapter contract."""

from abc import ABC, abstractmethod
from typing import Any, AsyncIterator, Optional
from uaim_device.core.events import IdentificationEvent
from uaim_device.core.models import DeviceHealth, DeviceInfo, DeviceState


class DeviceAdapter(ABC):
    """
    Vendor-agnostic interface for physical and virtual identification devices.
    
    All device-specific communication protocols (CoLa-A, TCP, Bluetooth, Serial,
    HID, Android Intents) are isolated strictly inside concrete implementations.
    """

    @property
    @abstractmethod
    def device_info(self) -> DeviceInfo:
        """Return the device configuration and metadata."""
        pass

    @property
    @abstractmethod
    def state(self) -> DeviceState:
        """Return the current lifecycle state of the adapter."""
        pass

    @abstractmethod
    async def connect(self) -> None:
        """Establish low-level communication link with the physical/virtual device."""
        pass

    @abstractmethod
    async def disconnect(self) -> None:
        """Close communication link and clean up socket/transport resources."""
        pass

    @abstractmethod
    async def start(self) -> None:
        """Start reading/polling loops and event emission."""
        pass

    @abstractmethod
    async def stop(self) -> None:
        """Stop reading loops and pause event emission without tearing down the connection."""
        pass

    @abstractmethod
    async def health(self) -> DeviceHealth:
        """Return current operational metrics and diagnostics."""
        pass

    @abstractmethod
    async def events(self) -> AsyncIterator[IdentificationEvent]:
        """Asynchronous stream of normalized IdentificationEvents."""
        pass

    @abstractmethod
    async def execute_command(self, command: str, **kwargs: Any) -> Any:
        """Execute a raw or named device command (e.g. SOPAS CoLa query, reboot, trigger)."""
        pass

"""Dynamic adapter registry for pluggable identification device adapters."""

import logging
from typing import Callable, Type
from uaim_device.core.adapter import DeviceAdapter
from uaim_device.core.exceptions import DeviceNotSupportedError
from uaim_device.core.models import DeviceInfo

logger = logging.getLogger(__name__)

AdapterFactory = Callable[[DeviceInfo], DeviceAdapter]


class AdapterRegistry:
    """Registry maintaining available DeviceAdapter implementations."""

    _adapters: dict[str, Type[DeviceAdapter] | AdapterFactory] = {}

    @classmethod
    def register(cls, name: str, adapter_cls_or_factory: Type[DeviceAdapter] | AdapterFactory) -> None:
        """Register an adapter class under a given key (e.g. 'sick_rfu630')."""
        normalized_name = name.strip().lower()
        cls._adapters[normalized_name] = adapter_cls_or_factory
        logger.info(f"Registered device adapter '{normalized_name}' -> {adapter_cls_or_factory}")

    @classmethod
    def create(cls, adapter_name: str, device_info: DeviceInfo) -> DeviceAdapter:
        """Instantiate an adapter configured with DeviceInfo."""
        normalized_name = adapter_name.strip().lower()
        if normalized_name not in cls._adapters:
            available = list(cls._adapters.keys())
            raise DeviceNotSupportedError(
                f"Adapter '{adapter_name}' is not registered. Available adapters: {available}",
                device_id=device_info.device_id
            )
        
        target = cls._adapters[normalized_name]
        return target(device_info)

    @classmethod
    def list_registered(cls) -> list[str]:
        """Return list of registered adapter type identifiers."""
        return list(cls._adapters.keys())

    @classmethod
    def clear(cls) -> None:
        """Clear all registered adapters (useful in tests)."""
        cls._adapters.clear()


def register_adapter(name: str):
    """Decorator to register an adapter class directly."""
    def decorator(cls_target: Type[DeviceAdapter]):
        AdapterRegistry.register(name, cls_target)
        return cls_target
    return decorator

"""UAIM Adapters Package.

Importing this module ensures all built-in adapters register with the AdapterRegistry.
"""

from uaim_device.adapters.handheld.adapter import HandheldAdapter
from uaim_device.adapters.sick_rfu630.adapter import SickRFU630Adapter

__all__ = [
    "SickRFU630Adapter",
    "HandheldAdapter",
]


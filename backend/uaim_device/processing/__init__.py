"""UAIM Event Processing Package."""

from uaim_device.processing.deduplicator import RFIDDeduplicator
from uaim_device.processing.dispatcher import (
    CallbackConsumer,
    EventConsumer,
    EventDispatcher,
    LoggingConsumer,
    MockKafkaConsumer,
)
from uaim_device.processing.normalizer import EventNormalizer
from uaim_device.processing.read_cycle import ReadCycleProcessor

__all__ = [
    "EventNormalizer",
    "RFIDDeduplicator",
    "ReadCycleProcessor",
    "EventDispatcher",
    "EventConsumer",
    "LoggingConsumer",
    "CallbackConsumer",
    "MockKafkaConsumer",
]

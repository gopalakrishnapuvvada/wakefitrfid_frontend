import asyncio
import logging
from typing import Optional
from uaim_device.core.adapter import DeviceAdapter
from uaim_device.core.events import IdentificationEvent
from uaim_device.core.exceptions import DeviceAdapterError
from uaim_device.core.models import DeviceHealth, DeviceInfo, DeviceState, EventType
from uaim_device.core.registry import AdapterRegistry
from uaim_device.metrics.metrics import GLOBAL_METRICS
from uaim_device.processing.deduplicator import RFIDDeduplicator
from uaim_device.processing.dispatcher import EventDispatcher, LoggingConsumer, MockKafkaConsumer
from uaim_device.processing.normalizer import EventNormalizer
from uaim_device.processing.read_cycle import ReadCycleProcessor

# Ensure all adapters are registered
import uaim_device.adapters  # noqa: F401

logger = logging.getLogger(__name__)


class DeviceManager:
    """Coordinates lifecycle of all configured device adapters and manages event processing."""

    def __init__(self) -> None:
        self.adapters: dict[str, DeviceAdapter] = {}
        self.deduplicators: dict[str, RFIDDeduplicator] = {}
        self.read_cycle_processor = ReadCycleProcessor()
        self.dispatcher = EventDispatcher()
        self.recent_events: list[IdentificationEvent] = []
        self._max_recent_events: int = 500
        self._adapter_event_tasks: dict[str, asyncio.Task] = {}
        self._is_running: bool = False
        self._lock = asyncio.Lock()

        # Wire default base consumers (WebSocket is attached at API layer)
        self.dispatcher.add_consumer(LoggingConsumer())
        self.dispatcher.add_consumer(MockKafkaConsumer())

    def register_device(self, adapter_key: str, device_info: DeviceInfo) -> DeviceAdapter:
        """Create and register an adapter instance for a device."""
        adapter = AdapterRegistry.create(adapter_key, device_info)
        self.adapters[device_info.device_id] = adapter
        self.deduplicators[device_info.device_id] = RFIDDeduplicator(device_info.deduplication)
        logger.info(f"Registered device '{device_info.device_id}' ({device_info.name}) with adapter '{adapter_key}'")
        return adapter

    def get_adapter(self, device_id: str) -> DeviceAdapter:
        if device_id not in self.adapters:
            raise DeviceAdapterError(f"Device '{device_id}' not found", device_id=device_id)
        return self.adapters[device_id]

    def list_devices(self) -> list[DeviceInfo]:
        return [adapter.device_info for adapter in self.adapters.values()]

    async def start_all(self) -> None:
        """Start all configured and enabled adapters and begin pipeline processing."""
        self._is_running = True
        for dev_id, adapter in self.adapters.items():
            if adapter.device_info.enabled:
                try:
                    await adapter.start()
                    GLOBAL_METRICS.record_connected(dev_id)
                    # Spawn event consumption worker for this adapter
                    task = asyncio.create_task(self._consume_adapter_events(adapter), name=f"EventPump-{dev_id}")
                    self._adapter_event_tasks[dev_id] = task
                except Exception as e:
                    logger.error(f"Failed to start adapter {dev_id}: {e}")
                    GLOBAL_METRICS.record_connection_error(dev_id)

    async def stop_all(self) -> None:
        """Stop all adapters and cancel pipeline workers."""
        self._is_running = False
        for dev_id, task in self._adapter_event_tasks.items():
            if not task.done():
                task.cancel()
        self._adapter_event_tasks.clear()

        for dev_id, adapter in self.adapters.items():
            try:
                await adapter.disconnect()
                GLOBAL_METRICS.record_disconnected(dev_id)
            except Exception as e:
                logger.error(f"Error stopping adapter {dev_id}: {e}")

    async def _consume_adapter_events(self, adapter: DeviceAdapter) -> None:
        """Consumes raw events from adapter, normalizes, deduplicates, processes read cycles, and dispatches."""
        dev_id = adapter.device_info.device_id
        deduplicator = self.deduplicators.get(dev_id, RFIDDeduplicator(adapter.device_info.deduplication))

        try:
            async for raw_event in adapter.events():
                if not self._is_running:
                    break

                # 1. Normalization & Commissioning Rules
                event = EventNormalizer.normalize(raw_event, adapter.device_info.formatting)
                if event is None:
                    continue  # Filtered by RSSI threshold or EPC mask

                # 2. Lifecycle / Non-ID Events pass directly
                if event.event_type != EventType.IDENTIFICATION:
                    await self._record_and_dispatch(event)
                    continue

                # 3. Read Cycle Processing (Aggregates tags into active read cycle if open)
                cycle_summary = self.read_cycle_processor.process_event(event)
                if cycle_summary:
                    GLOBAL_METRICS.record_read_cycle(
                        dev_id,
                        cycle_summary.metadata.get("total_unique_tags", 0)
                    )
                    await self._record_and_dispatch(cycle_summary)

                # 4. Standalone Event Stream Deduplication
                is_unique = deduplicator.is_unique(event)
                if not is_unique:
                    GLOBAL_METRICS.record_identification(dev_id, is_duplicate=True)
                    continue

                GLOBAL_METRICS.record_identification(dev_id, is_duplicate=False)

                # 5. Dispatch normalized unique event
                await self._record_and_dispatch(event)

        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"[{dev_id}] Event processing loop error: {e}", exc_info=True)

    async def _record_and_dispatch(self, event: IdentificationEvent) -> None:
        """Store in circular buffer and broadcast to consumers."""
        self.recent_events.append(event)
        if len(self.recent_events) > self._max_recent_events:
            self.recent_events.pop(0)

        await self.dispatcher.dispatch(event)

    async def get_all_health(self) -> dict[str, DeviceHealth]:
        health_map = {}
        for dev_id, adapter in self.adapters.items():
            health_map[dev_id] = await adapter.health()
        return health_map


# Global device manager singleton
GLOBAL_DEVICE_MANAGER = DeviceManager()

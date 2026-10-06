"""RFID Read Cycle and Reading Gate aggregation processor."""

from datetime import datetime, timezone
import logging
from typing import Optional
from uaim_device.core.events import IdentificationEvent
from uaim_device.core.models import DeviceType, EventType, IdentifierType, ReadCycle, RFIDTag

logger = logging.getLogger(__name__)


class ReadCycleProcessor:
    """
    Aggregates individual tag observations into a unified physical Read Cycle.
    
    Treats an entire pallet or carton passing through an RFID gate as a single
    traceable operational unit rather than hundreds of raw tag events.
    """

    def __init__(self, default_timeout_sec: float = 10.0) -> None:
        self.default_timeout_sec = default_timeout_sec
        self._active_cycles: dict[str, ReadCycle] = {}  # device_id -> ReadCycle
        self._completed_cycles: list[ReadCycle] = []

    def start_cycle(self, device_id: str, cycle_id: str, station_id: Optional[str] = None) -> ReadCycle:
        """Explicitly begin a new reading cycle."""
        now = datetime.now(timezone.utc)
        cycle = ReadCycle(
            cycle_id=cycle_id,
            device_id=device_id,
            station_id=station_id,
            started_at=now,
            status="OPEN",
        )
        self._active_cycles[device_id] = cycle
        logger.info(f"[{device_id}] Read cycle started: {cycle_id}")
        return cycle

    def get_active_cycle(self, device_id: str) -> Optional[ReadCycle]:
        return self._active_cycles.get(device_id)

    def process_event(self, event: IdentificationEvent) -> Optional[IdentificationEvent]:
        """
        Incorporate an event into the current active read cycle if one is open.
        
        Returns an aggregated completion event if this event marks cycle completion.
        """
        if event.event_type == EventType.READ_CYCLE_STARTED:
            cid = event.read_cycle_id or f"RC-{int(datetime.now(timezone.utc).timestamp())}"
            self.start_cycle(event.device_id, cid, event.station_id)
            return None

        if event.event_type == EventType.READ_CYCLE_COMPLETED:
            return self.complete_cycle(event.device_id)

        # Record identification tag into open cycle
        cycle = self._active_cycles.get(event.device_id)
        if cycle and cycle.status == "OPEN":
            # Check if tag already exists in cycle
            existing = next((t for t in cycle.tags if t.epc == event.identifier), None)
            if existing:
                existing.read_count += 1
                if event.rssi is not None and (existing.rssi is None or event.rssi > existing.rssi):
                    existing.rssi = event.rssi  # Keep peak RSSI
            else:
                tag = RFIDTag(
                    epc=event.identifier,
                    tid=event.metadata.get("tid"),
                    user_memory=event.metadata.get("user_memory"),
                    antenna_id=event.antenna_id,
                    rssi=event.rssi,
                    timestamp=event.timestamp,
                    metadata=event.metadata,
                )
                cycle.tags.append(tag)
                cycle.total_unique_tags += 1
            
            cycle.total_observations += 1
            event.read_cycle_id = cycle.cycle_id

        return None

    def complete_cycle(self, device_id: str, status: str = "COMPLETED") -> Optional[IdentificationEvent]:
        """Close the active read cycle for a device and emit a summary event."""
        cycle = self._active_cycles.pop(device_id, None)
        if not cycle:
            return None

        cycle.ended_at = datetime.now(timezone.utc)
        cycle.status = status
        self._completed_cycles.append(cycle)
        if len(self._completed_cycles) > 100:
            self._completed_cycles.pop(0)

        duration_ms = (cycle.ended_at - cycle.started_at).total_seconds() * 1000.0
        logger.info(f"[{device_id}] Read cycle {cycle.cycle_id} finished: {cycle.total_unique_tags} unique tags ({cycle.total_observations} reads) in {duration_ms:.1f}ms")

        # Create summary identification event
        summary_event = IdentificationEvent(
            device_id=device_id,
            device_type=DeviceType.RFID_FIXED,
            vendor="UAIM",
            model="ReadCycleEngine",
            event_type=EventType.READ_CYCLE_COMPLETED,
            identifier_type=IdentifierType.RFID_EPC,
            identifier=cycle.cycle_id,
            read_cycle_id=cycle.cycle_id,
            station_id=cycle.station_id,
            metadata={
                "status": status,
                "duration_ms": duration_ms,
                "total_unique_tags": cycle.total_unique_tags,
                "total_observations": cycle.total_observations,
                "epc_list": [t.epc for t in cycle.tags if t.epc],
            }
        )
        return summary_event

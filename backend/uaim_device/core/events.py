"""Standardized identification event models for UAIM."""

import uuid
from datetime import datetime, timezone
from typing import Any, Optional
from pydantic import BaseModel, ConfigDict, Field
from uaim_device.core.models import DeviceType, EntityType, EventType, IdentifierType, ReaderMode


class IdentificationEvent(BaseModel):
    """Vendor-neutral identification event model consumed across UAIM."""
    event_id: str = Field(default_factory=lambda: f"EVT-{uuid.uuid4().hex[:12].upper()}")
    device_id: str
    device_type: DeviceType
    vendor: str
    model: str
    event_type: EventType = EventType.IDENTIFICATION
    identifier_type: IdentifierType
    identifier: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    rssi: Optional[float] = None
    antenna_id: Optional[int] = None
    read_cycle_id: Optional[str] = None
    station_id: Optional[str] = None
    
    # Handheld & Keyboard Wedge Classification Context
    reader_mode: Optional[ReaderMode] = None
    source: Optional[str] = None          # "RFID", "QR", "BARCODE", "UNKNOWN"
    entity_type: Optional[EntityType] = None  # MATERIAL, WORK_ORDER, UNKNOWN
    input_method: str = "KEYBOARD_WEDGE"  # KEYBOARD_WEDGE, ETHERNET_COLA, TCP_STREAM
    diagnostic_warning: Optional[str] = None
    raw_payload: Optional[str] = None
    
    metadata: dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(extra="ignore")

    def to_summary_dict(self) -> dict[str, Any]:
        """Compact dictionary format for telemetry and quick logs."""
        return {
            "event_id": self.event_id,
            "device_id": self.device_id,
            "type": self.identifier_type.value,
            "id": self.identifier,
            "entity": self.entity_type.value if self.entity_type else None,
            "source": self.source,
            "mode": self.reader_mode.value if self.reader_mode else None,
            "rssi": self.rssi,
            "ant": self.antenna_id,
            "cycle": self.read_cycle_id,
            "warning": self.diagnostic_warning,
            "ts": self.timestamp.isoformat(),
        }

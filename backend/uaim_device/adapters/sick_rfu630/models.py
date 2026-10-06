"""Data models and configuration for the SICK RFU630 adapter."""

from typing import Optional
from pydantic import BaseModel, ConfigDict, Field
from uaim_device.core.models import RFIDTag


class SickRFU630Config(BaseModel):
    """Specific configuration parameters for SICK RFU630."""
    host: str = "192.168.10.50"
    port: int = Field(default=2111, ge=1, le=65535, description="CoLa-A TCP Host Port (typically 2111/2112)")
    heartbeat_interval_sec: float = Field(default=5.0, ge=0.5, description="Interval for keepalive DeviceIdent polls")
    command_timeout_sec: float = Field(default=3.0, ge=0.5, description="Max time to wait for CoLa command response")
    auto_start_on_connect: bool = True
    enable_heartbeat: bool = True
    raw_logging: bool = Field(default=False, description="Log raw telegram hex/ASCII at DEBUG level")

    model_config = ConfigDict(extra="ignore")


class SickReadResult(BaseModel):
    """Structured RFID read result parsed from SICK RFU630 output."""
    device_id: str
    cycle_id: Optional[str] = None
    tags: list[RFIDTag] = Field(default_factory=list)
    raw_content: str = ""

    model_config = ConfigDict(extra="ignore")

"""Models and configuration for CipherLab RS38 (AS38N8RF4NSG1) Handheld Device."""

from enum import Enum
from typing import Any, Optional
from pydantic import BaseModel, ConfigDict, Field


class HandheldTransportType(str, Enum):
    """Supported physical/network transports for CipherLab RS38 Android Computer."""
    TCP = "TCP"            # Software Reader / DataWedge raw socket stream over Wi-Fi
    HTTP = "HTTP"          # Webhook / REST Push from CipherLab Android Application
    HID = "HID"            # USB / Bluetooth Keyboard Wedge emulation
    BLUETOOTH = "BLUETOOTH"
    INTENT = "INTENT"      # Android Intent Broadcast Forwarder



class HandheldConfig(BaseModel):
    """Configuration model for CipherLab RS38 Handheld Mobile Computer."""
    transport_type: HandheldTransportType = HandheldTransportType.TCP
    host: str = "0.0.0.0"
    port: int = Field(default=9001, ge=1, le=65535, description="Server listen port for CipherLab data stream")
    auth_token: Optional[str] = None
    default_identifier_type: str = "RFID_EPC"  # RFID_EPC, BARCODE, QR_CODE
    device_model: str = "AS38N8RF4NSG1"
    vendor: str = "CipherLab"

    model_config = ConfigDict(extra="ignore")

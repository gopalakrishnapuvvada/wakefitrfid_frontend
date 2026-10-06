"""Core models and enumerations for the UAIM Device Adapter Framework."""

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional
from pydantic import BaseModel, ConfigDict, Field


class DeviceType(str, Enum):
    """Supported identification device categories."""
    RFID_FIXED = "RFID_FIXED"
    RFID_HANDHELD = "RFID_HANDHELD"
    BARCODE_HANDHELD = "BARCODE_HANDHELD"
    BARCODE_FIXED = "BARCODE_FIXED"


class ConnectionType(str, Enum):
    """Transport / connection medium."""
    ETHERNET = "ETHERNET"
    TCP = "TCP"
    BLUETOOTH = "BLUETOOTH"
    USB = "USB"
    HID = "HID"
    HID_KEYBOARD = "HID_KEYBOARD"
    USB_HID = "USB_HID"
    HTTP = "HTTP"
    INTENT = "INTENT"
    SERIAL = "SERIAL"


class DeviceState(str, Enum):
    """Explicit connection lifecycle states."""
    DISCONNECTED = "DISCONNECTED"
    CONNECTING = "CONNECTING"
    CONNECTED = "CONNECTED"
    RUNNING = "RUNNING"
    STOPPING = "STOPPING"
    ERROR = "ERROR"
    RECONNECTING = "RECONNECTING"


class ReaderMode(str, Enum):
    """Contextual reader operational mode for multi-modal handheld scanners."""
    UNKNOWN = "UNKNOWN"
    RFID = "RFID"
    BARCODE = "BARCODE"


class EntityType(str, Enum):
    """Authoritative business entity classification."""
    MATERIAL = "MATERIAL"
    WORK_ORDER = "WORK_ORDER"
    UNKNOWN = "UNKNOWN"


class IdentifierType(str, Enum):
    """Type of payload identified."""
    RFID_EPC = "RFID_EPC"
    RFID_TID = "RFID_TID"
    BARCODE = "BARCODE"
    QR_CODE = "QR_CODE"
    MATERIAL_QR = "MATERIAL_QR"
    WORK_ORDER_QR = "WORK_ORDER_QR"
    DATAMATRIX = "DATAMATRIX"
    UNKNOWN_SCAN = "UNKNOWN_SCAN"


class EventType(str, Enum):
    """Event classification emitted by adapters and processors."""
    IDENTIFICATION = "IDENTIFICATION"
    READ_CYCLE_STARTED = "READ_CYCLE_STARTED"
    READ_CYCLE_COMPLETED = "READ_CYCLE_COMPLETED"
    DEVICE_CONNECTED = "DEVICE_CONNECTED"
    DEVICE_DISCONNECTED = "DEVICE_DISCONNECTED"
    DEVICE_ERROR = "DEVICE_ERROR"
    HEARTBEAT = "HEARTBEAT"
    TAG_WRITTEN = "TAG_WRITTEN"
    TAG_WRITE_FAILED = "TAG_WRITE_FAILED"
    UNKNOWN_SCAN = "UNKNOWN_SCAN"
    MODE_CHANGED = "MODE_CHANGED"


# === COMMISSIONING & OPERATION MODES ===

class FixedRfidMode(str, Enum):
    """Operational scan trigger mode for Fixed RFID Readers (SICK RFU630)."""
    AUTOSCAN = "AUTOSCAN"          # Continuous Autonomous Scan
    EVENT_BASED = "EVENT_BASED"    # Triggered by Gate / Photoeye / Software Start-Stop


class HandheldInputMode(str, Enum):
    """Input acquisition mode for Handheld RFID and Barcode/QR readers."""
    KEYSTROKE_EMULATION = "KEYSTROKE_EMULATION"  # USB / BT HID Wedge (Operator pulls trigger)
    WEBSOCKET_PUSH = "WEBSOCKET_PUSH"            # Handheld pushes directly via WebSocket
    TCP_STREAM = "TCP_STREAM"                    # Network socket listener (DataWedge IP)
    HTTP_WEBHOOK = "HTTP_WEBHOOK"                # REST HTTP Post from Android App


class FormatMode(str, Enum):
    """Output string normalization and transformation format."""
    RAW = "RAW"                      # Exact raw string without modification
    HEX_CLEAN = "HEX_CLEAN"          # Uppercase, stripped whitespace/hyphens
    ASCII_DECODED = "ASCII_DECODED"  # Converts Hex EPC into ASCII text if printable
    JSON_WRAPPED = "JSON_WRAPPED"    # Formats payload as JSON object


class OutputFormattingConfig(BaseModel):
    """Commissioning parameters for payload formatting, prefix/suffix, and zone filtering."""
    format_mode: FormatMode = FormatMode.HEX_CLEAN
    prefix: str = Field(default="", description="Optional prefix added to identifier (e.g. 'WF-MAT-')")
    suffix: str = Field(default="", description="Optional suffix added to identifier (e.g. '-OK')")
    strip_prefix: str = Field(default="", description="Prefix to strip from raw scan (e.g. 'QR:')")
    epc_filter_prefix: str = Field(default="", description="Only accept tags starting with this hex prefix (e.g. 'E200')")
    min_rssi_dbm: Optional[float] = Field(default=None, description="RSSI cutoff: ignore tags weaker than this dBm (e.g. -70.0)")
    target_antennas: list[int] = Field(default_factory=lambda: [1, 2, 3, 4], description="Active antenna ports enabled")

    model_config = ConfigDict(extra="ignore")


class ReconnectConfig(BaseModel):
    """Exponential backoff reconnect parameters."""
    enabled: bool = True
    initial_delay: float = Field(default=1.0, ge=0.1, description="Initial retry delay in seconds")
    max_delay: float = Field(default=30.0, ge=1.0, description="Max retry backoff in seconds")
    backoff_factor: float = Field(default=2.0, ge=1.0, description="Exponential multiplier")
    jitter: bool = Field(default=True, description="Add small randomized jitter to prevent thundering herds")


class DeduplicationConfig(BaseModel):
    """Sliding-window tag deduplication settings."""
    enabled: bool = True
    window_ms: int = Field(default=500, ge=0, description="Deduplication window in milliseconds")
    key_fields: list[str] = Field(
        default_factory=lambda: ["device_id", "identifier", "read_cycle_id"],
        description="Fields combined to produce unique deduplication hash"
    )
    include_antenna: bool = Field(default=False, description="Whether antenna_id is part of the dedup key")


class QrClassificationConfig(BaseModel):
    """Configurable prefix rules for 2D QR business classification."""
    material_prefixes: list[str] = Field(default_factory=lambda: ["100"], description="Prefixes denoting MATERIAL QR codes")
    work_order_prefixes: list[str] = Field(default_factory=lambda: ["200", "400"], description="Prefixes denoting WORK_ORDER QR codes")

    model_config = ConfigDict(extra="ignore")


class ClassificationConfig(BaseModel):
    """Business classification rules."""
    qr: QrClassificationConfig = Field(default_factory=QrClassificationConfig)
    rfid_hex_validation: bool = Field(default=True, description="Enforce hexadecimal string validation on RFID EPC scans")
    unknown_policy: str = Field(default="diagnostic", description="Policy for unrecognized scans: 'diagnostic' or 'strict'")

    model_config = ConfigDict(extra="ignore")


class ScannerWedgeConfig(BaseModel):
    """Configuration for CipherLab RS38 Keyboard-Wedge emulation."""
    enabled: bool = True
    input_mode: str = "keyboard_wedge"
    rfid_prefix: str = Field(default="\x1E", description="RFID start control prefix (RS = ASCII 0x1E = 30)")
    qr_prefix: str = Field(default="\x1D", description="QR start control prefix (GS = ASCII 0x1D = 29)")
    terminator: str = Field(default="\x0D", description="Scan terminator (ENTER = ASCII 0x0D = 13)")
    inter_key_timeout_ms: int = Field(default=50, ge=5, le=1000, description="Max delay between scanner keystrokes in ms")
    max_scan_length: int = Field(default=512, ge=8, le=4096, description="Max allowed length of a scan buffer")
    mode_detection_enabled: bool = Field(default=True, description="Enable physical trigger mode event tracking")
    strict_mode_validation: bool = Field(default=False, description="Whether to reject scans that mismatch reader mode")
    classification: ClassificationConfig = Field(default_factory=ClassificationConfig)

    model_config = ConfigDict(extra="ignore")


class DeviceInfo(BaseModel):
    """Vendor-agnostic device metadata model."""
    device_id: str = Field(..., description="Unique system identifier for the device (e.g. RFID-001, RS38-001)")
    name: str = Field(default="Identification Device", description="Human-readable device name")
    device_type: DeviceType = DeviceType.RFID_FIXED
    vendor: str = Field(default="Generic", description="Device manufacturer (e.g. SICK, Zebra, CipherLab)")
    model: str = Field(default="Device", description="Device model string (e.g. RFU630, RS38)")
    firmware_version: Optional[str] = None
    connection_type: ConnectionType = ConnectionType.ETHERNET
    host: Optional[str] = None
    port: Optional[int] = None
    station_id: Optional[str] = Field(None, description="Logical station / gate ID")
    enabled: bool = True
    
    # Device Operation Modes
    fixed_mode: FixedRfidMode = FixedRfidMode.AUTOSCAN
    handheld_mode: HandheldInputMode = HandheldInputMode.KEYSTROKE_EMULATION
    
    # Output Formatting & Commissioning
    formatting: OutputFormattingConfig = Field(default_factory=OutputFormattingConfig)
    
    # Reliability & Filtering
    reconnect: ReconnectConfig = Field(default_factory=ReconnectConfig)
    deduplication: DeduplicationConfig = Field(default_factory=DeduplicationConfig)
    scanner: ScannerWedgeConfig = Field(default_factory=ScannerWedgeConfig)
    configuration: dict[str, Any] = Field(default_factory=dict, description="Vendor-specific settings")

    model_config = ConfigDict(extra="ignore")


class DeviceHealth(BaseModel):
    """Standardized device operational health snapshot."""
    device_id: str
    connected: bool
    operational: bool
    adapter_state: DeviceState
    last_message_at: Optional[datetime] = None
    last_identification_at: Optional[datetime] = None
    reconnect_count: int = 0
    total_events: int = 0
    total_unique_identifications: int = 0
    last_error: Optional[str] = None
    uptime_seconds: float = 0.0
    latency_ms: Optional[float] = None
    details: dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(extra="ignore")


class RFIDTag(BaseModel):
    """Structured RFID tag observation data."""
    epc: Optional[str] = None
    tid: Optional[str] = None
    user_memory: Optional[str] = None
    antenna_id: Optional[int] = None
    rssi: Optional[float] = None
    read_count: int = 1
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    metadata: dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(extra="ignore")


class ReadCycle(BaseModel):
    """Represents a discrete RFID gate / reading cycle."""
    cycle_id: str
    device_id: str
    station_id: Optional[str] = None
    started_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    ended_at: Optional[datetime] = None
    tags: list[RFIDTag] = Field(default_factory=list)
    total_unique_tags: int = 0
    total_observations: int = 0
    status: str = "OPEN"  # OPEN, COMPLETED, TIMEOUT, CANCELLED
    metadata: dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(extra="ignore")

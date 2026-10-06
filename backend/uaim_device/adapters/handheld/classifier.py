"""Authoritative business classification engine for CipherLab RS38 Keyboard-Wedge scans."""

from dataclasses import dataclass, field
from datetime import datetime, timezone
import logging
import re
from typing import Any, Optional
from uaim_device.core.models import (
    ClassificationConfig,
    EntityType,
    IdentifierType,
    ReaderMode,
)

logger = logging.getLogger(__name__)

# Standard ASCII Control Characters for RS38 Keyboard Emulation
ETX_CHAR = "\x03"  # ASCII 0x03 (End of Text)    -> RFID start prefix
STX_CHAR = "\x02"  # ASCII 0x02 (Start of Text)  -> 2D QR start prefix
RS_CHAR = "\x1E"   # ASCII 0x1E (Record Separator) -> Alternative RFID prefix
GS_CHAR = "\x1D"   # ASCII 0x1D (Group Separator)  -> Alternative QR prefix
CR_CHAR = "\x0D"   # ASCII 0x0D (Carriage Return)  -> Scan terminator (ENTER)
LF_CHAR = "\x0A"   # ASCII 0x0A (Line Feed)

# Runtime assertion verifying exact ASCII control byte values
assert ord(ETX_CHAR) == 3, "ETX_CHAR must be ASCII 0x03 (3)"
assert ord(STX_CHAR) == 2, "STX_CHAR must be ASCII 0x02 (2)"
assert ord(RS_CHAR) == 30, "RS_CHAR must be ASCII 0x1E (30)"
assert ord(GS_CHAR) == 29, "GS_CHAR must be ASCII 0x1D (29)"
assert ord(CR_CHAR) == 13, "CR_CHAR must be ASCII 0x0D (13)"

HEX_EPC_PATTERN = re.compile(r"^[0-9A-Fa-f]{8,128}$")


@dataclass
class ClassificationResult:
    """Deterministic, order-independent business classification of a wedge scan."""
    raw_payload: str
    clean_value: str
    source: str                          # "RFID", "QR", "UNKNOWN"
    entity_type: EntityType              # MATERIAL, WORK_ORDER, UNKNOWN
    identifier_type: IdentifierType      # RFID_EPC, MATERIAL_QR, WORK_ORDER_QR, UNKNOWN_SCAN
    inferred_mode: ReaderMode            # RFID, BARCODE, UNKNOWN
    is_valid: bool = True
    error_code: Optional[str] = None     # UNKNOWN_PREFIX, UNKNOWN_QR_PREFIX, EMPTY_SCAN, INVALID_SCAN_FORMAT
    diagnostic_warning: Optional[str] = None
    metadata: dict[str, Any] = field(default_factory=dict)
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def to_dict(self) -> dict[str, Any]:
        """Convert result to JSON-serializable dictionary."""
        return {
            "raw_payload": self.raw_payload,
            "clean_value": self.clean_value,
            "source": self.source,
            "entity_type": self.entity_type.value if hasattr(self.entity_type, "value") else str(self.entity_type),
            "identifier_type": self.identifier_type.value if hasattr(self.identifier_type, "value") else str(self.identifier_type),
            "inferred_mode": self.inferred_mode.value if hasattr(self.inferred_mode, "value") else str(self.inferred_mode),
            "is_valid": self.is_valid,
            "error_code": self.error_code,
            "diagnostic_warning": self.diagnostic_warning,
            "metadata": self.metadata,
            "timestamp": self.timestamp.isoformat(),
        }


class RS38ScanClassifier:
    """
    Authoritative Business Classification Engine for CipherLab RS38.
    
    Rules:
    - ETX (0x03) / RS (0x1E) + EPC     -> Source: RFID | Entity: MATERIAL   | Type: RFID_EPC
    - STX (0x02) / GS (0x1D) + 100...  -> Source: QR   | Entity: MATERIAL   | Type: MATERIAL_QR
    - STX (0x02) / GS (0x1D) + 200...  -> Source: QR   | Entity: WORK_ORDER | Type: WORK_ORDER_QR
    - STX (0x02) / GS (0x1D) + 400...  -> Source: QR   | Entity: WORK_ORDER | Type: WORK_ORDER_QR
    - STX / GS + Other                 -> Source: QR   | Entity: UNKNOWN    | Type: UNKNOWN_SCAN (UNKNOWN_QR_PREFIX)
    - Other / Missing Prefix           -> Source: UNKNOWN | Entity: UNKNOWN | Type: UNKNOWN_SCAN (UNKNOWN_PREFIX)
    
    Scan order is completely independent and deterministic.
    """

    @classmethod
    def classify(
        cls,
        raw_scan: str,
        current_reader_mode: Optional[ReaderMode | str] = None,
        config: Optional[ClassificationConfig] = None,
    ) -> ClassificationResult:
        """
        Independently classify an incoming RS38 keyboard wedge scan.
        
        Args:
            raw_scan: The raw string received from the browser wedge buffer.
            current_reader_mode: Contextual mode from physical trigger or previous state.
            config: Optional classification configuration containing QR prefix lists.
        """
        cfg = config or ClassificationConfig()
        qr_cfg = getattr(cfg, "qr", None)
        mat_prefixes = getattr(qr_cfg, "material_prefixes", ["100"]) if qr_cfg else ["100"]
        wo_prefixes = getattr(qr_cfg, "work_order_prefixes", ["200", "400"]) if qr_cfg else ["200", "400"]
        rfid_hex_validation = getattr(cfg, "rfid_hex_validation", True)

        if current_reader_mode:
            mode_str = current_reader_mode.value if isinstance(current_reader_mode, ReaderMode) else str(current_reader_mode)
            try:
                reader_mode_enum = ReaderMode(mode_str.upper())
            except ValueError:
                reader_mode_enum = ReaderMode.UNKNOWN
        else:
            reader_mode_enum = ReaderMode.UNKNOWN

        # 1. Handle Empty Scan
        if not raw_scan or not raw_scan.strip("\x03\x02\x1e\x1d\x0d\x0a\r\n "):
            return ClassificationResult(
                raw_payload=raw_scan,
                clean_value="",
                source="UNKNOWN",
                entity_type=EntityType.UNKNOWN,
                identifier_type=IdentifierType.UNKNOWN_SCAN,
                inferred_mode=reader_mode_enum,
                is_valid=False,
                error_code="EMPTY_SCAN",
                diagnostic_warning="Empty scan payload received.",
            )

        # 2. Check for Prefix (ETX 0x03 / RS 0x1E for RFID, STX 0x02 / GS 0x1D for QR)
        has_rfid_prefix = raw_scan.startswith((ETX_CHAR, RS_CHAR))
        has_qr_prefix = raw_scan.startswith((STX_CHAR, GS_CHAR))

        # Clean the payload by stripping framing control characters, AIM symbology prefixes, Code IDs, and labels
        clean_value = raw_scan.lstrip("\x03\x02\x1e\x1d").rstrip("\x0d\x0a\r\n").strip()
        # 1. Strip bracketed control tags
        clean_value = re.sub(r"^(\[|\<|\()(STX|ETX|GS|RS|SOH|EOT|ACK|CR|LF|TAB|ENTER)(\]|\>|\))", "", clean_value, flags=re.IGNORECASE)
        clean_value = re.sub(r"(\[|\<|\()(STX|ETX|GS|RS|SOH|EOT|ACK|CR|LF|TAB|ENTER)(\]|\>|\))$", "", clean_value, flags=re.IGNORECASE)
        # 2. Strip AIM Symbology Identifiers (ISO 15424 is always ']' + 1 char symbology + 1 char modifier: e.g. ]Q3, ]Q1, ]d2, ]C1)
        clean_value = re.sub(r"^[\x1b~]?\][A-Za-z][0-9A-Za-z]", "", clean_value)
        # 3. Strip single-letter Code IDs from QR/Barcode engines (e.g. q1008899..., Q1008899...)
        clean_value = re.sub(r"^[qQ](?=(100|200|400|10|20|40|\d{6,}))", "", clean_value)
        # 4. Strip GS1 Application Identifier wrappers (e.g. (01), (10), (21), (240), (100))
        clean_value = re.sub(r"^\((01|10|21|240|100|00|90|91|92)\)", "", clean_value)
        # 5. Strip label / metadata headers (e.g. MC:, MAT:, WO:, QR:, RFID:, EPC:)
        clean_value = re.sub(r"^(MC|MAT|MATERIAL|WO|ORD|ORDER|SO|PO|WF|W/O|QR|BARCODE|RFID|EPC|TID)[:\-_ \t]+", "", clean_value, flags=re.IGNORECASE)
        # 6. Strip direct MC/WO prefixes (e.g. MC100889922110 -> 100889922110, WO200776655443 -> 200776655443)
        clean_value = re.sub(r"^(MC)(?=(100|10|\d{6,}))", "", clean_value, flags=re.IGNORECASE)
        clean_value = re.sub(r"^(WO)(?=(200|400|20|40|\d{6,}))", "", clean_value, flags=re.IGNORECASE)
        clean_value = clean_value.strip("\"'` \r\n\t")

        if not clean_value:
            return ClassificationResult(
                raw_payload=raw_scan,
                clean_value="",
                source="UNKNOWN",
                entity_type=EntityType.UNKNOWN,
                identifier_type=IdentifierType.UNKNOWN_SCAN,
                inferred_mode=reader_mode_enum,
                is_valid=False,
                error_code="EMPTY_SCAN",
                diagnostic_warning="Empty scan data after stripping control prefixes.",
            )

        # 3. Case A: RFID Prefix (ETX = 0x03 or RS = 0x1E)
        if has_rfid_prefix:
            inferred_mode = ReaderMode.RFID
            prefix_label = "0x03 (ETX)" if raw_scan.startswith(ETX_CHAR) else "0x1E (RS)"
            warning = None
            if reader_mode_enum == ReaderMode.BARCODE:
                warning = f"Reader mode mismatch: Reader is in {reader_mode_enum.value} mode, but received {inferred_mode.value} scan."
                logger.warning(f"[RS38] {warning}")

            clean_epc = clean_value.replace(" ", "").upper()
            
            # Verify EPC hex format if enabled
            if rfid_hex_validation and not HEX_EPC_PATTERN.match(clean_epc):
                hex_warn = f"RFID payload is not valid hexadecimal EPC: '{clean_value}'"
                warning = f"{warning}; {hex_warn}" if warning else hex_warn
                return ClassificationResult(
                    raw_payload=raw_scan,
                    clean_value=clean_value,
                    source="RFID",
                    entity_type=EntityType.MATERIAL,
                    identifier_type=IdentifierType.RFID_EPC,
                    inferred_mode=inferred_mode,
                    is_valid=False,
                    error_code="INVALID_EPC_HEX",
                    diagnostic_warning=warning,
                    metadata={"prefix": prefix_label, "length": len(clean_value), "raw_value": clean_value},
                )

            return ClassificationResult(
                raw_payload=raw_scan,
                clean_value=clean_epc,
                source="RFID",
                entity_type=EntityType.MATERIAL,
                identifier_type=IdentifierType.RFID_EPC,
                inferred_mode=inferred_mode,
                is_valid=True,
                diagnostic_warning=warning,
                metadata={"prefix": prefix_label, "length": len(clean_epc)},
            )

        # 4. Case B: QR Prefix (STX = 0x02 or GS = 0x1D)
        if has_qr_prefix:
            inferred_mode = ReaderMode.BARCODE
            prefix_label = "0x02 (STX)" if raw_scan.startswith(STX_CHAR) else "0x1D (GS)"
            warning = None
            if reader_mode_enum == ReaderMode.RFID:
                warning = f"Reader mode mismatch: Reader is in {reader_mode_enum.value} mode, but received {inferred_mode.value} scan."
                logger.warning(f"[RS38] {warning}")

            # Check Material QR Prefixes (e.g. "100")
            if any(clean_value.startswith(p) for p in mat_prefixes):
                return ClassificationResult(
                    raw_payload=raw_scan,
                    clean_value=clean_value,
                    source="QR",
                    entity_type=EntityType.MATERIAL,
                    identifier_type=IdentifierType.MATERIAL_QR,
                    inferred_mode=inferred_mode,
                    is_valid=True,
                    diagnostic_warning=warning,
                    metadata={"prefix": prefix_label, "matched_rule": "MATERIAL_QR", "qr_prefix": clean_value[:3]},
                )

            # Check Work Order QR Prefixes (e.g. "200", "400")
            if any(clean_value.startswith(p) for p in wo_prefixes):
                return ClassificationResult(
                    raw_payload=raw_scan,
                    clean_value=clean_value,
                    source="QR",
                    entity_type=EntityType.WORK_ORDER,
                    identifier_type=IdentifierType.WORK_ORDER_QR,
                    inferred_mode=inferred_mode,
                    is_valid=True,
                    diagnostic_warning=warning,
                    metadata={"prefix": prefix_label, "matched_rule": "WORK_ORDER_QR", "qr_prefix": clean_value[:3]},
                )

            # Unrecognized QR Prefix (e.g. "300...", "ABC...")
            qr_warn = f"Unrecognized QR content prefix for payload: '{clean_value}'. Expected material ({mat_prefixes}) or work order ({wo_prefixes})."
            warning = f"{warning}; {qr_warn}" if warning else qr_warn
            return ClassificationResult(
                raw_payload=raw_scan,
                clean_value=clean_value,
                source="QR",
                entity_type=EntityType.UNKNOWN,
                identifier_type=IdentifierType.UNKNOWN_SCAN,
                inferred_mode=inferred_mode,
                is_valid=False,
                error_code="UNKNOWN_QR_PREFIX",
                diagnostic_warning=warning,
                metadata={"prefix": prefix_label, "raw_lead": clean_value[:6]},
            )

        # 5. Case C: Missing / Unknown Control Prefix
        return ClassificationResult(
            raw_payload=raw_scan,
            clean_value=clean_value,
            source="UNKNOWN",
            entity_type=EntityType.UNKNOWN,
            identifier_type=IdentifierType.UNKNOWN_SCAN,
            inferred_mode=reader_mode_enum,
            is_valid=False,
            error_code="UNKNOWN_PREFIX",
            diagnostic_warning=f"Missing required control character prefix (ETX 0x03, RS 0x1E, STX 0x02, or GS 0x1D). Raw: '{clean_value}'.",
            metadata={"raw_lead_hex": [hex(ord(c)) for c in raw_scan[:4]]},
        )

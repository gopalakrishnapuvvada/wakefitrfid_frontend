"""Parser for CipherLab RS38 (AS38N8RF4NSG1) RFID and 1D/2D Barcode scan payloads."""

import json
import logging
import re
from typing import Any, Optional
from uaim_device.adapters.handheld.classifier import (
    ETX_CHAR,
    GS_CHAR,
    RS_CHAR,
    STX_CHAR,
    ClassificationResult,
    RS38ScanClassifier,
)
from uaim_device.core.models import (
    ClassificationConfig,
    EntityType,
    IdentifierType,
    ReaderMode,
)

logger = logging.getLogger(__name__)

HEX_EPC_PATTERN = re.compile(r"^[0-9A-Fa-f]{16,64}$")


class ParsedHandheldScan:
    """Encapsulates decoded scan data from CipherLab RS38 mobile computer."""

    def __init__(
        self,
        identifier: str,
        identifier_type: IdentifierType,
        rssi: Optional[float] = None,
        antenna_id: Optional[int] = None,
        metadata: Optional[dict[str, Any]] = None,
        source: Optional[str] = None,
        entity_type: Optional[EntityType] = None,
        reader_mode: Optional[ReaderMode] = None,
        is_valid: bool = True,
        error_code: Optional[str] = None,
        diagnostic_warning: Optional[str] = None,
    ) -> None:
        self.identifier = identifier
        self.identifier_type = identifier_type
        self.rssi = rssi
        self.antenna_id = antenna_id
        self.metadata = metadata or {}
        self.source = source or ("RFID" if "RFID" in identifier_type.value else "QR" if "QR" in identifier_type.value else "BARCODE")
        self.entity_type = entity_type or EntityType.UNKNOWN
        self.reader_mode = reader_mode or ReaderMode.UNKNOWN
        self.is_valid = is_valid
        self.error_code = error_code
        self.diagnostic_warning = diagnostic_warning


class HandheldParser:
    """
    Parses multi-modal data streams emitted by CipherLab RS38 (AS38N8RF4NSG1),
    supporting Keyboard-Wedge emulation (ETX 0x03 / RS 0x1E / STX 0x02 / GS 0x1D), JSON payloads, and Key-Value pairs.
    """

    @classmethod
    def parse(
        cls,
        raw_data: str,
        default_type: str = "RFID_EPC",
        current_reader_mode: Optional[ReaderMode | str] = None,
        classification_config: Optional[ClassificationConfig] = None,
    ) -> ParsedHandheldScan:
        # 1. Primary path: RS38 Keyboard-Wedge Control Characters (ETX 0x03 / RS 0x1E / STX 0x02 / GS 0x1D)
        if raw_data.startswith((ETX_CHAR, STX_CHAR, RS_CHAR, GS_CHAR)):
            res: ClassificationResult = RS38ScanClassifier.classify(
                raw_scan=raw_data,
                current_reader_mode=current_reader_mode,
                config=classification_config,
            )
            return ParsedHandheldScan(
                identifier=res.clean_value,
                identifier_type=res.identifier_type,
                metadata=res.metadata,
                source=res.source,
                entity_type=res.entity_type,
                reader_mode=res.inferred_mode,
                is_valid=res.is_valid,
                error_code=res.error_code,
                diagnostic_warning=res.diagnostic_warning,
            )

        raw_clean = raw_data.strip("\x03\x02\x1e\x1d\x0d\x0a\r\n ")
        is_explicit_qr = raw_clean.upper().startswith("QR:")

        cleaned = raw_clean
        # 1. Strip bracketed control tags
        cleaned = re.sub(r"^(\[|\<|\()(STX|ETX|GS|RS|SOH|EOT|ACK|CR|LF|TAB|ENTER)(\]|\>|\))", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"(\[|\<|\()(STX|ETX|GS|RS|SOH|EOT|ACK|CR|LF|TAB|ENTER)(\]|\>|\))$", "", cleaned, flags=re.IGNORECASE)
        # 2. Strip AIM Symbology Identifiers (ISO 15424 is always ']' + 1 char symbology + 1 char modifier: e.g. ]Q3, ]Q1, ]d2, ]C1)
        cleaned = re.sub(r"^[\x1b~]?\][A-Za-z][0-9A-Za-z]", "", cleaned)
        # 3. Strip single-letter Code IDs from QR/Barcode engines (e.g. q1008899..., Q1008899...)
        cleaned = re.sub(r"^[qQ](?=(100|200|400|10|20|40|\d{6,}))", "", cleaned)
        # 4. Strip GS1 Application Identifier wrappers (e.g. (01), (10), (21), (240), (100))
        cleaned = re.sub(r"^\((01|10|21|240|100|00|90|91|92)\)", "", cleaned)
        # 5. Strip label / metadata headers (e.g. MC:, MAT:, WO:, QR:, RFID:, EPC:)
        cleaned = re.sub(r"^(MC|MAT|MATERIAL|WO|ORD|ORDER|SO|PO|WF|W/O|QR|BARCODE|RFID|EPC|TID)[:\-_ \t]+", "", cleaned, flags=re.IGNORECASE)
        # 6. Strip direct MC/WO prefixes (e.g. MC100889922110 -> 100889922110, WO200776655443 -> 200776655443)
        cleaned = re.sub(r"^(MC)(?=(100|10|\d{6,}))", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"^(WO)(?=(200|400|20|40|\d{6,}))", "", cleaned, flags=re.IGNORECASE)
        cleaned = cleaned.strip("\"'` \r\n\t")
        if not cleaned:
            return ParsedHandheldScan(
                identifier="",
                identifier_type=IdentifierType.UNKNOWN_SCAN,
                is_valid=False,
                error_code="EMPTY_SCAN",
                diagnostic_warning="Empty scan payload received.",
            )

        # 2. JSON Payload (e.g. from Android Intent or Webhook push)
        if cleaned.startswith("{") and cleaned.endswith("}"):
            try:
                data = json.loads(cleaned)
                raw_id = (
                    data.get("identifier")
                    or data.get("epc")
                    or data.get("barcode")
                    or data.get("qr_code")
                    or data.get("data")
                    or data.get("code")
                    or ""
                )
                detected_type = IdentifierType.RFID_EPC
                source_val = "RFID"
                entity_val = EntityType.MATERIAL
                if "barcode" in data:
                    detected_type = IdentifierType.BARCODE
                    source_val = "BARCODE"
                    entity_val = EntityType.UNKNOWN
                elif "qr" in str(data.get("type", "")).lower() or "qr_code" in data:
                    detected_type = IdentifierType.QR_CODE
                    source_val = "QR"
                    # Classify QR content by prefix
                    id_str = str(raw_id).strip()
                    if id_str.startswith("100"):
                        detected_type = IdentifierType.MATERIAL_QR
                        entity_val = EntityType.MATERIAL
                    elif id_str.startswith("200") or id_str.startswith("400"):
                        detected_type = IdentifierType.WORK_ORDER_QR
                        entity_val = EntityType.WORK_ORDER
                elif "tid" in str(data.get("type", "")).lower():
                    detected_type = IdentifierType.RFID_TID
                    source_val = "RFID"
                elif "datamatrix" in str(data.get("symbology", "")).lower():
                    detected_type = IdentifierType.DATAMATRIX
                    source_val = "BARCODE"

                rssi_val = None
                if "rssi" in data and data["rssi"] is not None:
                    try:
                        rssi_val = float(data["rssi"])
                    except ValueError:
                        pass

                ant_val = None
                if "antenna_id" in data and data["antenna_id"] is not None:
                    try:
                        ant_val = int(data["antenna_id"])
                    except ValueError:
                        pass

                return ParsedHandheldScan(
                    identifier=str(raw_id).strip(),
                    identifier_type=detected_type,
                    rssi=rssi_val,
                    antenna_id=ant_val,
                    metadata=data.get("metadata", {}),
                    source=source_val,
                    entity_type=entity_val,
                )
            except Exception as e:
                logger.debug(f"JSON parsing fallback for CipherLab handheld scan: {e}")

        # 3. Key-Value format (e.g., EPC=E200...;RSSI=-45 or BARCODE=890103...;SYMBOLOGY=Code128)
        if "=" in cleaned:
            parts = cleaned.replace(";", " ").split()
            kv = {}
            for p in parts:
                if "=" in p:
                    k, v = p.split("=", 1)
                    kv[k.upper()] = v
            epc = kv.get("EPC") or kv.get("UII")
            barcode = kv.get("BARCODE") or kv.get("CODE") or kv.get("DATA")
            rssi = float(kv["RSSI"]) if "RSSI" in kv else None

            if epc:
                return ParsedHandheldScan(
                    identifier=epc.upper(),
                    identifier_type=IdentifierType.RFID_EPC,
                    rssi=rssi,
                    metadata=kv,
                    source="RFID",
                    entity_type=EntityType.MATERIAL,
                )
            if barcode:
                b_type = IdentifierType.QR_CODE if "QR" in kv.get("TYPE", "").upper() else IdentifierType.BARCODE
                source_val = "QR" if b_type == IdentifierType.QR_CODE else "BARCODE"
                entity_val = EntityType.UNKNOWN
                if barcode.startswith("100"):
                    b_type = IdentifierType.MATERIAL_QR
                    entity_val = EntityType.MATERIAL
                elif barcode.startswith("200") or barcode.startswith("400"):
                    b_type = IdentifierType.WORK_ORDER_QR
                    entity_val = EntityType.WORK_ORDER

                return ParsedHandheldScan(
                    identifier=barcode,
                    identifier_type=b_type,
                    metadata=kv,
                    source=source_val,
                    entity_type=entity_val,
                )

        # 4. Explicit QR prefix check (e.g. 'QR:100123' or 'QR:WF-MATTRESS...')
        if is_explicit_qr or cleaned.upper().startswith("QR:"):
            val = cleaned
            entity_val = EntityType.UNKNOWN
            b_type = IdentifierType.QR_CODE
            if val.startswith("100"):
                b_type = IdentifierType.MATERIAL_QR
                entity_val = EntityType.MATERIAL
            elif val.startswith("200") or val.startswith("400"):
                b_type = IdentifierType.WORK_ORDER_QR
                entity_val = EntityType.WORK_ORDER

            return ParsedHandheldScan(
                identifier=val,
                identifier_type=b_type,
                metadata={"symbology": "QR"},
                source="QR",
                entity_type=entity_val,
            )

        # 5. Direct prefix checks for QR codes (Material Code '100...' vs Work Order '200.../400...')
        if cleaned.startswith("100"):
            return ParsedHandheldScan(
                identifier=cleaned,
                identifier_type=IdentifierType.MATERIAL_QR,
                source="QR",
                entity_type=EntityType.MATERIAL,
            )
        elif cleaned.startswith("200") or cleaned.startswith("400"):
            return ParsedHandheldScan(
                identifier=cleaned,
                identifier_type=IdentifierType.WORK_ORDER_QR,
                source="QR",
                entity_type=EntityType.WORK_ORDER,
            )

        # 6. Hex pattern match -> RFID EPC (only if not a 100/200/400 barcode)
        if HEX_EPC_PATTERN.match(cleaned) and default_type == "RFID_EPC":
            return ParsedHandheldScan(
                identifier=cleaned.upper(),
                identifier_type=IdentifierType.RFID_EPC,
                source="RFID",
                entity_type=EntityType.MATERIAL,
            )

        # 7. Default fallback
        id_type = (
            IdentifierType.RFID_EPC
            if default_type == "RFID_EPC" and HEX_EPC_PATTERN.match(cleaned)
            else IdentifierType.BARCODE
        )
        return ParsedHandheldScan(
            identifier=cleaned,
            identifier_type=id_type,
            source="RFID" if id_type == IdentifierType.RFID_EPC else "BARCODE",
            entity_type=EntityType.MATERIAL if id_type == IdentifierType.RFID_EPC else EntityType.UNKNOWN,
        )

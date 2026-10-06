"""Event normalizer for standardizing and transforming identification events."""

import binascii
from datetime import datetime, timezone
import logging
from typing import Optional
from uaim_device.core.events import IdentificationEvent
from uaim_device.core.models import FormatMode, IdentifierType, OutputFormattingConfig

logger = logging.getLogger(__name__)


class EventNormalizer:
    """
    Standardizes event formatting, timestamps, identifiers, and applies commissioning rules
    such as prefix/suffix addition, hex cleaning, ASCII translation, and signal filtering.
    """

    @classmethod
    def normalize(
        cls,
        event: IdentificationEvent,
        formatting: Optional[OutputFormattingConfig] = None
    ) -> Optional[IdentificationEvent]:
        """
        Apply uniform normalization and commissioning rules to an IdentificationEvent.
        
        Returns:
            Normalized IdentificationEvent, or None if filtered out by RSSI/EPC mask.
        """
        cfg = formatting or OutputFormattingConfig()

        # 1. Normalize Timestamp to UTC
        if event.timestamp.tzinfo is None:
            event.timestamp = event.timestamp.replace(tzinfo=timezone.utc)
        else:
            event.timestamp = event.timestamp.astimezone(timezone.utc)

        # 2. RSSI Threshold Cutoff Filtering
        if cfg.min_rssi_dbm is not None and event.rssi is not None:
            if event.rssi < cfg.min_rssi_dbm:
                logger.debug(f"[{event.device_id}] Suppressed tag {event.identifier} due to weak RSSI ({event.rssi} < {cfg.min_rssi_dbm} dBm)")
                return None

        # 3. Strip configured prefix (e.g. 'QR:')
        raw_id = event.identifier.strip()
        if cfg.strip_prefix and raw_id.startswith(cfg.strip_prefix):
            raw_id = raw_id[len(cfg.strip_prefix):].strip()

        # 4. Apply Format Transformation
        is_rfid = event.identifier_type in (IdentifierType.RFID_EPC, IdentifierType.RFID_TID)

        if cfg.format_mode == FormatMode.HEX_CLEAN and is_rfid:
            clean_hex = raw_id.replace(" ", "").replace("-", "").upper()
            raw_id = clean_hex
        elif cfg.format_mode == FormatMode.ASCII_DECODED and is_rfid:
            try:
                # Try hex decode to ASCII
                clean_hex = raw_id.replace(" ", "").replace("-", "")
                decoded_bytes = binascii.unhexlify(clean_hex)
                ascii_str = decoded_bytes.decode("ascii", errors="replace")
                if ascii_str.isprintable():
                    raw_id = ascii_str
            except Exception:
                pass
        elif not is_rfid:
            # Barcode / QR: clean non-printable control chars except spaces
            raw_id = raw_id.strip()

        # 5. EPC Prefix / Mask Filter
        if cfg.epc_filter_prefix and is_rfid:
            target_mask = cfg.epc_filter_prefix.replace(" ", "").upper()
            if not raw_id.upper().startswith(target_mask):
                logger.debug(f"[{event.device_id}] Tag {raw_id} filtered out by mask '{target_mask}'")
                return None

        # 6. Apply Commissioning Prefix & Suffix
        if cfg.prefix:
            raw_id = f"{cfg.prefix}{raw_id}"
        if cfg.suffix:
            raw_id = f"{raw_id}{cfg.suffix}"

        event.identifier = raw_id

        # 7. Standardize IDs & Metadata
        event.device_id = event.device_id.strip()
        if event.station_id:
            event.station_id = event.station_id.strip()
        if event.read_cycle_id:
            event.read_cycle_id = event.read_cycle_id.strip()

        if event.rssi is not None:
            event.rssi = round(float(event.rssi), 1)

        return event

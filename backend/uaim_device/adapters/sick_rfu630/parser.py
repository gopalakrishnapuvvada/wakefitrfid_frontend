"""Parser for SICK RFU630 RFID tag data telegrams."""

import logging
import re
from datetime import datetime, timezone
from typing import Optional
from uaim_device.adapters.sick_rfu630.cola.parser import ColaTelegram
from uaim_device.adapters.sick_rfu630.models import SickReadResult
from uaim_device.core.models import RFIDTag

logger = logging.getLogger(__name__)

# Regex for detecting 8-128 character hex EPC/TID strings
HEX_PATTERN = re.compile(r"^[0-9A-Fa-f]{8,128}$")
HEX_SEARCH = re.compile(r"[0-9A-Fa-f]{16,64}")


class SickRFU630Parser:
    """Extracts structured RFIDTag records from parsed SICK CoLa-A telegrams and raw host port streams."""

    @classmethod
    def parse_read_result(cls, telegram: ColaTelegram, device_id: str) -> SickReadResult:
        """
        Parse an incoming 'sSN ReadResult' or raw host port telegram into structured RFIDTag items.
        
        Handles:
        - SOPAS standard positional format:
            sSN ReadResult <TagCount> <EPC1> <Antenna1> <RSSI1> <Count1> ...
        - Host Data Output Port multi-tag stream:
            1;\rE280116060000204968C090F,-44\n\rE2801190A504006FA2BF55AB,-62\n
        - Delimited format:
            1,E280116060000204968C090F,-48.0,1
            E280116060000204968C090F,1,-48.0
        - Key-Value formatted tokens:
            sSN ReadResult EPC=E20034120123456789ABCDEF;ANT=1;RSSI=-48;TID=E280...
        - Single EPC or raw text line:
            E280116060000204968C090F
        """
        raw_text = (telegram.raw_content or " ".join(telegram.tokens)).strip()
        if not raw_text:
            return SickReadResult(device_id=device_id, tags=[], raw_content=telegram.raw_content)

        # 1. Check for Key=Value style tokens
        if ("=" in raw_text or ":" in raw_text) and not raw_text.startswith("sRA") and not raw_text.startswith("sRN"):
            normalized_kv = raw_text.replace(",", " ").replace("|", " ").replace(";", " ").replace("\t", " ")
            kv_tokens = normalized_kv.split()
            tags = cls._parse_kv_tokens(kv_tokens)
            if tags:
                return SickReadResult(device_id=device_id, tags=tags, raw_content=telegram.raw_content)

        # 2. Normalize delimiters: replace commas, pipes, tabs, semicolons, CR, LF with spaces
        normalized_str = (
            raw_text.replace(",", " ")
            .replace("|", " ")
            .replace(";", " ")
            .replace("\t", " ")
            .replace("\r", " ")
            .replace("\n", " ")
        )
        tokens = normalized_str.split()
        if not tokens:
            return SickReadResult(device_id=device_id, tags=[], raw_content=telegram.raw_content)

        # Strip standard CoLa header tokens if present
        while tokens and tokens[0] in ("sSN", "sRA", "sMN", "sEA", "ReadResult", "RFIOpData", "LMDscandata"):
            tokens.pop(0)

        # Filter out heartbeat tokens
        tokens = [t for t in tokens if t.upper() not in ("HEARTBEAT", "HEARTBEAT;")]
        if not tokens or (len(tokens) == 1 and tokens[0].isdigit()):
            return SickReadResult(device_id=device_id, tags=[], raw_content=telegram.raw_content)

        cycle_id: Optional[str] = None
        default_antenna = 1
        idx = 0

        # Check if first token is a Cycle ID
        if tokens[0].upper().startswith("RC") or tokens[0].upper().startswith("CYCLE"):
            cycle_id = tokens[0]
            idx += 1

        # Check if first token is leading Antenna ID (e.g., '1' from '1;...')
        if idx < len(tokens) and tokens[idx].isdigit():
            val = int(tokens[idx])
            if 1 <= val <= 16:
                default_antenna = val
                idx += 1

        remaining = tokens[idx:]
        if not remaining:
            return SickReadResult(device_id=device_id, cycle_id=cycle_id, tags=[], raw_content=telegram.raw_content)

        # Extract all tags flexibly by identifying hex EPC tokens
        tags = cls._extract_tags_from_tokens(remaining, default_antenna, raw_text)

        return SickReadResult(
            device_id=device_id,
            cycle_id=cycle_id,
            tags=tags,
            raw_content=telegram.raw_content
        )

    @classmethod
    def _extract_tags_from_tokens(cls, tokens: list[str], default_antenna: int, raw_text: str) -> list[RFIDTag]:
        """Dynamically extract RFIDTag objects from token sequence."""
        tags: list[RFIDTag] = []
        now = datetime.now(timezone.utc)
        i = 0

        while i < len(tokens):
            token = tokens[i].strip().strip("'\"[](){}").upper()

            # Check if this token is a valid hex EPC
            if HEX_PATTERN.match(token):
                epc = token
                antenna_id: Optional[int] = None
                rssi: Optional[float] = None
                read_count = 1

                # Look ahead for Antenna, RSSI, and Read Count in subsequent tokens
                j = i + 1
                while j < len(tokens) and not HEX_PATTERN.match(tokens[j].strip().strip("'\"[](){}").upper()):
                    val_str = tokens[j]
                    try:
                        num_val = float(val_str)
                        if num_val < 0 and rssi is None:
                            rssi = num_val
                        elif 1 <= num_val <= 16 and "." not in val_str and antenna_id is None and rssi is None:
                            antenna_id = int(num_val)
                        elif 1 <= num_val <= 16 and "." not in val_str and antenna_id is None and rssi is not None:
                            antenna_id = int(num_val)
                        elif num_val >= 1 and "." not in val_str:
                            read_count = int(num_val)
                    except ValueError:
                        pass
                    j += 1

                tags.append(
                    RFIDTag(
                        epc=epc,
                        antenna_id=antenna_id or default_antenna,
                        rssi=rssi,
                        read_count=max(1, read_count),
                        timestamp=now,
                        metadata={"source": "stream_token"}
                    )
                )
                i = max(i + 1, j)
            else:
                # If token is not an EPC, check if it's an antenna specifier
                if tokens[i].isdigit():
                    val = int(tokens[i])
                    if 1 <= val <= 16:
                        default_antenna = val
                i += 1

        # Fallback: scan full raw text with regex if no EPC tokens matched
        if not tags:
            for match in HEX_SEARCH.finditer(raw_text):
                found_hex = match.group().upper()
                tags.append(
                    RFIDTag(
                        epc=found_hex,
                        antenna_id=default_antenna,
                        timestamp=now,
                        metadata={"source": "raw_regex_match"}
                    )
                )

        return tags

    @classmethod
    def _parse_flexible_tokens(cls, tokens: list[str], raw_text: str) -> list[RFIDTag]:
        tags: list[RFIDTag] = []
        now = datetime.now(timezone.utc)

        for token in tokens:
            cleaned = token.strip().strip("'\"[](){}").upper()
            if HEX_PATTERN.match(cleaned):
                tags.append(
                    RFIDTag(
                        epc=cleaned,
                        timestamp=now,
                        metadata={"source": "hex_token"}
                    )
                )

        # Fallback: scan full raw text with regex if tokens did not match
        if not tags:
            for match in HEX_SEARCH.finditer(raw_text):
                found_hex = match.group().upper()
                tags.append(
                    RFIDTag(
                        epc=found_hex,
                        timestamp=now,
                        metadata={"source": "raw_regex_match"}
                    )
                )

        return tags

    @classmethod
    def _parse_kv_tokens(cls, tokens: list[str]) -> list[RFIDTag]:
        tags: list[RFIDTag] = []
        now = datetime.now(timezone.utc)
        combined = " ".join(tokens)
        entries = combined.replace(";", " ").split()

        current_epc: Optional[str] = None
        current_tid: Optional[str] = None
        current_ant: Optional[int] = None
        current_rssi: Optional[float] = None
        current_mem: Optional[str] = None

        for entry in entries:
            delimiter = "=" if "=" in entry else ":" if ":" in entry else None
            if not delimiter:
                if HEX_PATTERN.match(entry):
                    current_epc = entry.upper()
                continue

            key, val = entry.split(delimiter, 1)
            key_upper = key.strip().upper()
            val_clean = val.strip()

            if key_upper in ("EPC", "UII"):
                current_epc = val_clean.upper()
            elif key_upper == "TID":
                current_tid = val_clean.upper()
            elif key_upper in ("ANT", "ANTENNA", "ANTENNA_ID"):
                try:
                    current_ant = int(val_clean)
                except ValueError:
                    pass
            elif key_upper in ("RSSI", "SIGNAL"):
                try:
                    current_rssi = float(val_clean)
                except ValueError:
                    pass
            elif key_upper in ("MEM", "USER_MEMORY", "USER"):
                current_mem = val_clean

            if current_epc:
                tags.append(
                    RFIDTag(
                        epc=current_epc,
                        tid=current_tid,
                        user_memory=current_mem,
                        antenna_id=current_ant,
                        rssi=current_rssi,
                        timestamp=now,
                        metadata={"format": "key_value"}
                    )
                )
                current_epc, current_tid, current_ant, current_rssi, current_mem = None, None, None, None, None

        return tags

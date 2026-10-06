"""CoLa-A ASCII Telegram Parser."""

import logging
from dataclasses import dataclass, field
from typing import Optional
from uaim_device.core.exceptions import DeviceParseError

logger = logging.getLogger(__name__)

# Standard SICK CoLa Fault Codes
COLA_FAULT_CODES = {
    "0001": "Method or variable not found / unknown command",
    "0002": "Access denied / insufficient access rights",
    "0003": "Parameter error / invalid value or format",
    "0004": "Device busy / cannot execute",
    "0005": "Command failed in current operational mode",
}


@dataclass
class ColaTelegram:
    """Parsed representation of a SICK CoLa-A ASCII telegram."""
    command_type: str  # sRN, sWN, sMN, sEN, sRA, sWA, sMA, sEA, sSN, sFA
    name: Optional[str] = None  # Variable or method name (e.g. 'ReadResult', 'DeviceIdent')
    tokens: list[str] = field(default_factory=list)  # Space-separated arguments
    raw_content: str = ""
    is_fault: bool = False
    fault_code: Optional[str] = None
    fault_description: Optional[str] = None

    @property
    def is_event(self) -> bool:
        """True if this is an asynchronous event notification from reader (sSN or raw read result)."""
        return self.command_type in ("sSN", "RAW_EVENT")

    @property
    def is_read_response(self) -> bool:
        return self.command_type == "sRA"

    @property
    def is_method_response(self) -> bool:
        return self.command_type == "sMA"


class ColaParser:
    """Parses raw framed CoLa-A ASCII telegram strings into structured ColaTelegram objects."""

    @staticmethod
    def parse(telegram_str: str) -> ColaTelegram:
        """
        Parse a raw CoLa-A or host port ASCII string.
        
        Examples:
        - 'sRA DeviceIdent SICK RFU630-10000 1.20'
        - 'sSN ReadResult 1 1 E20034120123456789ABCDEF 1 -48'
        - 'sFA 0001'
        - 'sMA Run 1'
        - 'E280116060000204968C090F' (Raw EPC from Output Format 1)
        - '1,E280116060000204968C090F,-50.0' (CSV from Output Format 1)
        """
        if not telegram_str:
            raise DeviceParseError("Empty CoLa telegram string.")

        parts = telegram_str.strip().split()
        if not parts:
            raise DeviceParseError(f"Malformed CoLa telegram (no tokens): '{telegram_str}'")

        cmd_type = parts[0]

        # Handle Fault Response (sFA <ErrorCode>)
        if cmd_type == "sFA":
            fault_code = parts[1] if len(parts) > 1 else "UNKNOWN"
            desc = COLA_FAULT_CODES.get(fault_code, "Unspecified SICK fault")
            logger.warning(f"Received CoLa Fault: code={fault_code}, desc={desc}")
            return ColaTelegram(
                command_type="sFA",
                name=None,
                tokens=parts[1:],
                raw_content=telegram_str,
                is_fault=True,
                fault_code=fault_code,
                fault_description=desc,
            )

        # Standard SICK CoLa 3-letter command types: sRN, sWN, sMN, sEN, sRA, sWA, sMA, sAN, sEA, sSN
        KNOWN_COLA_TYPES = ("sRN", "sWN", "sMN", "sEN", "sRA", "sWA", "sMA", "sAN", "sEA", "sSN")
        if cmd_type in KNOWN_COLA_TYPES:
            if len(parts) >= 2:
                name = parts[1]
                tokens = parts[2:]
            else:
                name = None
                tokens = []

            return ColaTelegram(
                command_type=cmd_type,
                name=name,
                tokens=tokens,
                raw_content=telegram_str,
                is_fault=False,
            )

        # Raw / Custom Output Format string (e.g. EPC hex string, CSV, or Key-Value)
        # Treat as an asynchronous ReadResult event
        return ColaTelegram(
            command_type="sSN",
            name="ReadResult",
            tokens=parts,
            raw_content=telegram_str,
            is_fault=False,
        )

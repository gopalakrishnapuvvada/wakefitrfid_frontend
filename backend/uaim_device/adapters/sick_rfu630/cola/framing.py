"""CoLa-A (Command Language ASCII) framing and streaming frame decoder."""

import logging
from typing import Iterator
from uaim_device.core.exceptions import DeviceProtocolError

logger = logging.getLogger(__name__)

# CoLa-A Frame Boundary Bytes
STX: int = 0x02  # Start of Text ('\x02')
ETX: int = 0x03  # End of Text ('\x03')
MAX_BUFFER_SIZE: int = 65536  # 64 KB protection against buffer overrun


class ColaFrameDecoder:
    """
    Streaming frame decoder for SICK CoLa-A ASCII telegrams.
    
    Robustly handles:
    - Partial telegrams across multiple TCP reads
    - Complete telegrams
    - Multiple telegrams received in a single TCP packet
    - Garbage/noise bytes preceding STX
    - Buffer overflow prevention
    """

    def __init__(self, max_buffer_size: int = MAX_BUFFER_SIZE) -> None:
        self._buffer = bytearray()
        self._max_buffer_size = max_buffer_size

    @property
    def buffer_size(self) -> int:
        return len(self._buffer)

    def feed(self, data: bytes) -> Iterator[str]:
        """
        Feed raw TCP bytes into the decoder buffer and yield extracted ASCII telegram strings.
        
        Yields telegram content without STX, ETX, CR, or LF delimiters.
        Supports both standard CoLa STX/ETX frames and newline-delimited host port streams.
        """
        if not data:
            return

        self._buffer.extend(data)

        # Buffer overflow check
        if len(self._buffer) > self._max_buffer_size:
            logger.error(f"CoLa frame buffer exceeded max size ({len(self._buffer)} > {self._max_buffer_size}). Discarding buffer.")
            self._buffer.clear()
            raise DeviceProtocolError("CoLa frame buffer overflow. Discarded malformed data stream.")

        while self._buffer:
            # 1. Check if there is an STX delimiter in the buffer
            stx_idx = self._buffer.find(bytes([STX]))
            
            if stx_idx != -1:
                # If there are bytes before STX, check if they contain newline-delimited telegrams
                if stx_idx > 0:
                    pre_stx = self._buffer[:stx_idx]
                    del self._buffer[:stx_idx]
                    if b"\n" in pre_stx or b"\r" in pre_stx:
                        lines = pre_stx.replace(b"\r\n", b"\n").replace(b"\r", b"\n").split(b"\n")
                        for line in lines[:-1]:
                            clean_line = line.strip()
                            if clean_line:
                                try:
                                    decoded = clean_line.decode("latin-1", errors="ignore").strip()
                                    if decoded:
                                        yield decoded
                                except Exception:
                                    pass
                    stx_idx = 0

                # Look for ETX delimiter after STX
                etx_idx = self._buffer.find(bytes([ETX]), stx_idx + 1)
                if etx_idx != -1:
                    raw_payload = self._buffer[stx_idx + 1:etx_idx]
                    del self._buffer[:etx_idx + 1]
                    try:
                        telegram_str = raw_payload.decode("latin-1", errors="ignore").strip()
                        if telegram_str:
                            yield telegram_str
                    except Exception as e:
                        logger.warning(f"Failed to decode CoLa telegram payload: {e}")
                    continue
                else:
                    # Incomplete STX...ETX frame; wait for more TCP chunks
                    break

            # 2. No STX in buffer: check for line delimiters (\n or \r)
            if b"\n" in self._buffer or b"\r" in self._buffer:
                nl_idx = self._buffer.find(b"\n")
                cr_idx = self._buffer.find(b"\r")
                if nl_idx != -1 and cr_idx != -1:
                    delim_idx = min(nl_idx, cr_idx)
                elif nl_idx != -1:
                    delim_idx = nl_idx
                else:
                    delim_idx = cr_idx

                raw_line = self._buffer[:delim_idx]
                
                # Advance buffer past delimiter (and \n if \r\n sequence)
                if delim_idx == cr_idx and delim_idx + 1 < len(self._buffer) and self._buffer[delim_idx + 1] == ord(b"\n"):
                    del self._buffer[:delim_idx + 2]
                else:
                    del self._buffer[:delim_idx + 1]

                clean_line = raw_line.strip()
                if clean_line:
                    try:
                        decoded = clean_line.decode("latin-1", errors="ignore").strip()
                        if decoded:
                            yield decoded
                    except Exception:
                        pass
                continue

            # Incomplete line/frame without delimiters; preserve in buffer for next read
            break

    def reset(self) -> None:
        """Clear internal receive buffer."""
        self._buffer.clear()


def encode_cola_a_telegram(command_text: str) -> bytes:
    """
    Wrap a CoLa-A command text with STX and ETX framing bytes.
    
    Example: 'sRN DeviceIdent' -> b'\x02sRN DeviceIdent\x03'
    """
    payload = command_text.strip().encode("latin-1")
    return bytes([STX]) + payload + bytes([ETX])

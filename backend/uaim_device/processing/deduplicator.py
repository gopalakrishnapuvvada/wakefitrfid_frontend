"""Sliding time-window RFID tag deduplication engine."""

import logging
import time
from typing import Callable, Optional
from uaim_device.core.events import IdentificationEvent
from uaim_device.core.models import DeduplicationConfig

logger = logging.getLogger(__name__)


class RFIDDeduplicator:
    """
    Suppresses redundant tag observations within a sliding time window.
    
    Prevents flooding downstream systems when a pallet or container
    remains inside the RF read zone of a fixed reader.
    """

    def __init__(
        self,
        config: Optional[DeduplicationConfig] = None,
        key_builder: Optional[Callable[[IdentificationEvent], str]] = None
    ) -> None:
        self.config = config or DeduplicationConfig()
        self.key_builder = key_builder or self._default_key_builder
        self._last_seen: dict[str, float] = {}
        self._total_duplicates: int = 0
        self._total_uniques: int = 0
        self._last_prune_time: float = time.time()

    @property
    def total_duplicates_filtered(self) -> int:
        return self._total_duplicates

    @property
    def total_unique_passed(self) -> int:
        return self._total_uniques

    def _default_key_builder(self, event: IdentificationEvent) -> str:
        # Default key: device_id + identifier + read_cycle_id
        cycle = event.read_cycle_id or "NONE"
        base = f"{event.device_id}:{event.identifier}:{cycle}"
        if self.config.include_antenna and event.antenna_id is not None:
            base += f":ANT-{event.antenna_id}"
        return base

    def is_unique(self, event: IdentificationEvent) -> bool:
        """
        Check if the event is unique.
        
        Returns:
            True if the tag is unique (or deduplication is disabled).
            False if it is a duplicate within the configured time window.
        """
        if not self.config.enabled:
            self._total_uniques += 1
            return True

        now = time.time()
        window_sec = self.config.window_ms / 1000.0

        # Periodic cleanup of expired entries (every 10 seconds or 5000 items)
        if now - self._last_prune_time > 10.0 or len(self._last_seen) > 5000:
            self.prune(now, window_sec)

        key = self.key_builder(event)
        last_time = self._last_seen.get(key)

        if last_time is not None and (now - last_time) < window_sec:
            self._total_duplicates += 1
            # Update timestamp to slide the window or keep original observation
            self._last_seen[key] = now
            return False

        self._last_seen[key] = now
        self._total_uniques += 1
        return True

    def prune(self, current_time: Optional[float] = None, window_sec: Optional[float] = None) -> None:
        """Evict expired keys from memory."""
        now = current_time or time.time()
        win = window_sec or (self.config.window_ms / 1000.0)
        cutoff = now - (win * 2.0)  # Keep a 2x window buffer

        expired_keys = [k for k, t in self._last_seen.items() if t < cutoff]
        for k in expired_keys:
            del self._last_seen[k]

        self._last_prune_time = now

    def reset(self) -> None:
        """Clear deduplication cache."""
        self._last_seen.clear()
        self._total_duplicates = 0
        self._total_uniques = 0

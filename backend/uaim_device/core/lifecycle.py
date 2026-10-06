"""Connection lifecycle state machine and backoff management."""

import asyncio
import logging
import random
from typing import Callable, Optional
from uaim_device.core.exceptions import DeviceAdapterError
from uaim_device.core.models import DeviceState, ReconnectConfig

logger = logging.getLogger(__name__)


# Valid transition map
ALLOWED_TRANSITIONS: dict[DeviceState, set[DeviceState]] = {
    DeviceState.DISCONNECTED: {DeviceState.CONNECTING, DeviceState.CONNECTED, DeviceState.ERROR, DeviceState.DISCONNECTED},
    DeviceState.CONNECTING: {DeviceState.CONNECTED, DeviceState.ERROR, DeviceState.DISCONNECTED},
    DeviceState.CONNECTED: {DeviceState.RUNNING, DeviceState.STOPPING, DeviceState.ERROR, DeviceState.DISCONNECTED, DeviceState.CONNECTING},
    DeviceState.RUNNING: {DeviceState.STOPPING, DeviceState.ERROR, DeviceState.DISCONNECTED, DeviceState.CONNECTED},
    DeviceState.STOPPING: {DeviceState.CONNECTED, DeviceState.DISCONNECTED, DeviceState.ERROR},
    DeviceState.ERROR: {DeviceState.RECONNECTING, DeviceState.DISCONNECTED, DeviceState.CONNECTING, DeviceState.CONNECTED},
    DeviceState.RECONNECTING: {DeviceState.CONNECTING, DeviceState.CONNECTED, DeviceState.ERROR, DeviceState.DISCONNECTED},
}


class ConnectionStateMachine:
    """State machine governing device adapter connection lifecycle."""

    def __init__(self, device_id: str, initial_state: DeviceState = DeviceState.DISCONNECTED) -> None:
        self.device_id = device_id
        self._state = initial_state
        self._listeners: list[Callable[[DeviceState, DeviceState], None]] = []
        self._lock = asyncio.Lock()

    @property
    def current_state(self) -> DeviceState:
        return self._state

    def add_listener(self, listener: Callable[[DeviceState, DeviceState], None]) -> None:
        """Register a callback invoked on state transition: fn(old_state, new_state)."""
        self._listeners.append(listener)

    def transition(self, new_state: DeviceState) -> None:
        """Synchronously transition to a new state if valid."""
        if new_state == self._state:
            return

        valid_targets = ALLOWED_TRANSITIONS.get(self._state, set())
        if new_state not in valid_targets:
            msg = f"Invalid state transition for {self.device_id}: {self._state.value} -> {new_state.value}"
            logger.warning(msg)
            # In production resilience, we force the state if stopping/disconnecting, else raise
            if new_state in (DeviceState.DISCONNECTED, DeviceState.ERROR):
                pass
            else:
                raise DeviceAdapterError(msg, device_id=self.device_id)

        old_state = self._state
        self._state = new_state
        logger.info(f"[{self.device_id}] State changed: {old_state.value} -> {new_state.value}")

        for listener in self._listeners:
            try:
                listener(old_state, new_state)
            except Exception as e:
                logger.error(f"[{self.device_id}] State listener error: {e}", exc_info=True)


class ExponentialBackoff:
    """Helper for calculating retry delays with exponential backoff and jitter."""

    def __init__(self, config: Optional[ReconnectConfig] = None) -> None:
        self.config = config or ReconnectConfig()
        self.attempt = 0

    def next_delay(self) -> float:
        """Compute the next sleep interval in seconds."""
        delay = self.config.initial_delay * (self.config.backoff_factor ** self.attempt)
        delay = min(delay, self.config.max_delay)
        self.attempt += 1

        if self.config.jitter:
            # 0.8x to 1.2x jitter
            delay = delay * random.uniform(0.8, 1.2)

        return max(0.1, delay)

    def reset(self) -> None:
        """Reset the attempt counter upon successful connection."""
        self.attempt = 0

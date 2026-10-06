import asyncio
from abc import ABC, abstractmethod
import json
import logging
from typing import Any, Callable, Coroutine, Optional
import urllib.request
from uaim_device.core.events import IdentificationEvent
from uaim_device.core.models import EventType

logger = logging.getLogger(__name__)


class EventConsumer(ABC):
    """Abstract interface for event destinations (WebSockets, Kafka, Logs, DB)."""

    @abstractmethod
    async def consume(self, event: IdentificationEvent) -> None:
        """Handle incoming normalized IdentificationEvent."""
        pass


class LoggingConsumer(EventConsumer):
    """Logs structured event summaries to standard logger."""

    async def consume(self, event: IdentificationEvent) -> None:
        logger.info(
            f"device_id={event.device_id} "
            f"event_type={event.event_type.value} "
            f"type={event.identifier_type.value} "
            f"id={event.identifier} "
            f"rssi={event.rssi} "
            f"ant={event.antenna_id} "
            f"cycle={event.read_cycle_id}"
        )


class CallbackConsumer(EventConsumer):
    """Invokes an asynchronous or synchronous callback function on each event."""

    def __init__(self, callback: Callable[[IdentificationEvent], Coroutine[Any, Any, None] | None]) -> None:
        self.callback = callback

    async def consume(self, event: IdentificationEvent) -> None:
        try:
            res = self.callback(event)
            if asyncio.iscoroutine(res):
                await res
        except Exception as e:
            logger.error(f"Error in callback consumer: {e}", exc_info=True)


class MockKafkaConsumer(EventConsumer):
    """
    Pluggable Kafka consumer abstraction.
    
    Operates without hard Kafka driver dependencies at runtime.
    Logs/records published messages for enterprise traceability.
    """

    def __init__(self, topic: str = "uaim.identification.events") -> None:
        self.topic = topic
        self.published_events: list[IdentificationEvent] = []

    async def consume(self, event: IdentificationEvent) -> None:
        self.published_events.append(event)
        if len(self.published_events) > 500:
            self.published_events.pop(0)
        logger.debug(f"[Kafka:{self.topic}] Emitted message key={event.device_id} payload={event.identifier}")


class HttpWebhookForwarder(EventConsumer):
    """
    Asynchronously forwards scanned RFID tags directly to an external HTTP webhook API.
    
    Operates in a detached background task to ensure zero impact on reader read latency.
    """

    def __init__(
        self,
        target_url: str = "http://127.0.0.1:8000/post_fixed_rfid",
        enabled: bool = True,
        only_tag: bool = True,
        payload_field: str = "rfidUniqueId",
        timeout_sec: float = 3.0
    ) -> None:
        self.target_url = target_url
        self.enabled = enabled
        self.only_tag = only_tag
        self.payload_field = payload_field
        self.timeout_sec = timeout_sec

    async def consume(self, event: IdentificationEvent) -> None:
        if not self.enabled or not self.target_url:
            return
        if event.event_type != EventType.IDENTIFICATION:
            return

        tag_value = event.identifier
        if self.only_tag:
            payload = {
                self.payload_field: tag_value,
                "rfidUniqueId": tag_value,
            }
        else:
            payload = {
                self.payload_field: tag_value,
                "epc": tag_value,
                "tag": tag_value,
                "device_id": event.device_id,
                "station_id": event.station_id,
                "antenna_id": event.antenna_id,
                "rssi": event.rssi,
                "timestamp": event.timestamp.isoformat()
            }

        # Fire and forget without blocking the event pipeline
        asyncio.create_task(self._send_post(self.target_url, payload))

    async def _send_post(self, url: str, payload: dict[str, Any]) -> None:
        urls_to_try = [url]
        if "/post_fixed_rfid" in url:
            base_prefix = url[:url.rfind("/post_fixed_rfid")]
            for alt in [f"{base_prefix}/api/post_fixed_rfid", f"{base_prefix}/post_fixed_rfid"]:
                if alt not in urls_to_try:
                    urls_to_try.append(alt)

        last_err = None
        for target_url in urls_to_try:
            try:
                def _sync_post(u: str):
                    data = json.dumps(payload).encode("utf-8")
                    req = urllib.request.Request(
                        u,
                        data=data,
                        headers={"Content-Type": "application/json", "User-Agent": "UAIM-RFID-Adapter"},
                        method="POST"
                    )
                    with urllib.request.urlopen(req, timeout=self.timeout_sec) as resp:
                        body = resp.read().decode("utf-8", errors="ignore")
                        return resp.status, body

                status, body = await asyncio.to_thread(_sync_post, target_url)
                logger.info(f"✅ Successfully posted RFID tag to {target_url} (HTTP {status}): {payload} | Response: {body}")
                self.target_url = target_url  # Remember the working URL
                return
            except urllib.error.HTTPError as e:
                err_body = e.read().decode("utf-8", errors="ignore")
                last_err = f"HTTP Error {e.code}: {e.reason} (Response: {err_body})"
                if e.code != 404:
                    logger.warning(f"Failed to post RFID tag to {target_url}: {last_err}")
                    return
            except Exception as e:
                last_err = str(e)
                logger.warning(f"Failed to post RFID tag to {target_url}: {last_err}")
                return

        logger.warning(f"Failed to post RFID tag to {url} (tested {urls_to_try}): {last_err}")


class EventDispatcher:
    """Dispatches identification events concurrently to all registered consumers."""

    def __init__(self) -> None:
        self._consumers: list[EventConsumer] = []

    def add_consumer(self, consumer: EventConsumer) -> None:
        """Register a new downstream consumer."""
        self._consumers.append(consumer)

    def remove_consumer(self, consumer: EventConsumer) -> None:
        if consumer in self._consumers:
            self._consumers.remove(consumer)

    async def dispatch(self, event: IdentificationEvent) -> None:
        """Broadcast event to all consumers concurrently."""
        if not self._consumers:
            return

        tasks = [self._safe_consume(c, event) for c in self._consumers]
        await asyncio.gather(*tasks, return_exceptions=True)

    async def _safe_consume(self, consumer: EventConsumer, event: IdentificationEvent) -> None:
        try:
            await consumer.consume(event)
        except Exception as e:
            logger.error(f"Consumer {consumer.__class__.__name__} error: {e}", exc_info=True)

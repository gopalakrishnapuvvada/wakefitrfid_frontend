"""
Unified RFID Scanner Gateway Service for Wakefit Backend.

Integrates SICK Fixed UHF RFID Reader (RFU630) and Handheld Scanners
directly into the FastAPI server process with zero HTTP overhead.
"""

import asyncio
import logging
from pathlib import Path
from typing import Optional
import yaml

from uaim_device.core.manager import GLOBAL_DEVICE_MANAGER
from uaim_device.core.models import (
    DeviceInfo,
    DeviceType,
    ConnectionType,
    ReconnectConfig,
    DeduplicationConfig,
)
from uaim_device.core.events import IdentificationEvent, EventType
from uaim_device.processing.dispatcher import EventConsumer, HttpWebhookForwarder

logger = logging.getLogger("uaim_device.service")


class DirectDbConsumer(EventConsumer):
    """
    Direct in-memory consumer that automatically couples and commits
    scanned RFID tags directly into the database without making HTTP calls.
    """

    async def consume(self, event: IdentificationEvent) -> None:
        if event.event_type != EventType.IDENTIFICATION:
            return

        tag_value = str(event.identifier).strip()
        if not tag_value:
            return

        logger.info(f"⚡ [RFID Portal] Real-time tag detected: {tag_value} (Antenna={event.antenna_id}, RSSI={event.rssi} dBm)")

        def _db_action():
            try:
                from utils.database import SessionLocal
                from api.routers.transactions import post_fixed_rfid
                from schemas.transactions import PostFixedRfidRequest

                with SessionLocal() as db:
                    req = PostFixedRfidRequest(
                        rfidUniqueId=tag_value,
                        scanner_device=event.device_id or "RFID-001",
                        antenna=f"Port {event.antenna_id or 1}"
                    )
                    res = post_fixed_rfid(req, db)
                    msg = res.get("message") if isinstance(res, dict) else getattr(res, "message", "Processed")
                    logger.info(f"✅ [RFID Portal DB] Transaction updated: {msg}")
            except Exception as e:
                logger.warning(f"⚠️ [RFID Portal DB] Notice processing tag {tag_value}: {e}")

        # Run database operation in background thread
        asyncio.create_task(asyncio.to_thread(_db_action))


def get_config_path() -> Path:
    """Find config.yaml in uaim_device directory or backend root."""
    base_dir = Path(__file__).resolve().parent
    candidates = [
        base_dir / "config.yaml",
        base_dir.parent / "config.yaml",
        Path.cwd() / "uaim_device" / "config.yaml",
        Path.cwd() / "config.yaml",
    ]
    for c in candidates:
        if c.is_file():
            return c
    return base_dir / "config.yaml"


def load_rfid_config() -> tuple[list[dict], dict]:
    """Load devices and webhook settings from YAML."""
    cfg_path = get_config_path()
    raw_devices: list[dict] = []
    wh_cfg: dict = {}

    if cfg_path.is_file():
        try:
            with open(cfg_path, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f) or {}
                raw_devices = data.get("devices", [])
                wh_cfg = data.get("webhook", {})
                logger.info(f"Loaded {len(raw_devices)} devices from {cfg_path}")
        except Exception as e:
            logger.warning(f"Failed to read {cfg_path}: {e}")

    if not raw_devices:
        # Sensible defaults for SICK RFU630
        raw_devices = [
            {
                "device_id": "RFID-001",
                "name": "Pallet Gate SICK RFU630",
                "adapter": "sick_rfu630",
                "host": "192.168.1.246",
                "port": 2112,
                "station_id": "PALLET-GATE-01",
                "enabled": True,
            }
        ]

    return raw_devices, wh_cfg


async def start_rfid_service() -> None:
    """Initialize and start the SICK RFID background engine."""
    logger.info("Initializing SICK Fixed RFID Reader Service inside FastAPI backend...")

    # 1. Register direct in-memory DB consumer and live WebSocket broadcaster
    from uaim_device.api.websocket import WS_MANAGER
    GLOBAL_DEVICE_MANAGER.dispatcher.add_consumer(DirectDbConsumer())
    GLOBAL_DEVICE_MANAGER.dispatcher.add_consumer(WS_MANAGER)

    # 2. Load configured devices
    raw_devices, wh_cfg = load_rfid_config()
    handheld_port_counter = 9001

    for d in raw_devices:
        adapter_key = d.get("adapter", "sick_rfu630" if d.get("host") else "handheld")
        is_sick = "sick" in adapter_key.lower() or "rfu" in str(d.get("model", "")).lower() or d.get("type") == "RFID_FIXED"
        default_type = DeviceType.RFID_FIXED if is_sick else DeviceType.RFID_HANDHELD
        default_vendor = "SICK" if is_sick else "CipherLab"
        default_model = "RFU630" if is_sick else "RS38"
        default_conn = ConnectionType.ETHERNET if d.get("host") else ConnectionType.HID_KEYBOARD

        resolved_port = d.get("port")
        if resolved_port is None:
            if is_sick and d.get("host"):
                resolved_port = 2112
            elif not is_sick:
                resolved_port = handheld_port_counter
                handheld_port_counter += 1

        info = DeviceInfo(
            device_id=d["device_id"],
            name=d.get("name", f"{default_vendor} {default_model}"),
            device_type=DeviceType(d.get("type", default_type)),
            vendor=d.get("vendor", default_vendor),
            model=d.get("model", default_model),
            connection_type=ConnectionType(d.get("connection_type", default_conn)),
            host=d.get("host"),
            port=resolved_port,
            station_id=d.get("station_id"),
            enabled=d.get("enabled", True),
            reconnect=ReconnectConfig(**d.get("reconnect", {})),
            deduplication=DeduplicationConfig(**d.get("deduplication", {})),
            configuration=d.get("configuration", {})
        )
        GLOBAL_DEVICE_MANAGER.register_device(adapter_key, info)

    # 3. Optional external webhook forwarder
    if wh_cfg.get("enabled", False) and wh_cfg.get("url"):
        forwarder = HttpWebhookForwarder(
            target_url=wh_cfg["url"],
            enabled=True,
            only_tag=wh_cfg.get("only_tag", True),
            payload_field=wh_cfg.get("payload_field", "rfidUniqueId"),
            timeout_sec=float(wh_cfg.get("timeout_sec", 3.0))
        )
        GLOBAL_DEVICE_MANAGER.dispatcher.add_consumer(forwarder)

    # 4. Start all adapters asynchronously in background
    asyncio.create_task(GLOBAL_DEVICE_MANAGER.start_all())
    logger.info("SICK RFID Reader Service started successfully.")


async def stop_rfid_service() -> None:
    """Gracefully stop RFID reader background tasks on shutdown."""
    logger.info("Stopping SICK RFID Reader Service...")
    await GLOBAL_DEVICE_MANAGER.stop_all()
    logger.info("SICK RFID Reader Service stopped.")

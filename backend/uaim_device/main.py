"""Main application entry point for the UAIM Device Adapter Platform."""

import asyncio
from contextlib import asynccontextmanager
import logging
from pathlib import Path
import sys
from typing import Optional
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
import yaml
from uaim_device.api.routes import router as api_router
from uaim_device.api.websocket import WS_MANAGER
from uaim_device.core.manager import GLOBAL_DEVICE_MANAGER
from uaim_device.core.models import (
    ConnectionType,
    DeduplicationConfig,
    DeviceInfo,
    DeviceType,
    ReconnectConfig,
)
from uaim_device.metrics.metrics import GLOBAL_METRICS

# Setup structured logger
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s"
)
logger = logging.getLogger("uaim_device")


def resolve_web_dir() -> Path:
    """Locate the web dashboard static assets directory across source and bundled environments."""
    candidates = [
        Path.cwd() / "web",
        Path.cwd() / "uaim_device" / "web",
    ]
    if getattr(sys, "frozen", False):
        exe_dir = Path(sys.executable).parent
        candidates.extend([
            exe_dir / "web",
            exe_dir / "uaim_device" / "web",
        ])
        if hasattr(sys, "_MEIPASS"):
            meipass_dir = Path(sys._MEIPASS)
            candidates.extend([
                meipass_dir / "uaim_device" / "web",
                meipass_dir / "web",
            ])
    
    candidates.append(Path(__file__).parent / "web")

    for c in candidates:
        if c.exists() and (c / "index.html").exists():
            return c
    return Path(__file__).parent / "web"


def find_config_file(explicit_path: Optional[str] = None) -> Optional[Path]:
    """Locate config.yaml across working directory, executable location, and source tree."""
    if explicit_path:
        p = Path(explicit_path)
        if p.is_file():
            return p

    candidates = [
        Path.cwd() / "config.yaml",
    ]
    if getattr(sys, "frozen", False):
        exe_dir = Path(sys.executable).parent
        candidates.extend([
            exe_dir / "config.yaml",
            exe_dir / ".." / "config.yaml",
        ])
    
    candidates.extend([
        Path(__file__).parent.parent / "config.yaml",
        Path(__file__).parent / "config.yaml",
    ])

    for c in candidates:
        if c.is_file():
            return c
    return None


WEB_DIR = resolve_web_dir()


def load_config_file(config_path: Optional[str] = None) -> list[dict]:
    """Load devices configuration from YAML file or return defaults."""
    p = find_config_file(config_path)
    if p and p.exists():
        try:
            with open(p, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f) or {}
                devices = data.get("devices", [])
                if devices:
                    logger.info(f"Loaded {len(devices)} devices from configuration file: {p.resolve()}")
                    return devices
        except Exception as e:
            logger.warning(f"Failed to read {p}: {e}, using built-in defaults.")

    logger.info("Using built-in default device configurations.")
    return [
        {
            "device_id": "RFID-001",
            "name": "Pallet Gate SICK RFU630",
            "type": "RFID_FIXED",
            "adapter": "sick_rfu630",
            "vendor": "SICK",
            "model": "RFU630",
            "connection_type": "ETHERNET",
            "host": "192.168.1.246",
            "port": 2112,
            "station_id": "PALLET-GATE-01",
            "enabled": True,
            "reconnect": {"enabled": True, "initial_delay": 1.0, "max_delay": 30.0},
            "deduplication": {"enabled": True, "window_ms": 500},
            "configuration": {"auto_start_on_connect": True, "enable_heartbeat": True}
        },
        {
            "device_id": "HH-001",
            "name": "CipherLab RS38 Handheld Computer",
            "type": "RFID_HANDHELD",
            "adapter": "handheld",
            "vendor": "CipherLab",
            "model": "RS38 (AS38N8RF4NSG1)",
            "connection_type": "TCP",
            "host": "0.0.0.0",
            "port": 9001,
            "station_id": "PACKING-01",
            "enabled": True,
            "reconnect": {"enabled": False},
            "deduplication": {"enabled": True, "window_ms": 500},
            "configuration": {"transport": "TCP", "default_type": "RFID_EPC"}
        }
    ]


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and graceful shutdown lifecycle."""
    logger.info("Initializing UAIM Device Adapter Platform...")

    # Attach WebSocket streaming consumer
    GLOBAL_DEVICE_MANAGER.dispatcher.add_consumer(WS_MANAGER)

    # Load and register configured devices
    raw_devices = load_config_file()
    handheld_port_counter = 9001
    for d in raw_devices:
        adapter_key = d.get("adapter", "sick_rfu630" if d.get("host") else "handheld")

        # Automatically determine sensible defaults if omitted from minimal YAML
        is_sick = "sick" in adapter_key.lower() or "rfu" in str(d.get("model", "")).lower() or d.get("type") == "RFID_FIXED"
        default_type = DeviceType.RFID_FIXED if is_sick else DeviceType.RFID_HANDHELD
        default_vendor = "SICK" if is_sick else "CipherLab"
        default_model = "RFU630" if is_sick else "RS38 (AS38N8RF4NSG1)"
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

    # Start all adapters
    asyncio.create_task(GLOBAL_DEVICE_MANAGER.start_all())
    logger.info(f"Loaded {len(raw_devices)} devices into pipeline.")

    # Load and register optional HTTP Webhook Forwarder from config.yaml
    cfg_file = find_config_file()
    if cfg_file and cfg_file.exists():
        try:
            with open(cfg_file, "r", encoding="utf-8") as f:
                cfg_data = yaml.safe_load(f) or {}
                wh = cfg_data.get("webhook", {})
                if wh.get("enabled", False) and wh.get("url"):
                    from uaim_device.processing.dispatcher import HttpWebhookForwarder
                    forwarder = HttpWebhookForwarder(
                        target_url=wh["url"],
                        enabled=True,
                        only_tag=wh.get("only_tag", True),
                        payload_field=wh.get("payload_field", "rfidUniqueId"),
                        timeout_sec=float(wh.get("timeout_sec", 3.0))
                    )
                    GLOBAL_DEVICE_MANAGER.dispatcher.add_consumer(forwarder)
                    logger.info(f"Registered automatic HTTP Webhook Forwarder to: {wh['url']}")
        except Exception as e:
            logger.warning(f"Failed to initialize webhook forwarder: {e}")

    yield

    # Shutdown
    logger.info("Shutting down UAIM Device Adapter Platform...")
    await GLOBAL_DEVICE_MANAGER.stop_all()
    logger.info("All adapters stopped successfully.")


app = FastAPI(
    title="UAIM Device Adapter Framework",
    description="Edge adapter platform for SICK Fixed UHF RFID and CipherLab RS38 Handheld Mobile Computers",
    version="1.0.0",
    lifespan=lifespan
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files for UI
if WEB_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(WEB_DIR)), name="static")

# Mount REST API
app.include_router(api_router, prefix="/api/v1")


@app.get("/", response_class=HTMLResponse)
async def serve_ui():
    """Serve the unified industrial test and control screen."""
    html_file = WEB_DIR / "index.html"
    if html_file.exists():
        with open(html_file, "r", encoding="utf-8") as f:
            return f.read()
    return "<h1>UAIM Device Adapter Framework Online</h1>"


@app.post("/post_fixed_rfid")
async def receive_post_fixed_rfid(request: Request):
    """
    Receiver endpoint for fixed RFID tag POST requests.
    Accepts JSON body: {"rfid_tag": "..."} or raw text.
    """
    try:
        data = await request.json()
    except Exception:
        body = await request.body()
        data = {"raw": body.decode("utf-8", errors="ignore")}
    logger.info(f"[POST_FIXED_RFID] Received tag payload: {data}")
    return {"status": "success", "received": data}


@app.websocket("/ws/events")
async def websocket_events_endpoint(websocket: WebSocket):
    """Real-time normalized event stream for UI and client subscribers."""
    await WS_MANAGER.connect(websocket)
    try:
        while True:
            # Keep-alive receive loop
            await websocket.receive_text()
    except (WebSocketDisconnect, Exception):
        await WS_MANAGER.disconnect(websocket)


@app.get("/health")
@app.get("/api/v1/health")
async def health_check():
    """System liveness check."""
    devices = GLOBAL_DEVICE_MANAGER.list_devices()
    return {
        "status": "UP",
        "configured_devices_count": len(devices),
        "devices": [d.device_id for d in devices]
    }


@app.get("/ready")
async def readiness_check():
    """Readiness probe."""
    return {"status": "READY", "running": GLOBAL_DEVICE_MANAGER._is_running}


@app.get("/metrics")
async def metrics_endpoint():
    """Prometheus-compatible metrics exposition."""
    return PlainTextResponse(GLOBAL_METRICS.to_prometheus(), media_type="text/plain")


def main():
    """CLI runner supporting server start and smoke testing."""
    import argparse
    import uvicorn

    parser = argparse.ArgumentParser(description="UAIM Device Adapter Framework (Real-Time)")
    parser.add_argument("--config", "-c", default=None, help="Path to config.yaml")
    parser.add_argument("--host", default=None, help="Server bind host (default: 0.0.0.0 or from config.yaml)")
    parser.add_argument("--port", "-p", type=int, default=None, help="Server port (default: 8001 or from config.yaml)")
    parser.add_argument("--smoke-test", action="store_true", help="Run automated smoke tests against local server")
    args = parser.parse_args()

    if args.smoke_test:
        from uaim_device.smoke_test import run_smoke_test
        target_host = args.host or "127.0.0.1"
        target_port = args.port or 8001
        success = run_smoke_test(host=target_host, port=target_port)
        sys.exit(0 if success else 1)

    # Determine host and port
    server_host = args.host or "0.0.0.0"
    server_port = args.port or 8001

    cfg_file = find_config_file(args.config)
    if cfg_file and cfg_file.exists():
        try:
            with open(cfg_file, "r", encoding="utf-8") as f:
                cfg_data = yaml.safe_load(f) or {}
                server_cfg = cfg_data.get("server", {})
                if not args.host and "host" in server_cfg:
                    server_host = str(server_cfg["host"])
                if not args.port and "port" in server_cfg:
                    server_port = int(server_cfg["port"])
        except Exception:
            pass

    display_host = "localhost" if server_host in ("0.0.0.0", "127.0.0.1") else server_host

    print("==================================================================")
    print("  UAIM Identification Device Adapter Platform v1.0.0")
    print("  Dedicated to SICK Fixed RFID & CipherLab RS38 Handheld")
    print("==================================================================")
    print(f"  * Control & Test UI:  http://{display_host}:{server_port}/")
    print(f"  * REST API Base:      http://{display_host}:{server_port}/api/v1/")
    print(f"  * WebSocket Stream:   ws://{display_host}:{server_port}/ws/events")
    print(f"  * Health Probe:       http://{display_host}:{server_port}/health")
    print(f"  * Prometheus Metrics: http://{display_host}:{server_port}/metrics")
    print("==================================================================")
    print("Press Ctrl+C to stop.\n")

    uvicorn.run(app, host=server_host, port=server_port, reload=False, log_level="info")


if __name__ == "__main__":
    main()

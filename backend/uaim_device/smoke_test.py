"""Automated End-to-End Smoke Test Client for UAIM Device Adapter Platform.

Tests REST endpoints, WebSocket streaming, Simulated Scans, and Health status
for SICK RFU630 Fixed RFID Reader and CipherLab RS38 Handheld Computer.
"""

import asyncio
import json
import logging
import sys
import time
import urllib.request
import urllib.error
import websockets

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [SMOKE_TEST] %(message)s"
)
logger = logging.getLogger("smoke_test")


def http_get(url: str) -> tuple[int, dict | str]:
    """Execute simple HTTP GET."""
    req = urllib.request.Request(url, headers={"User-Agent": "UAIM-SmokeTest/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            body = resp.read().decode("utf-8")
            try:
                return resp.status, json.loads(body)
            except Exception:
                return resp.status, body
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8")
    except Exception as e:
        return 0, str(e)


def http_post(url: str, payload: dict) -> tuple[int, dict | str]:
    """Execute simple HTTP POST with JSON body."""
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json", "User-Agent": "UAIM-SmokeTest/1.0"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            body = resp.read().decode("utf-8")
            try:
                return resp.status, json.loads(body)
            except Exception:
                return resp.status, body
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8")
    except Exception as e:
        return 0, str(e)


async def test_websocket_stream(base_ws_url: str, base_http_url: str) -> bool:
    """Connect to WebSocket stream and verify real-time event arrival upon simulated scan."""
    ws_uri = f"{base_ws_url}/ws/events"
    received_events = []

    async def ws_listener():
        try:
            async with websockets.connect(ws_uri) as ws:
                while True:
                    msg = await ws.recv()
                    data = json.loads(msg)
                    if data.get("type") == "IDENTIFICATION_EVENT":
                        received_events.append(data)
                        break
        except Exception as e:
            logger.debug(f"WS listener ended: {e}")

    listener_task = asyncio.create_task(ws_listener())
    # Give WS connection 500ms to open
    await asyncio.sleep(0.5)

    # Post a simulated scan to trigger an event
    post_url = f"{base_http_url}/api/v1/devices/RFID-001/simulate-scan"
    status, resp = http_post(post_url, {
        "identifier": "E200TESTSMOKE0001",
        "identifier_type": "RFID_EPC",
        "rssi": -45.0,
        "antenna_id": 2
    })

    # Wait for event in WS
    for _ in range(20):
        if received_events:
            break
        await asyncio.sleep(0.1)

    listener_task.cancel()
    return len(received_events) > 0 and status == 200


def run_smoke_test(host: str = "127.0.0.1", port: int = 8001) -> bool:
    """Run full automated smoke test suite against running instance."""
    base_http = f"http://{host}:{port}"
    base_ws = f"ws://{host}:{port}"

    print("\n================================================================")
    print(f"  UAIM DEVICE ADAPTER AUTOMATED SMOKE TEST SUITE")
    print(f"  Target: {base_http}")
    print("================================================================\n")

    checks = []

    # 1. Health Probe
    status, data = http_get(f"{base_http}/health")
    if status == 200 and isinstance(data, dict) and data.get("status") == "UP":
        checks.append(("System Health Probe (/health)", "PASS", f"Status UP, Devices: {data.get('configured_devices_count', 0)}"))
    else:
        checks.append(("System Health Probe (/health)", "FAIL", f"Status: {status}, Data: {data}"))

    # 2. Readiness Probe
    status, data = http_get(f"{base_http}/ready")
    if status == 200 and isinstance(data, dict) and data.get("status") == "READY":
        checks.append(("Readiness Probe (/ready)", "PASS", "System is READY and running"))
    else:
        checks.append(("Readiness Probe (/ready)", "FAIL", f"Status: {status}, Data: {data}"))

    # 3. Web UI Root
    status, data = http_get(f"{base_http}/")
    if status == 200 and "UAIM" in str(data):
        checks.append(("Web Dashboard (/)", "PASS", "Control & Commissioning Center served successfully"))
    else:
        checks.append(("Web Dashboard (/)", "FAIL", f"Status: {status}"))

    # 4. Registered Devices API
    status, data = http_get(f"{base_http}/api/v1/devices")
    if status == 200 and isinstance(data, list) and len(data) > 0:
        dev_ids = [d.get("device_id") for d in data]
        checks.append(("Device Inventory API (/api/v1/devices)", "PASS", f"Found {len(data)} registered devices ({', '.join(dev_ids)})"))
    else:
        checks.append(("Device Inventory API (/api/v1/devices)", "FAIL", f"Status: {status}, Data: {data}"))

    # 5. SICK RFU630 Scan Simulation
    status, data = http_post(f"{base_http}/api/v1/devices/RFID-001/simulate-scan", {
        "identifier": "E20034120138000000008899",
        "identifier_type": "RFID_EPC",
        "rssi": -44.2,
        "antenna_id": 1
    })
    if status == 200 and isinstance(data, dict) and data.get("status") in ("ok", "ACCEPTED"):
        checks.append(("SICK RFU630 Scan Injection", "PASS", f"Event ID: {data.get('event_id')}, Identifier: {data.get('identifier')}"))
    else:
        checks.append(("SICK RFU630 Scan Injection", "FAIL", f"Status: {status}, Data: {data}"))

    # 6. CipherLab RS38 (AS38N8RF4NSG1) Scan Simulation
    status, data = http_post(f"{base_http}/api/v1/devices/HH-001/simulate-scan", {
        "identifier": "WF-MAT-SMOKE-9912",
        "identifier_type": "BARCODE",
        "metadata": {"symbology": "Code128", "model": "AS38N8RF4NSG1"}
    })
    if status == 200 and isinstance(data, dict) and data.get("status") in ("ok", "ACCEPTED"):
        checks.append(("CipherLab RS38 Handheld Scan Injection", "PASS", f"Event ID: {data.get('event_id')}, Identifier: {data.get('identifier')}"))
    else:
        checks.append(("CipherLab RS38 Handheld Scan Injection", "FAIL", f"Status: {status}, Data: {data}"))

    # 7. WebSocket Streaming Test
    try:
        ws_ok = asyncio.run(test_websocket_stream(base_ws, base_http))
        if ws_ok:
            checks.append(("Real-Time WebSocket Stream (/ws/events)", "PASS", "WebSocket connected and received live normalized event"))
        else:
            checks.append(("Real-Time WebSocket Stream (/ws/events)", "FAIL", "WebSocket timeout or event not received"))
    except Exception as e:
        checks.append(("Real-Time WebSocket Stream (/ws/events)", "FAIL", f"WebSocket error: {e}"))

    # 8. Prometheus Metrics Endpoint
    status, data = http_get(f"{base_http}/metrics")
    if status == 200 and "uaim_" in str(data):
        checks.append(("Prometheus Metrics (/metrics)", "PASS", "Exposed system telemetry metrics"))
    else:
        checks.append(("Prometheus Metrics (/metrics)", "FAIL", f"Status: {status}"))

    # 9. Scans REST API (/api/v1/scans/latest)
    status, data = http_get(f"{base_http}/api/v1/scans/latest")
    if status == 200 and isinstance(data, dict) and data.get("status") == "success":
        checks.append(("Scans REST API (/api/v1/scans/latest)", "PASS", f"Latest tag: {data.get('data', {}).get('identifier')}"))
    else:
        checks.append(("Scans REST API (/api/v1/scans/latest)", "FAIL", f"Status: {status}, Data: {data}"))

    # Print Results
    print(f"{'CHECK':<45} | {'RESULT':<6} | {'DETAILS'}")
    print("-" * 80)
    all_passed = True
    for name, res, detail in checks:
        if res != "PASS":
            all_passed = False
        res_str = f"\033[92m{res}\033[0m" if res == "PASS" else f"\033[91m{res}\033[0m"
        print(f"{name:<45} | {res:<6} | {detail}")
    print("-" * 80)

    if all_passed:
        print("\n>>> ALL SMOKE TESTS PASSED! System is fully operational.\n")
    else:
        print("\n>>> SOME TESTS FAILED. Please review server logs.\n")

    return all_passed


def main():
    import argparse
    parser = argparse.ArgumentParser(description="UAIM Device Adapter Automated Smoke Test")
    parser.add_argument("--host", default="127.0.0.1", help="Target server host (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8000, help="Target server port (default: 8000)")
    args = parser.parse_args()

    success = run_smoke_test(host=args.host, port=args.port)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()

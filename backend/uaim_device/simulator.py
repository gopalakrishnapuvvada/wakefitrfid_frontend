"""Industrial Hardware Simulator for SICK RFU630 and CipherLab RS38 Handheld.

Runs local TCP mock servers for offline testing on any desktop without physical hardware.
"""

import asyncio
import logging
import random
import sys
import time
from typing import Optional
from uaim_device.adapters.sick_rfu630.cola.framing import ETX, STX, encode_cola_a_telegram

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [SIMULATOR] %(message)s"
)
logger = logging.getLogger("uaim_simulator")


class FakeRFU630Server:
    """Simulates a SICK RFU630 RFID reader speaking CoLa-A protocol over TCP."""

    def __init__(self, host: str = "127.0.0.1", port: int = 2111) -> None:
        self.host = host
        self.port = port
        self.server: Optional[asyncio.Server] = None
        self.active_clients: list[asyncio.StreamWriter] = []
        self.is_running: bool = False
        self._tag_counter: int = 1000

    async def start(self) -> None:
        self.server = await asyncio.start_server(self._handle_client, self.host, self.port)
        self.is_running = True
        logger.info(f"SICK RFU630 CoLa-A Simulator listening on {self.host}:{self.port}")

    async def stop(self) -> None:
        self.is_running = False
        if self.server:
            self.server.close()
            await self.server.wait_closed()
            self.server = None
        for writer in list(self.active_clients):
            try:
                writer.close()
                await writer.wait_closed()
            except Exception:
                pass
        self.active_clients.clear()
        logger.info("SICK RFU630 Simulator stopped.")

    async def _handle_client(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        peer = writer.get_extra_info("peername")
        logger.info(f"RFU630: Client connected from {peer}")
        self.active_clients.append(writer)
        buffer = bytearray()
        try:
            while self.is_running:
                data = await reader.read(1024)
                if not data:
                    break
                buffer.extend(data)
                while True:
                    stx_idx = buffer.find(bytes([STX]))
                    if stx_idx == -1:
                        buffer.clear()
                        break
                    etx_idx = buffer.find(bytes([ETX]), stx_idx + 1)
                    if etx_idx == -1:
                        break
                    cmd_bytes = buffer[stx_idx + 1:etx_idx]
                    del buffer[:etx_idx + 1]
                    cmd_str = cmd_bytes.decode("latin-1").strip()
                    logger.debug(f"RFU630 received command: {cmd_str}")
                    await self._process_command(cmd_str, writer)
        except Exception as e:
            logger.debug(f"RFU630 client connection closed: {e}")
        finally:
            if writer in self.active_clients:
                self.active_clients.remove(writer)
            try:
                writer.close()
                await writer.wait_closed()
            except Exception:
                pass
            logger.info(f"RFU630: Client {peer} disconnected")

    async def _process_command(self, cmd_str: str, writer: asyncio.StreamWriter) -> None:
        parts = cmd_str.split()
        if not parts:
            return
        cmd_type = parts[0]
        cmd_name = parts[1] if len(parts) > 1 else ""

        if cmd_type == "sRN" and cmd_name == "DeviceIdent":
            resp = "sRA DeviceIdent SICK RFU630-10000 V1.20"
        elif cmd_type == "sRN" and cmd_name == "SCdevicestate":
            resp = "sRA SCdevicestate 0 OK"
        elif cmd_type == "sMN" and cmd_name == "Run":
            resp = "sMA Run 1"
        elif cmd_type == "sMN" and cmd_name == "Freeze":
            resp = "sMA Freeze 1"
        elif cmd_type == "sMN" and cmd_name in ("TAwriteTagData", "TAextWriteTagData"):
            # SICK write success response format: sAN TAextWriteTagData 0 6 (6 words written)
            words = 6
            if len(parts) > 5 and parts[5].isdigit():
                words = int(parts[5])
            resp = f"sAN {cmd_name} 0 {words}"
        else:
            resp = f"sMA {cmd_name} 1"

        writer.write(encode_cola_a_telegram(resp))
        await writer.drain()

    async def send_single_tag(self, epc: Optional[str] = None, antenna: int = 1, rssi: float = -48.5) -> str:
        if not epc:
            self._tag_counter += 1
            epc = f"E2003412013800000000{self._tag_counter:04d}"
        payload = f"sSN ReadResult 1 {epc} {antenna} {rssi:.1f} 1"
        framed = encode_cola_a_telegram(payload)
        for w in list(self.active_clients):
            try:
                w.write(framed)
                await w.drain()
            except Exception:
                pass
        logger.info(f"RFU630 -> Emitted RFID Tag: EPC={epc}, Ant={antenna}, RSSI={rssi}dBm to {len(self.active_clients)} clients")
        return epc

    async def send_pallet_burst(self, count: int = 5) -> list[str]:
        tokens = [f"{count}"]
        epcs = []
        for i in range(count):
            self._tag_counter += 1
            epc = f"E2003412013800000000{self._tag_counter:04d}"
            ant = (i % 4) + 1
            rssi = -42.0 - (i * 2.5)
            tokens.extend([epc, str(ant), f"{rssi:.1f}", "1"])
            epcs.append(epc)
        payload = f"sSN ReadResult {' '.join(tokens)}"
        framed = encode_cola_a_telegram(payload)
        for w in list(self.active_clients):
            try:
                w.write(framed)
                await w.drain()
            except Exception:
                pass
        logger.info(f"RFU630 -> Emitted Pallet Burst ({count} tags) to {len(self.active_clients)} clients")
        return epcs


class GenericTCPStreamSimulator:
    """Simulates a TCP stream for CipherLab RS38 pushing RFID or Barcode lines."""

    def __init__(self, name: str, host: str = "127.0.0.1", port: int = 9001) -> None:
        self.name = name
        self.host = host
        self.port = port
        self.server: Optional[asyncio.Server] = None
        self.active_clients: list[asyncio.StreamWriter] = []
        self.is_running: bool = False

    async def start(self) -> None:
        self.server = await asyncio.start_server(self._handle_client, self.host, self.port)
        self.is_running = True
        logger.info(f"{self.name} listening on {self.host}:{self.port}")

    async def stop(self) -> None:
        self.is_running = False
        if self.server:
            self.server.close()
            await self.server.wait_closed()
            self.server = None
        for writer in list(self.active_clients):
            try:
                writer.close()
                await writer.wait_closed()
            except Exception:
                pass
        self.active_clients.clear()
        logger.info(f"{self.name} stopped.")

    async def _handle_client(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        peer = writer.get_extra_info("peername")
        logger.info(f"{self.name}: Client connected from {peer}")
        self.active_clients.append(writer)
        try:
            while self.is_running:
                data = await reader.read(1024)
                if not data:
                    break
        except Exception:
            pass
        finally:
            if writer in self.active_clients:
                self.active_clients.remove(writer)
            try:
                writer.close()
                await writer.wait_closed()
            except Exception:
                pass
            logger.info(f"{self.name}: Client {peer} disconnected")

    async def send_text(self, text: str) -> None:
        msg = f"{text}\r\n".encode("utf-8")
        for w in list(self.active_clients):
            try:
                w.write(msg)
                await w.drain()
            except Exception:
                pass
        logger.info(f"{self.name} -> Pushed: '{text}' to {len(self.active_clients)} clients")


class HardwareSimulatorFleet:
    """Coordinates simulated SICK RFU630 and CipherLab RS38 hardware."""

    def __init__(self, host: str = "127.0.0.1", rfu_port: int = 2111, hh_port: int = 9001):
        self.rfu630 = FakeRFU630Server(host=host, port=rfu_port)
        self.handheld = GenericTCPStreamSimulator(
            "CipherLab RS38 (AS38N8RF4NSG1) Handheld Computer",
            host=host,
            port=hh_port
        )

    async def start(self) -> None:
        await self.rfu630.start()
        await self.handheld.start()
        logger.info("================================================================")
        logger.info("  UAIM HARDWARE SIMULATOR ONLINE")
        logger.info(f"  - SICK RFU630 CoLa-A TCP:      {self.rfu630.host}:{self.rfu630.port}")
        logger.info(f"  - CipherLab RS38 Handheld TCP: {self.handheld.host}:{self.handheld.port}")
        logger.info("================================================================")

    async def stop(self) -> None:
        await self.rfu630.stop()
        await self.handheld.stop()
        logger.info("Hardware Simulator Fleet stopped.")

    async def run_continuous_simulation(self, interval_sec: float = 3.0) -> None:
        """Continuously emits simulated scans every few seconds."""
        logger.info(f"Starting automatic continuous scan injection every {interval_sec}s (Ctrl+C to stop)...")
        barcodes = [
            "WF-MAT-BOX-0042",
            "WF-MAT-PALLET-991",
            "QR:MAT-WAKEFIT-88421",
            "EAN13:8901030992812",
            "WF-MAT-FOAM-5531"
        ]
        try:
            while True:
                mode = random.choice(["rfu_single", "rfu_burst", "cipherlab_rfid", "cipherlab_barcode"])
                if mode == "rfu_single":
                    await self.rfu630.send_single_tag(
                        antenna=random.randint(1, 4),
                        rssi=round(random.uniform(-65.0, -38.0), 1)
                    )
                elif mode == "rfu_burst":
                    await self.rfu630.send_pallet_burst(count=random.randint(3, 6))
                elif mode == "cipherlab_rfid":
                    epc = f"E280116060000204{random.randint(10000000, 99999999)}"
                    await self.handheld.send_text(epc)
                elif mode == "cipherlab_barcode":
                    bc = random.choice(barcodes)
                    await self.handheld.send_text(bc)
                await asyncio.sleep(interval_sec)
        except asyncio.CancelledError:
            pass


async def interactive_cli_runner(fleet: HardwareSimulatorFleet):
    """Run interactive terminal menu for manual tag triggering."""
    await fleet.start()
    print("\n--- UAIM Simulator Controls ---")
    print(" [1] Send Single SICK RFU630 Tag (EPC)")
    print(" [2] Send Pallet Burst (5 Tags)")
    print(" [3] Send CipherLab RS38 Handheld RFID Tag (EPC)")
    print(" [4] Send CipherLab RS38 2D QR / Barcode Scan")
    print(" [5] Run Continuous Auto-Scan Mode")
    print(" [q] Quit\n")

    loop = asyncio.get_running_loop()
    while True:
        try:
            line = await loop.run_in_executor(None, input, "Simulator > ")
            choice = line.strip().lower()
            if choice == "1":
                tag = await fleet.rfu630.send_single_tag()
                print(f"-> Sent SICK Tag: {tag}")
            elif choice == "2":
                tags = await fleet.rfu630.send_pallet_burst(5)
                print(f"-> Sent 5 Pallet Tags: {tags}")
            elif choice == "3":
                epc = f"E280116060000204{random.randint(10000000, 99999999)}"
                await fleet.handheld.send_text(epc)
                print(f"-> Sent CipherLab Handheld EPC: {epc}")
            elif choice == "4":
                code = f"WF-MAT-INSP-{random.randint(1000, 9999)}"
                await fleet.handheld.send_text(code)
                print(f"-> Sent CipherLab Barcode: {code}")
            elif choice == "5":
                print("Running continuous simulation (Press Ctrl+C to return to menu)...")
                try:
                    await fleet.run_continuous_simulation(interval_sec=2.5)
                except KeyboardInterrupt:
                    print("\nContinuous mode stopped.")
            elif choice in ("q", "quit", "exit"):
                break
            else:
                print("Invalid command. Options: 1, 2, 3, 4, 5, q")
        except (EOFError, KeyboardInterrupt):
            break

    await fleet.stop()


def main():
    import argparse
    parser = argparse.ArgumentParser(description="UAIM Device Adapter SICK & CipherLab Hardware Simulator")
    parser.add_argument("--host", default="127.0.0.1", help="Bind host (default: 127.0.0.1)")
    parser.add_argument("--rfu-port", type=int, default=2111, help="RFU630 port (default: 2111)")
    parser.add_argument("--hh-port", type=int, default=9001, help="CipherLab RS38 port (default: 9001)")
    parser.add_argument("--auto", action="store_true", help="Run in continuous auto-scan mode immediately")
    parser.add_argument("--interval", type=float, default=3.0, help="Interval for auto mode in seconds")
    args = parser.parse_args()

    fleet = HardwareSimulatorFleet(host=args.host, rfu_port=args.rfu_port, hh_port=args.hh_port)

    if args.auto:
        async def run_auto():
            await fleet.start()
            try:
                await fleet.run_continuous_simulation(interval_sec=args.interval)
            except KeyboardInterrupt:
                pass
            finally:
                await fleet.stop()
        try:
            asyncio.run(run_auto())
        except KeyboardInterrupt:
            print("\nSimulator stopped.")
    else:
        try:
            asyncio.run(interactive_cli_runner(fleet))
        except KeyboardInterrupt:
            print("\nSimulator stopped.")


if __name__ == "__main__":
    main()

"""Metrics collection and Prometheus exposition for industrial device monitoring."""

from datetime import datetime, timezone
import time
from typing import Any, Optional


class SystemMetrics:
    """In-memory telemetry and Prometheus metrics collector."""

    def __init__(self) -> None:
        self.device_connected: dict[str, int] = {}
        self.device_disconnects: dict[str, int] = {}
        self.reconnect_count: dict[str, int] = {}
        self.identification_events_total: dict[str, int] = {}
        self.duplicate_events_total: dict[str, int] = {}
        self.parsing_errors_total: dict[str, int] = {}
        self.connection_errors_total: dict[str, int] = {}
        self.read_cycles_total: dict[str, int] = {}
        self.read_cycle_tags_total: dict[str, int] = {}
        self.last_event_timestamp: dict[str, float] = {}
        self.communication_latency_ms: dict[str, float] = {}
        self.scanner_scans_total: dict[str, int] = {}
        self.scanner_unknown_scans_total: dict[str, int] = {}
        self.scanner_duplicate_scans_total: dict[str, int] = {}
        self.scanner_mode_changes_total: dict[str, int] = {}
        self.last_reader_mode: dict[str, str] = {}

    def record_connected(self, device_id: str) -> None:
        self.device_connected[device_id] = 1

    def record_disconnected(self, device_id: str) -> None:
        self.device_connected[device_id] = 0
        self.device_disconnects[device_id] = self.device_disconnects.get(device_id, 0) + 1

    def record_reconnect(self, device_id: str) -> None:
        self.reconnect_count[device_id] = self.reconnect_count.get(device_id, 0) + 1

    def record_identification(self, device_id: str, is_duplicate: bool = False) -> None:
        self.last_event_timestamp[device_id] = time.time()
        if is_duplicate:
            self.duplicate_events_total[device_id] = self.duplicate_events_total.get(device_id, 0) + 1
        else:
            self.identification_events_total[device_id] = self.identification_events_total.get(device_id, 0) + 1

    def record_scanner_scan(self, device_id: str, is_duplicate: bool = False, is_unknown: bool = False) -> None:
        self.scanner_scans_total[device_id] = self.scanner_scans_total.get(device_id, 0) + 1
        if is_duplicate:
            self.scanner_duplicate_scans_total[device_id] = self.scanner_duplicate_scans_total.get(device_id, 0) + 1
        if is_unknown:
            self.scanner_unknown_scans_total[device_id] = self.scanner_unknown_scans_total.get(device_id, 0) + 1

    def record_scanner_mode_change(self, device_id: str, mode: str) -> None:
        self.scanner_mode_changes_total[device_id] = self.scanner_mode_changes_total.get(device_id, 0) + 1
        self.last_reader_mode[device_id] = mode

    def record_parse_error(self, device_id: str) -> None:
        self.parsing_errors_total[device_id] = self.parsing_errors_total.get(device_id, 0) + 1

    def record_connection_error(self, device_id: str) -> None:
        self.connection_errors_total[device_id] = self.connection_errors_total.get(device_id, 0) + 1

    def record_read_cycle(self, device_id: str, tag_count: int) -> None:
        self.read_cycles_total[device_id] = self.read_cycles_total.get(device_id, 0) + 1
        self.read_cycle_tags_total[device_id] = self.read_cycle_tags_total.get(device_id, 0) + tag_count

    def record_latency(self, device_id: str, latency_ms: float) -> None:
        self.communication_latency_ms[device_id] = latency_ms

    def snapshot(self) -> dict[str, Any]:
        """Return a structured dictionary snapshot of all device metrics."""
        return {
            "device_connected": self.device_connected,
            "device_disconnects": self.device_disconnects,
            "reconnect_count": self.reconnect_count,
            "identification_events_total": self.identification_events_total,
            "duplicate_events_total": self.duplicate_events_total,
            "scanner_scans_total": self.scanner_scans_total,
            "scanner_unknown_scans_total": self.scanner_unknown_scans_total,
            "scanner_duplicate_scans_total": self.scanner_duplicate_scans_total,
            "scanner_mode_changes_total": self.scanner_mode_changes_total,
            "last_reader_mode": self.last_reader_mode,
            "parsing_errors_total": self.parsing_errors_total,
            "connection_errors_total": self.connection_errors_total,
            "read_cycles_total": self.read_cycles_total,
            "read_cycle_tags_total": self.read_cycle_tags_total,
            "communication_latency_ms": self.communication_latency_ms,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    def to_prometheus(self) -> str:
        """Render metrics in standard Prometheus line protocol."""
        lines = [
            "# HELP uaim_device_connected Current device connection status (1 = connected, 0 = disconnected)",
            "# TYPE uaim_device_connected gauge",
        ]
        for dev, val in self.device_connected.items():
            lines.append(f'uaim_device_connected{{device_id="{dev}"}} {val}')

        lines.extend([
            "# HELP uaim_identification_events_total Total unique identification events detected",
            "# TYPE uaim_identification_events_total counter",
        ])
        for dev, val in self.identification_events_total.items():
            lines.append(f'uaim_identification_events_total{{device_id="{dev}"}} {val}')

        lines.extend([
            "# HELP uaim_duplicate_events_total Total duplicate tag reads filtered",
            "# TYPE uaim_duplicate_events_total counter",
        ])
        for dev, val in self.duplicate_events_total.items():
            lines.append(f'uaim_duplicate_events_total{{device_id="{dev}"}} {val}')

        lines.extend([
            "# HELP uaim_scanner_scans_total Total raw scans ingested from keyboard wedge / handheld",
            "# TYPE uaim_scanner_scans_total counter",
        ])
        for dev, val in self.scanner_scans_total.items():
            lines.append(f'uaim_scanner_scans_total{{device_id="{dev}"}} {val}')

        lines.extend([
            "# HELP uaim_scanner_unknown_scans_total Total invalid or unclassified scans",
            "# TYPE uaim_scanner_unknown_scans_total counter",
        ])
        for dev, val in self.scanner_unknown_scans_total.items():
            lines.append(f'uaim_scanner_unknown_scans_total{{device_id="{dev}"}} {val}')

        lines.extend([
            "# HELP uaim_scanner_duplicate_scans_total Total duplicate scans suppressed by deduplication window",
            "# TYPE uaim_scanner_duplicate_scans_total counter",
        ])
        for dev, val in self.scanner_duplicate_scans_total.items():
            lines.append(f'uaim_scanner_duplicate_scans_total{{device_id="{dev}"}} {val}')

        lines.extend([
            "# HELP uaim_communication_latency_ms Communication latency in milliseconds",
            "# TYPE uaim_communication_latency_ms gauge",
        ])
        for dev, val in self.communication_latency_ms.items():
            lines.append(f'uaim_communication_latency_ms{{device_id="{dev}"}} {val:.2f}')

        return "\n".join(lines) + "\n"


# Global singleton metrics instance
GLOBAL_METRICS = SystemMetrics()

from datetime import datetime, timezone
from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from utils.database import Base


class DeviceCategory(Base):
    __tablename__ = "device_category"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, index=True)

    created_on: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    created_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    updated_on: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=True,
    )
    updated_by: Mapped[str | None] = mapped_column(String(100), nullable=True)

    devices: Mapped[list["Device"]] = relationship(back_populates="category")


class Connection(Base):
    __tablename__ = "connections"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, index=True)

    created_on: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    created_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    updated_on: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=True,
    )
    updated_by: Mapped[str | None] = mapped_column(String(100), nullable=True)

    devices: Mapped[list["Device"]] = relationship(back_populates="connection")


class DeviceStatus(Base):
    __tablename__ = "device_status"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, index=True)

    created_on: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    created_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    updated_on: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=True,
    )
    updated_by: Mapped[str | None] = mapped_column(String(100), nullable=True)

    devices: Mapped[list["Device"]] = relationship(back_populates="status")


class Device(Base):
    __tablename__ = "devices"

    device_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    display_name: Mapped[str] = mapped_column(String(150))
    asset_code: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    category_id: Mapped[str] = mapped_column(
        String(50),
        ForeignKey("device_category.id"),
        index=True,
    )
    manufacturer: Mapped[str | None] = mapped_column(String(100), nullable=True)
    model: Mapped[str | None] = mapped_column(String(150), nullable=True)
    serial_number: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    mac_address: Mapped[str | None] = mapped_column(String(50), nullable=True)

    station_id: Mapped[str | None] = mapped_column(String(100), nullable=True)

    connection_id: Mapped[str] = mapped_column(
        String(50),
        ForeignKey("connections.id"),
        index=True,
    )
    ip_address: Mapped[str | None] = mapped_column(String(50), nullable=True)
    port: Mapped[int | None] = mapped_column(Integer, nullable=True)
    com_port: Mapped[str | None] = mapped_column(String(50), nullable=True)
    connection_parameters: Mapped[str | None] = mapped_column(String(255), nullable=True)

    scan_mode: Mapped[str | None] = mapped_column(String(50), nullable=True, default="Manual Scan")

    status_id: Mapped[str] = mapped_column(
        String(50),
        ForeignKey("device_status.id"),
        index=True,
        default="online",
    )
    last_seen: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    firmware_version: Mapped[str | None] = mapped_column(String(100), nullable=True)
    last_error: Mapped[str | None] = mapped_column(String(255), nullable=True)

    battery_level: Mapped[int | None] = mapped_column(Integer, nullable=True)
    signal_strength_dbm: Mapped[int | None] = mapped_column(Integer, nullable=True)
    antenna_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    frequency_band: Mapped[str | None] = mapped_column(String(100), nullable=True)
    baud_rate: Mapped[str | None] = mapped_column(String(50), nullable=True)
    last_maintenance: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    assigned_operator: Mapped[str | None] = mapped_column(String(100), nullable=True)
    brand: Mapped[str | None] = mapped_column(String(100), nullable=True)

    created_on: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    created_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    updated_on: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=True,
    )
    updated_by: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Relationships
    category: Mapped["DeviceCategory"] = relationship(back_populates="devices")
    connection: Mapped["Connection"] = relationship(back_populates="devices")
    status: Mapped["DeviceStatus"] = relationship(back_populates="devices")


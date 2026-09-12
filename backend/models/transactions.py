from datetime import datetime, timezone
from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from utils.database import Base


class StatusTransactionData(Base):
    __tablename__ = "status_transaction_data"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)  # 'wip' | 'dispatch'
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


class TransactionData(Base):
    """
    Marriage transaction record connecting:
    - Master Data Item (material_code / part_number / category_id)
    - Hardware Scanner Device (scanner_device -> devices.device_id)
    - Operator / Role (created_by)
    """
    __tablename__ = "transactions_data"

    sno: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    transaction_id: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    factory_rfid_tag_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    work_order_no: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)

    material_code: Mapped[str] = mapped_column(
        String(100),
        ForeignKey("master_data_items.material_code"),
        index=True,
    )
    part_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    category_id: Mapped[str | None] = mapped_column(
        String(50),
        ForeignKey("fg_category.id"),
        nullable=True,
    )
    scanner_device: Mapped[str | None] = mapped_column(
        String(100),
        ForeignKey("devices.device_id"),
        nullable=True,
    )

    product_validation_timestamp: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    status_id: Mapped[str] = mapped_column(
        String(50),
        ForeignKey("status_transaction_data.id"),
        default="wip",
    )
    label_lookup_timestamp: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

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

    # Relationships connecting the pillars
    status: Mapped["StatusTransactionData"] = relationship()
    device: Mapped["Device"] = relationship(foreign_keys=[scanner_device])
    master_item: Mapped["MasterDataItem"] = relationship(foreign_keys=[material_code])

from datetime import datetime, timezone
from sqlalchemy import DateTime, ForeignKey, Integer, JSON, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from utils.database import Base


class FgCategory(Base):
    __tablename__ = "fg_category"

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

    # Relationship to master_data_items
    items: Mapped[list["MasterDataItem"]] = relationship(
        back_populates="category",
        cascade="all, delete-orphan",
    )


class FgStatus(Base):
    __tablename__ = "fg_status"

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

    # Relationship to master_data_items
    items: Mapped[list["MasterDataItem"]] = relationship(
        back_populates="status",
    )


class MasterDataItem(Base):
    __tablename__ = "master_data_items"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    fg_image: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    material_code: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    part_number: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    category_id: Mapped[str] = mapped_column(
        String(50),
        ForeignKey("fg_category.id"),
        index=True,
    )
    model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    product_description: Mapped[str | None] = mapped_column(Text, nullable=True)

    length_mm: Mapped[int | None] = mapped_column(Integer, nullable=True)
    width_mm: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height_mm: Mapped[int | None] = mapped_column(Integer, nullable=True)

    net_weight: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    gross_weight: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    package_type: Mapped[str | None] = mapped_column(String(100), nullable=True)

    status_id: Mapped[str] = mapped_column(
        String(50),
        ForeignKey("fg_status.id"),
        index=True,
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

    # Relationships
    category: Mapped["FgCategory"] = relationship(back_populates="items")
    status: Mapped["FgStatus"] = relationship(back_populates="items")


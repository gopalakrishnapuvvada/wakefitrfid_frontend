from __future__ import annotations
from typing import Any, Dict, List, Optional, Union
import os
from pathlib import Path
from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

import sys

if getattr(sys, 'frozen', False):
    BACKEND_DIR = Path(sys.executable).resolve().parent
else:
    BACKEND_DIR = Path(__file__).resolve().parent.parent

DB_PATH = BACKEND_DIR / "dummy.db"
DATABASE_URL = os.environ.get("DATABASE_URL", f"sqlite:///{DB_PATH}")


engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
)


@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    if DATABASE_URL.startswith("sqlite"):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    pass


def migrate_legacy_devices_table() -> None:
    """Replace the former expanded SQLite device table with the minimal model."""
    if engine.dialect.name != "sqlite":
        return

    with engine.connect() as connection:
        columns = connection.exec_driver_sql("PRAGMA table_info(devices)").fetchall()
        if not columns or any(column[1] == "name" for column in columns):
            return

        connection.exec_driver_sql("PRAGMA foreign_keys=OFF")
        connection.commit()
        try:
            connection.exec_driver_sql("BEGIN IMMEDIATE")
            connection.exec_driver_sql(
                """
                CREATE TABLE devices_minimal (
                    device_id VARCHAR(100) NOT NULL PRIMARY KEY,
                    name VARCHAR(150) NOT NULL,
                    ip_address VARCHAR(50),
                    mac_address VARCHAR(50),
                    make VARCHAR(100),
                    port INTEGER,
                    created_on DATETIME NOT NULL,
                    updated_on DATETIME,
                    created_by VARCHAR(100),
                    updated_by VARCHAR(100)
                )
                """
            )
            connection.exec_driver_sql(
                """
                INSERT INTO devices_minimal (
                    device_id, name, ip_address, mac_address, make, port,
                    created_on, updated_on, created_by, updated_by
                )
                SELECT
                    device_id,
                    COALESCE(NULLIF(TRIM(display_name), ''), NULLIF(TRIM(asset_code), ''), device_id),
                    ip_address,
                    mac_address,
                    COALESCE(NULLIF(TRIM(manufacturer), ''), NULLIF(TRIM(brand), ''), 'Unknown'),
                    port,
                    created_on,
                    updated_on,
                    created_by,
                    updated_by
                FROM devices
                """
            )
            connection.exec_driver_sql("DROP TABLE devices")
            connection.exec_driver_sql("ALTER TABLE devices_minimal RENAME TO devices")
            connection.exec_driver_sql("CREATE INDEX ix_devices_name ON devices (name)")
            connection.exec_driver_sql("CREATE INDEX ix_devices_ip_address ON devices (ip_address)")
            connection.exec_driver_sql("CREATE INDEX ix_devices_mac_address ON devices (mac_address)")
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.exec_driver_sql("PRAGMA foreign_keys=ON")
            connection.commit()


def migrate_master_data_items_table() -> None:
    """Migrate master_data_items SQLite table to replace net_weight and gross_weight with color."""
    if engine.dialect.name != "sqlite":
        return

    with engine.connect() as connection:
        columns = connection.exec_driver_sql("PRAGMA table_info(master_data_items)").fetchall()
        if not columns:
            return

        col_names = [column[1] for column in columns]
        has_weight = "net_weight" in col_names or "gross_weight" in col_names
        has_color = "color" in col_names

        if not has_weight and has_color:
            return

        connection.exec_driver_sql("PRAGMA foreign_keys=OFF")
        connection.commit()
        try:
            connection.exec_driver_sql("BEGIN IMMEDIATE")
            connection.exec_driver_sql(
                """
                CREATE TABLE master_data_items_migrated (
                    id VARCHAR(50) NOT NULL PRIMARY KEY,
                    fg_image JSON,
                    material_code VARCHAR(100) NOT NULL,
                    part_number VARCHAR(100) NOT NULL,
                    category_id VARCHAR(50) NOT NULL,
                    model VARCHAR(100),
                    product_description TEXT,
                    length_mm INTEGER,
                    width_mm INTEGER,
                    height_mm INTEGER,
                    color VARCHAR(100),
                    package_type VARCHAR(100),
                    status_id VARCHAR(50) NOT NULL,
                    created_on DATETIME NOT NULL,
                    created_by VARCHAR(100),
                    updated_on DATETIME,
                    updated_by VARCHAR(100),
                    FOREIGN KEY(category_id) REFERENCES fg_category (id),
                    FOREIGN KEY(status_id) REFERENCES fg_status (id)
                )
                """
            )
            color_expr = "color" if has_color else "'Classic Grey'"
            connection.exec_driver_sql(
                f"""
                INSERT INTO master_data_items_migrated (
                    id, fg_image, material_code, part_number, category_id,
                    model, product_description, length_mm, width_mm, height_mm,
                    color, package_type, status_id, created_on, created_by,
                    updated_on, updated_by
                )
                SELECT
                    id, fg_image, material_code, part_number, category_id,
                    model, product_description, length_mm, width_mm, height_mm,
                    {color_expr}, package_type, status_id, created_on, created_by,
                    updated_on, updated_by
                FROM master_data_items
                """
            )
            connection.exec_driver_sql("DROP TABLE master_data_items")
            connection.exec_driver_sql("ALTER TABLE master_data_items_migrated RENAME TO master_data_items")
            connection.exec_driver_sql("CREATE UNIQUE INDEX ix_master_data_items_material_code ON master_data_items (material_code)")
            connection.exec_driver_sql("CREATE UNIQUE INDEX ix_master_data_items_part_number ON master_data_items (part_number)")
            connection.exec_driver_sql("CREATE INDEX ix_master_data_items_category_id ON master_data_items (category_id)")
            connection.exec_driver_sql("CREATE INDEX ix_master_data_items_status_id ON master_data_items (status_id)")
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.exec_driver_sql("PRAGMA foreign_keys=ON")
            connection.commit()


def migrate_transactions_data_table() -> None:
    """Ensure image_paths column exists in transactions_data SQLite table."""
    if engine.dialect.name != "sqlite":
        return

    with engine.connect() as connection:
        columns = connection.exec_driver_sql("PRAGMA table_info(transactions_data)").fetchall()
        if not columns:
            return

        col_names = [column[1] for column in columns]
        if "image_paths" not in col_names:
            try:
                connection.exec_driver_sql("ALTER TABLE transactions_data ADD COLUMN image_paths TEXT")
                connection.commit()
            except Exception as e:
                print(f"Notice: transactions_data image_paths column addition: {e}")



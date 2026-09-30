import os
from pathlib import Path
from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

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


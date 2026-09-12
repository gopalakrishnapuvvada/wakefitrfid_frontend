from datetime import datetime, timezone
import random
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from models.devices import Connection, Device, DeviceCategory, DeviceStatus
from schemas.devices import (
    ConnectionResponse,
    DeviceCategoryResponse,
    DeviceCreateRequest,
    DeviceResponse,
    DeviceStatusResponse,
    DeviceUpdateRequest,
)
from utils.dependencies import get_db

router = APIRouter(
    tags=["Auto-ID Hardware Devices"],
)


def resolve_device_category(db: Session, category_id: str | None, category_name: str | None) -> str:
    if category_id:
        cat = db.query(DeviceCategory).filter(
            or_(
                DeviceCategory.id.ilike(category_id),
                DeviceCategory.name.ilike(category_id),
            )
        ).first()
        if cat:
            return cat.id
    if category_name:
        cat = db.query(DeviceCategory).filter(
            or_(
                DeviceCategory.name.ilike(category_name),
                DeviceCategory.id.ilike(category_name),
            )
        ).first()
        if cat:
            return cat.id
        cat_id = category_name.lower().replace(" ", "_").replace("-", "_")
        new_cat = DeviceCategory(id=cat_id, name=category_name, created_by="admin")
        db.add(new_cat)
        db.flush()
        return new_cat.id

    first_cat = db.query(DeviceCategory).first()
    if first_cat:
        return first_cat.id
    new_cat = DeviceCategory(id="handheld", name="Handheld Scanner", created_by="admin")
    db.add(new_cat)
    db.flush()
    return new_cat.id


def resolve_connection(db: Session, connection_id: str | None, connection_type: str | None) -> str:
    identifier = connection_id or connection_type
    if identifier:
        conn = db.query(Connection).filter(
            or_(
                Connection.id.ilike(identifier),
                Connection.name.ilike(identifier),
            )
        ).first()
        if conn:
            return conn.id
        conn_id = identifier.lower().replace(" ", "_").replace("/", "_").replace("-", "_")
        new_conn = Connection(id=conn_id, name=identifier, created_by="admin")
        db.add(new_conn)
        db.flush()
        return new_conn.id

    first_conn = db.query(Connection).first()
    if first_conn:
        return first_conn.id
    new_conn = Connection(id="tcp_ip", name="TCP/IP", created_by="admin")
    db.add(new_conn)
    db.flush()
    return new_conn.id


def resolve_device_status(db: Session, status_id: str | None, status_name: str | None) -> str:
    identifier = status_id or status_name
    if identifier:
        st = db.query(DeviceStatus).filter(
            or_(
                DeviceStatus.id.ilike(identifier),
                DeviceStatus.name.ilike(identifier),
            )
        ).first()
        if st:
            return st.id
        st_id = identifier.lower().replace(" ", "_")
        new_st = DeviceStatus(id=st_id, name=identifier, created_by="admin")
        db.add(new_st)
        db.flush()
        return new_st.id

    first_st = db.query(DeviceStatus).first()
    if first_st:
        return first_st.id
    new_st = DeviceStatus(id="online", name="online", created_by="admin")
    db.add(new_st)
    db.flush()
    return new_st.id


# ==============================================================================
# Hardware Lookups
# ==============================================================================
@router.get("/categories", response_model=list[DeviceCategoryResponse])
def get_device_categories(db: Annotated[Session, Depends(get_db)]):
    return db.query(DeviceCategory).order_by(DeviceCategory.name).all()


@router.get("/connections", response_model=list[ConnectionResponse])
def get_device_connections(db: Annotated[Session, Depends(get_db)]):
    return db.query(Connection).order_by(Connection.name).all()


@router.get("/statuses", response_model=list[DeviceStatusResponse])
def get_device_statuses(db: Annotated[Session, Depends(get_db)]):
    return db.query(DeviceStatus).order_by(DeviceStatus.name).all()


# ==============================================================================
# Device CRUD Endpoints
# ==============================================================================
@router.get("/get_devices_data", response_model=list[DeviceResponse])
@router.get("/", response_model=list[DeviceResponse])
def get_devices_data(
    db: Annotated[Session, Depends(get_db)],
    category_id: str | None = None,
    status_id: str | None = None,
    search: str | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
):
    query = db.query(Device).options(
        joinedload(Device.category),
        joinedload(Device.connection),
        joinedload(Device.status),
    )

    if category_id and category_id.upper() != "ALL":
        query = query.filter(Device.category_id == category_id)

    if status_id and status_id.upper() != "ALL":
        query = query.filter(Device.status_id == status_id)

    if search:
        term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Device.display_name.ilike(term),
                Device.asset_code.ilike(term),
                Device.serial_number.ilike(term),
                Device.ip_address.ilike(term),
                Device.station_id.ilike(term),
            )
        )

    return query.order_by(Device.created_on.desc()).offset(skip).limit(limit).all()


@router.get("/{device_id}", response_model=DeviceResponse)
def get_device_by_id(
    device_id: str,
    db: Annotated[Session, Depends(get_db)],
):
    clean_id = device_id.strip()
    device = (
        db.query(Device)
        .options(
            joinedload(Device.category),
            joinedload(Device.connection),
            joinedload(Device.status),
        )
        .filter(
            or_(
                Device.device_id == clean_id,
                Device.asset_code == clean_id,
                Device.serial_number == clean_id,
            )
        )
        .first()
    )

    if not device:
        raise HTTPException(status_code=404, detail=f"Device '{clean_id}' not found.")

    return device


@router.post("/post_devices_data", response_model=DeviceResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=DeviceResponse, status_code=status.HTTP_201_CREATED)
def post_devices_data(
    payload: DeviceCreateRequest,
    db: Annotated[Session, Depends(get_db)],
):
    device_id = payload.device_id or payload.id or str(uuid4())
    display_name = payload.display_name or payload.name
    if not display_name:
        raise HTTPException(status_code=400, detail="Device displayName is required.")

    existing = db.query(Device).filter(Device.device_id == device_id).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Device with ID '{device_id}' already exists.")

    asset_code = payload.asset_code or payload.code
    cat_id = resolve_device_category(db, payload.category_id, payload.category)
    conn_id = resolve_connection(db, payload.connection_id, payload.connection_type)
    stat_id = resolve_device_status(db, payload.status_id, payload.status)
    station_id = payload.station_id or payload.location_line
    scan_mode = payload.scan_mode or payload.trigger_mode or "Manual Scan"

    now = datetime.now(timezone.utc)
    new_device = Device(
        device_id=device_id,
        display_name=display_name,
        asset_code=asset_code,
        category_id=cat_id,
        manufacturer=payload.manufacturer,
        model=payload.model,
        serial_number=payload.serial_number,
        mac_address=payload.mac_address,
        station_id=station_id,
        connection_id=conn_id,
        ip_address=payload.ip_address,
        port=payload.port,
        com_port=payload.com_port,
        connection_parameters=payload.connection_parameters,
        scan_mode=scan_mode,
        status_id=stat_id,
        last_seen=now,
        firmware_version=payload.firmware_version,
        last_error=payload.last_error,
        battery_level=payload.battery_level,
        signal_strength_dbm=payload.signal_strength_dbm,
        antenna_count=payload.antenna_count,
        frequency_band=payload.frequency_band,
        baud_rate=payload.baud_rate,
        last_maintenance=payload.last_maintenance or now,
        assigned_operator=payload.assigned_operator,
        brand=payload.brand,
        created_by=payload.created_by or "admin",
        updated_by=payload.created_by or "admin",
    )

    db.add(new_device)
    db.commit()

    return (
        db.query(Device)
        .options(
            joinedload(Device.category),
            joinedload(Device.connection),
            joinedload(Device.status),
        )
        .filter(Device.device_id == new_device.device_id)
        .first()
    )


@router.put("/update_devices_data", response_model=DeviceResponse)
@router.put("/", response_model=DeviceResponse)
def update_devices_data(
    payload: DeviceUpdateRequest,
    db: Annotated[Session, Depends(get_db)],
):
    target_id = payload.device_id or payload.id
    if not target_id:
        raise HTTPException(status_code=400, detail="Missing device_id in request.")

    device = db.query(Device).filter(Device.device_id == target_id).first()
    if not device:
        raise HTTPException(status_code=404, detail=f"Device '{target_id}' not found.")

    if payload.display_name or payload.name:
        device.display_name = payload.display_name or payload.name
    if payload.asset_code or payload.code:
        device.asset_code = payload.asset_code or payload.code
    if payload.category_id or payload.category:
        device.category_id = resolve_device_category(db, payload.category_id, payload.category)
    if payload.connection_id or payload.connection_type:
        device.connection_id = resolve_connection(db, payload.connection_id, payload.connection_type)
    if payload.status_id or payload.status:
        device.status_id = resolve_device_status(db, payload.status_id, payload.status)
    if payload.station_id or payload.location_line:
        device.station_id = payload.station_id or payload.location_line
    if payload.scan_mode or payload.trigger_mode:
        device.scan_mode = payload.scan_mode or payload.trigger_mode

    if payload.manufacturer is not None:
        device.manufacturer = payload.manufacturer
    if payload.model is not None:
        device.model = payload.model
    if payload.serial_number is not None:
        device.serial_number = payload.serial_number
    if payload.mac_address is not None:
        device.mac_address = payload.mac_address
    if payload.ip_address is not None:
        device.ip_address = payload.ip_address
    if payload.port is not None:
        device.port = payload.port
    if payload.com_port is not None:
        device.com_port = payload.com_port
    if payload.connection_parameters is not None:
        device.connection_parameters = payload.connection_parameters
    if payload.firmware_version is not None:
        device.firmware_version = payload.firmware_version
    if payload.last_error is not None:
        device.last_error = payload.last_error
    if payload.battery_level is not None:
        device.battery_level = payload.battery_level
    if payload.signal_strength_dbm is not None:
        device.signal_strength_dbm = payload.signal_strength_dbm
    if payload.antenna_count is not None:
        device.antenna_count = payload.antenna_count
    if payload.frequency_band is not None:
        device.frequency_band = payload.frequency_band
    if payload.baud_rate is not None:
        device.baud_rate = payload.baud_rate
    if payload.last_maintenance is not None:
        device.last_maintenance = payload.last_maintenance
    if payload.assigned_operator is not None:
        device.assigned_operator = payload.assigned_operator
    if payload.brand is not None:
        device.brand = payload.brand

    device.last_seen = datetime.now(timezone.utc)
    device.updated_on = datetime.now(timezone.utc)
    device.updated_by = payload.updated_by or "admin"

    db.commit()

    return (
        db.query(Device)
        .options(
            joinedload(Device.category),
            joinedload(Device.connection),
            joinedload(Device.status),
        )
        .filter(Device.device_id == target_id)
        .first()
    )


@router.put("/{device_id}", response_model=DeviceResponse)
def update_device_by_path(
    device_id: str,
    payload: DeviceUpdateRequest,
    db: Annotated[Session, Depends(get_db)],
):
    payload.device_id = device_id
    return update_devices_data(payload=payload, db=db)


@router.delete("/{device_id}")

def delete_device(
    device_id: str,
    db: Annotated[Session, Depends(get_db)],
):
    device = db.query(Device).filter(Device.device_id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail=f"Device '{device_id}' not found.")

    db.delete(device)
    db.commit()
    return {"success": True, "message": f"Device '{device_id}' deleted successfully."}


@router.get("/ping/{device_id}")
def ping_device(
    device_id: str,
    db: Annotated[Session, Depends(get_db)],
):
    """Simulate network ping and telemetry echo reply for hardware diagnostic."""
    device = db.query(Device).filter(Device.device_id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail=f"Device '{device_id}' not found.")

    is_online = device.status_id != "offline"
    latency = random.randint(5, 28)

    if is_online:
        device.last_seen = datetime.now(timezone.utc)
        db.commit()
        return {
            "success": True,
            "latencyMs": latency,
            "message": f"Echo reply from {device.ip_address or device.com_port or device.mac_address}: bytes=32 time={latency}ms TTL=64 (Healthy Status)",
        }
    else:
        return {
            "success": False,
            "latencyMs": 0,
            "message": f"Request timed out: Device {device.display_name} is unreachable. Check network switch / battery.",
        }

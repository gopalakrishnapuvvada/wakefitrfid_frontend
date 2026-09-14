from datetime import datetime, timezone
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from models.master_data import FgCategory, FgStatus, MasterDataItem
from models.roles import Role
from models.devices import Device, DeviceCategory, Connection, DeviceStatus
from models.transactions import TransactionData
from schemas.master_data import (
    FgCategoryCreate,
    FgCategoryResponse,
    FgStatusCreate,
    FgStatusResponse,
    MasterDataItemCreate,
    MasterDataItemResponse,
    MasterDataItemUpdate,
    MasterDataListResponse,
)
from schemas.roles import RoleResponse, RoleUpdatePasswordRequest
from schemas.devices import DeviceCreateRequest, DeviceUpdateRequest, DeviceResponse
from utils.dependencies import get_db


router = APIRouter(
    tags=["Master Data Items"],
)


# ==============================================================================
# Categories & Statuses Helper Endpoints
# ==============================================================================

@router.get("/categories", response_model=list[FgCategoryResponse])
def get_categories(db: Annotated[Session, Depends(get_db)]):
    return db.query(FgCategory).order_by(FgCategory.name).all()


@router.post("/categories", response_model=FgCategoryResponse, status_code=status.HTTP_201_CREATED)
def create_category(payload: FgCategoryCreate, db: Annotated[Session, Depends(get_db)]):
    existing = db.query(FgCategory).filter(FgCategory.name == payload.name).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Category '{payload.name}' already exists.")

    cat_id = payload.id or f"cat-{payload.name.lower().replace(' ', '-')}"
    category = FgCategory(
        id=cat_id,
        name=payload.name,
        created_by=payload.created_by or "admin",
    )
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


@router.get("/statuses", response_model=list[FgStatusResponse])
def get_statuses(db: Annotated[Session, Depends(get_db)]):
    return db.query(FgStatus).order_by(FgStatus.name).all()


@router.post("/statuses", response_model=FgStatusResponse, status_code=status.HTTP_201_CREATED)
def create_status(payload: FgStatusCreate, db: Annotated[Session, Depends(get_db)]):
    existing = db.query(FgStatus).filter(FgStatus.name == payload.name).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Status '{payload.name}' already exists.")

    status_id = payload.id or payload.name.lower().replace(" ", "_")
    fg_status = FgStatus(
        id=status_id,
        name=payload.name,
        created_by=payload.created_by or "admin",
    )
    db.add(fg_status)
    db.commit()
    db.refresh(fg_status)
    return fg_status


# ==============================================================================
# Helper resolution functions
# ==============================================================================

def resolve_category(db: Session, category_id: str | None, category_name: str | None) -> str:
    if category_id:
        cat = db.query(FgCategory).filter(FgCategory.id == category_id).first()
        if cat:
            return cat.id
    if category_name:
        cat = db.query(FgCategory).filter(
            or_(
                FgCategory.name.ilike(category_name),
                FgCategory.id.ilike(category_name)
            )
        ).first()
        if cat:
            return cat.id
        # Create category on the fly if not found
        cat_id = f"cat-{category_name.lower().replace(' ', '-')}"
        new_cat = FgCategory(id=cat_id, name=category_name, created_by="admin")
        db.add(new_cat)
        db.flush()
        return new_cat.id

    first_cat = db.query(FgCategory).first()
    if first_cat:
        return first_cat.id
    new_cat = FgCategory(id="cat-mattress", name="Mattress", created_by="admin")
    db.add(new_cat)
    db.flush()
    return new_cat.id


def resolve_status(db: Session, status_id: str | None, status_name: str | None) -> str:
    if status_id:
        st = db.query(FgStatus).filter(FgStatus.id == status_id).first()
        if st:
            return st.id
    if status_name:
        st = db.query(FgStatus).filter(
            or_(
                FgStatus.name.ilike(status_name),
                FgStatus.id.ilike(status_name)
            )
        ).first()
        if st:
            return st.id
        status_id = status_name.lower().replace(" ", "_")
        new_st = FgStatus(id=status_id, name=status_name, created_by="admin")
        db.add(new_st)
        db.flush()
        return new_st.id

    first_st = db.query(FgStatus).first()
    if first_st:
        return first_st.id
    new_st = FgStatus(id="active", name="Active", created_by="admin")
    db.add(new_st)
    db.flush()
    return new_st.id


# ==============================================================================
# Master Data Items Endpoints
# ==============================================================================

@router.get("/", response_model=list[MasterDataItemResponse])
def get_master_data_items(
    db: Annotated[Session, Depends(get_db)],
    category_id: str | None = None,
    status_id: str | None = None,
    search: str | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
):
    query = db.query(MasterDataItem).options(
        joinedload(MasterDataItem.category),
        joinedload(MasterDataItem.status),
    )

    if category_id and category_id.upper() != "ALL":
        query = query.filter(MasterDataItem.category_id == category_id)

    if status_id and status_id.upper() != "ALL":
        query = query.filter(MasterDataItem.status_id == status_id)

    if search:
        term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                MasterDataItem.material_code.ilike(term),
                MasterDataItem.part_number.ilike(term),
                MasterDataItem.model.ilike(term),
                MasterDataItem.product_description.ilike(term),
            )
        )

    return query.order_by(MasterDataItem.created_on.desc()).offset(skip).limit(limit).all()


@router.get("/catalog", response_model=MasterDataListResponse)
def get_catalog_wrapped(
    db: Annotated[Session, Depends(get_db)],
    category_id: str | None = None,
    status_id: str | None = None,
    search: str | None = None,
):
    items = get_master_data_items(db, category_id=category_id, status_id=status_id, search=search, skip=0, limit=500)
    return MasterDataListResponse(
        success=True,
        count=len(items),
        data=items,
    )


# ==============================================================================
# Direct Endpoints for Roles and Devices on Master Data Router
# (Requested endpoints: get_roles_data, update_roles_password,
#  get_devices_data, post_devices_data, update_devices_data)
# ==============================================================================

@router.get("/get_roles_data", response_model=list[RoleResponse])
def get_roles_data_endpoint(db: Annotated[Session, Depends(get_db)]):
    from api.routers.roles import get_roles_data
    return get_roles_data(db)


@router.put("/update_roles_password")
def update_roles_password_endpoint(
    payload: RoleUpdatePasswordRequest,
    db: Annotated[Session, Depends(get_db)],
):
    from api.routers.roles import update_roles_password
    return update_roles_password(payload, db)


@router.get("/get_devices_data", response_model=list[DeviceResponse])
def get_devices_data_endpoint(
    db: Annotated[Session, Depends(get_db)],
    category_id: str | None = None,
    status_id: str | None = None,
    search: str | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
):
    from api.routers.devices import get_devices_data
    return get_devices_data(db, category_id, status_id, search, skip, limit)


@router.post("/post_devices_data", response_model=DeviceResponse, status_code=status.HTTP_201_CREATED)
def post_devices_data_endpoint(
    payload: DeviceCreateRequest,
    db: Annotated[Session, Depends(get_db)],
):
    from api.routers.devices import post_devices_data
    return post_devices_data(payload, db)


@router.put("/update_devices_data", response_model=DeviceResponse)
def update_devices_data_endpoint(
    payload: DeviceUpdateRequest,
    db: Annotated[Session, Depends(get_db)],
):
    from api.routers.devices import update_devices_data
    return update_devices_data(payload, db)


@router.post("/post_scan")
@router.post("/post_can")
def post_scan_endpoint(
    payload: dict,
    db: Annotated[Session, Depends(get_db)],
):
    from api.routers.transactions import post_scan
    from schemas.transactions import PostScanRequest
    req = PostScanRequest(**payload)
    return post_scan(req, db)


post_can_endpoint = post_scan_endpoint


@router.get("/{identifier}", response_model=MasterDataItemResponse)
def get_master_data_item_by_identifier(
    identifier: str,
    db: Annotated[Session, Depends(get_db)],
):
    clean_id = identifier.strip()
    item = (
        db.query(MasterDataItem)
        .options(
            joinedload(MasterDataItem.category),
            joinedload(MasterDataItem.status),
        )
        .filter(
            or_(
                MasterDataItem.id == clean_id,
                MasterDataItem.material_code == clean_id,
                MasterDataItem.part_number == clean_id,
            )
        )
        .first()
    )

    if not item:
        raise HTTPException(
            status_code=404,
            detail=f"Master data item with ID, Material Code, or Part Number '{clean_id}' not found.",
        )

    return item


@router.post("/", response_model=MasterDataItemResponse, status_code=status.HTTP_201_CREATED)
def create_master_data_item(
    payload: MasterDataItemCreate,
    db: Annotated[Session, Depends(get_db)],
):
    # Uniqueness checks
    existing_mat = db.query(MasterDataItem).filter(
        MasterDataItem.material_code == payload.material_code.strip()
    ).first()
    if existing_mat:
        raise HTTPException(
            status_code=400,
            detail=f"Item with Material Code '{payload.material_code}' already exists (ID: {existing_mat.id}).",
        )

    existing_part = db.query(MasterDataItem).filter(
        MasterDataItem.part_number == payload.part_number.strip()
    ).first()
    if existing_part:
        raise HTTPException(
            status_code=400,
            detail=f"Item with Part Number '{payload.part_number}' already exists (ID: {existing_part.id}).",
        )

    cat_id = resolve_category(db, payload.category_id, payload.category)
    stat_id = resolve_status(db, payload.status_id, payload.status)

    # Dimensions handling
    length = payload.dimensions.length_mm if payload.dimensions else payload.length_mm
    width = payload.dimensions.width_mm if payload.dimensions else payload.width_mm
    height = payload.dimensions.height_mm if payload.dimensions else payload.height_mm

    item_id = payload.id.strip() if payload.id else f"md-{uuid4().hex[:6]}"

    new_item = MasterDataItem(
        id=item_id,
        fg_image=payload.fg_image,
        material_code=payload.material_code.strip(),
        part_number=payload.part_number.strip(),
        category_id=cat_id,
        model=payload.model,
        product_description=payload.product_description,
        length_mm=length,
        width_mm=width,
        height_mm=height,
        net_weight=payload.net_weight,
        gross_weight=payload.gross_weight,
        package_type=payload.package_type,
        status_id=stat_id,
        created_by=payload.created_by or "admin",
        updated_by=payload.created_by or "admin",
    )

    db.add(new_item)
    db.commit()

    return get_master_data_item_by_identifier(new_item.id, db)


@router.put("/{id}", response_model=MasterDataItemResponse)
def update_master_data_item(
    id: str,
    payload: MasterDataItemUpdate,
    db: Annotated[Session, Depends(get_db)],
):
    item = db.query(MasterDataItem).filter(MasterDataItem.id == id).first()
    if not item:
        raise HTTPException(status_code=404, detail=f"Master data item '{id}' not found.")

    if payload.material_code is not None and payload.material_code.strip() != item.material_code:
        conflict = db.query(MasterDataItem).filter(
            MasterDataItem.material_code == payload.material_code.strip(),
            MasterDataItem.id != id,
        ).first()
        if conflict:
            raise HTTPException(status_code=400, detail=f"Material Code '{payload.material_code}' is already used.")
        item.material_code = payload.material_code.strip()

    if payload.part_number is not None and payload.part_number.strip() != item.part_number:
        conflict = db.query(MasterDataItem).filter(
            MasterDataItem.part_number == payload.part_number.strip(),
            MasterDataItem.id != id,
        ).first()
        if conflict:
            raise HTTPException(status_code=400, detail=f"Part Number '{payload.part_number}' is already used.")
        item.part_number = payload.part_number.strip()

    if payload.category_id or payload.category:
        item.category_id = resolve_category(db, payload.category_id, payload.category)

    if payload.status_id or payload.status:
        item.status_id = resolve_status(db, payload.status_id, payload.status)

    if payload.fg_image is not None:
        item.fg_image = payload.fg_image
    if payload.model is not None:
        item.model = payload.model
    if payload.product_description is not None:
        item.product_description = payload.product_description

    # Dimensions
    if payload.dimensions:
        item.length_mm = payload.dimensions.length_mm
        item.width_mm = payload.dimensions.width_mm
        item.height_mm = payload.dimensions.height_mm
    else:
        if payload.length_mm is not None:
            item.length_mm = payload.length_mm
        if payload.width_mm is not None:
            item.width_mm = payload.width_mm
        if payload.height_mm is not None:
            item.height_mm = payload.height_mm

    if payload.net_weight is not None:
        item.net_weight = payload.net_weight
    if payload.gross_weight is not None:
        item.gross_weight = payload.gross_weight
    if payload.package_type is not None:
        item.package_type = payload.package_type

    item.updated_by = payload.updated_by or "admin"
    item.updated_on = datetime.now(timezone.utc)

    db.commit()

    return get_master_data_item_by_identifier(id, db)


@router.delete("/{id}")
def delete_master_data_item(
    id: str,
    db: Annotated[Session, Depends(get_db)],
):
    clean_id = id.strip()
    item = (
        db.query(MasterDataItem)
        .filter(
            or_(
                MasterDataItem.id == clean_id,
                MasterDataItem.material_code == clean_id,
            )
        )
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail=f"Master data item '{clean_id}' not found.")

    # Foreign Key check: Restrict deletion if corresponding transactions exist in Transaction Data
    linked_txn_count = (
        db.query(func.count(TransactionData.sno))
        .filter(TransactionData.material_code == item.material_code)
        .scalar()
        or 0
    )
    if linked_txn_count > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Cannot delete Master Data SKU '{item.material_code}': "
                f"{linked_txn_count} corresponding transaction record(s) exist in Transaction Data linked to this material code. "
                "Deletion is restricted by foreign key relationship. Please remove or archive linked transactions first."
            ),
        )

    try:
        db.delete(item)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Cannot delete Master Data SKU '{item.material_code}': "
                "Foreign key constraint violation. Associated transactions exist in the database."
            ),
        )

    return {"success": True, "message": f"Master Data item '{item.material_code}' deleted successfully"}


@router.post("/seed")
def seed_master_data(db: Annotated[Session, Depends(get_db)]):
    """
    Seeds initial standard roles, devices, FG categories, FG statuses, and realistic
    Wakefit finished goods items matching the frontend mock catalog.
    """
    # 1. Seed Roles
    roles_data = [
        {"id": "admin", "name": "System Administrator", "password": "admin"},
        {"id": "supervisor", "name": "Production Supervisor", "password": "supervisor"},
        {"id": "operator", "name": "Line Operator", "password": "operator"},
    ]
    for r in roles_data:
        if not db.query(Role).filter(Role.id == r["id"]).first():
            db.add(Role(id=r["id"], name=r["name"], password=r["password"], created_by="seed"))

    # 2. Seed Device Lookups
    device_categories = [
        {"id": "handheld", "name": "Handheld Mobile Computer"},
        {"id": "rfid_fixed", "name": "Fixed RFID Reader Portal"},
        {"id": "gateway", "name": "Edge IoT Gateway"},
        {"id": "barcode", "name": "Industrial Barcode Scanner"},
    ]
    for dc in device_categories:
        if not db.query(DeviceCategory).filter(DeviceCategory.id == dc["id"]).first():
            db.add(DeviceCategory(id=dc["id"], name=dc["name"], created_by="seed"))

    connections = [
        {"id": "tcp_ip", "name": "TCP/IP"},
        {"id": "serial", "name": "Serial (RS-232)"},
        {"id": "usb_hid", "name": "USB-HID"},
        {"id": "bluetooth", "name": "Bluetooth"},
        {"id": "websocket", "name": "Websocket"},
    ]
    for c in connections:
        if not db.query(Connection).filter(Connection.id == c["id"]).first():
            db.add(Connection(id=c["id"], name=c["name"], created_by="seed"))

    device_statuses = [
        {"id": "online", "name": "online"},
        {"id": "offline", "name": "offline"},
        {"id": "error", "name": "error"},
    ]
    for ds in device_statuses:
        if not db.query(DeviceStatus).filter(DeviceStatus.id == ds["id"]).first():
            db.add(DeviceStatus(id=ds["id"], name=ds["name"], created_by="seed"))

    db.flush()

    # 3. Seed Devices
    initial_devices = [
        {
            "device_id": "f81d4fae-7dec-11d0-a765-00a0c91e6bf6",
            "display_name": "CIPHER RS38 UHF Reader #01 (Station Line 1)",
            "asset_code": "HH-CPR-RS38-01",
            "category_id": "handheld",
            "manufacturer": "CipherLab",
            "model": "CipherLab RS38 UHF-RFID Android Rugged Mobile Computer",
            "serial_number": "SN-CPR-RS38-9921",
            "mac_address": "00:1F:B5:7C:10:01",
            "station_id": "Line 1 - Mattress & Recliner Final Pack",
            "connection_id": "tcp_ip",
            "ip_address": "192.168.10.131",
            "port": 5084,
            "connection_parameters": "Keep-Alive: 15s, Timeout: 3000ms, Protocol: LLRP",
            "scan_mode": "Manual Scan",
            "status_id": "online",
            "firmware_version": "RS38-UHF-v2.14.0",
            "last_error": "None (Healthy)",
            "battery_level": 94,
            "signal_strength_dbm": -48,
            "frequency_band": "865-867 MHz (India UHF RFID)",
            "brand": "CIPHER",
            "assigned_operator": "Ramesh Kumar (Line 1 QA)",
        },
        {
            "device_id": "a3bb189e-8bf2-416b-95a4-783285e6834b",
            "display_name": "CIPHER RS38 UHF Reader #02 (Station Line 2)",
            "asset_code": "HH-CPR-RS38-02",
            "category_id": "handheld",
            "manufacturer": "CipherLab",
            "model": "CipherLab RS38 UHF-RFID Android Rugged Mobile Computer",
            "serial_number": "SN-CPR-RS38-9922",
            "mac_address": "00:1F:B5:7C:10:02",
            "station_id": "Line 2 - Sofa Assembly & Shrink Wrap",
            "connection_id": "tcp_ip",
            "ip_address": "192.168.10.132",
            "port": 5084,
            "connection_parameters": "Keep-Alive: 15s, Timeout: 3000ms, Protocol: LLRP",
            "scan_mode": "Manual Scan",
            "status_id": "online",
            "firmware_version": "RS38-UHF-v2.14.0",
            "last_error": "None (Healthy)",
            "battery_level": 88,
            "signal_strength_dbm": -52,
            "frequency_band": "865-867 MHz (India UHF RFID)",
            "brand": "CIPHER",
            "assigned_operator": "Suresh Patel (Line 2 QA)",
        },
        {
            "device_id": "dev-rf-01",
            "display_name": "Impinj Speedway R420 Fixed Portal #1",
            "asset_code": "FIX-IMP-R420-01",
            "category_id": "rfid_fixed",
            "manufacturer": "Impinj",
            "model": "Impinj Speedway R420 (4-Port UHF)",
            "serial_number": "SN-IMP-R420-7712",
            "mac_address": "00:16:25:A1:04:88",
            "station_id": "Conveyor Main Exit Tunnel (Station 1)",
            "connection_id": "tcp_ip",
            "ip_address": "192.168.20.101",
            "port": 5084,
            "connection_parameters": "LLRP Octane Server v7.6, 4-Antennas, 30 dBm",
            "scan_mode": "Automatic Scan",
            "status_id": "online",
            "firmware_version": "Octane v7.6.0.240",
            "antenna_count": 4,
            "signal_strength_dbm": 30,
            "frequency_band": "865.7 - 867.5 MHz",
            "last_error": "None (Healthy)",
            "brand": "Impinj",
        },
        {
            "device_id": "dev-rf-02",
            "display_name": "Zebra FX9600 Industrial RFID Reader Portal #2",
            "asset_code": "FIX-ZBR-FX96-02",
            "category_id": "rfid_fixed",
            "manufacturer": "Zebra",
            "model": "Zebra FX9600 8-Port High Power",
            "serial_number": "SN-ZBR-FX96-1049",
            "mac_address": "A4:14:37:BC:60:55",
            "station_id": "Automatic Palletizer Portal #2",
            "connection_id": "tcp_ip",
            "ip_address": "192.168.20.102",
            "port": 5084,
            "connection_parameters": "PoE+ Gigabit, 8-Antennas, 31.5 dBm",
            "scan_mode": "Automatic Scan",
            "status_id": "error",
            "firmware_version": "FX9600-v3.10.30",
            "antenna_count": 8,
            "signal_strength_dbm": 31,
            "frequency_band": "865-867 MHz (Max Power 31.5 dBm)",
            "last_error": "Antenna Port 4 VSWR reflection fault (Reachable but cannot scan)",
            "brand": "Zebra",
        },
        {
            "device_id": "dev-gw-01",
            "display_name": "UAIM Edge IoT Hardware Gateway #01",
            "asset_code": "GW-ADV-UNO-01",
            "category_id": "gateway",
            "manufacturer": "Advantech",
            "model": "Advantech UNO-2484G Industrial Edge Gateway",
            "serial_number": "SN-ADV-UNO-8812",
            "mac_address": "00:D0:C9:88:91:01",
            "station_id": "Shop Floor Line 1 Master Edge Hub",
            "connection_id": "tcp_ip",
            "ip_address": "192.168.10.10",
            "port": 1883,
            "connection_parameters": "MQTT Broker & WebSocket Gateway, Dual GbE LAN",
            "scan_mode": "Automatic Scan",
            "status_id": "online",
            "brand": "Advantech",
        },
    ]

    for dev_dict in initial_devices:
        if not db.query(Device).filter(Device.device_id == dev_dict["device_id"]).first():
            db.add(Device(**dev_dict, created_by="seed", updated_by="seed"))

    # 4. Seed FG Categories
    categories_data = [
        {"id": "cat-mattress", "name": "Mattress"},
        {"id": "cat-sofa", "name": "Sofa"},
        {"id": "cat-recliner", "name": "Recliner"},
        {"id": "cat-bed", "name": "Bed Frame"},
        {"id": "cat-pillow", "name": "Pillow"},
    ]
    for cat in categories_data:
        if not db.query(FgCategory).filter(FgCategory.id == cat["id"]).first():
            db.add(FgCategory(id=cat["id"], name=cat["name"], created_by="system"))

    # 5. Seed FG Statuses
    statuses_data = [
        {"id": "active", "name": "Active"},
        {"id": "on_hold", "name": "On hold"},
        {"id": "inactive", "name": "Inactive"},
    ]
    for st in statuses_data:
        if not db.query(FgStatus).filter(FgStatus.id == st["id"]).first():
            db.add(FgStatus(id=st["id"], name=st["name"], created_by="system"))

    db.flush()

    # 6. Seed Realistic Master Data Items
    initial_items = [
        {
            "id": "md-001",
            "fg_image": [
                "https://wakefit-co.s3.ap-south-1.amazonaws.com/img/npl_raw_images/WSFANPRN1FOBL.jpg",
                "/products/mattress_1.jpg",
            ],
            "material_code": "WAK-MAT-787208",
            "part_number": "FG-ORT-KNG-08",
            "category_id": "cat-mattress",
            "model": "Orthopaedic Memory Foam",
            "product_description": "Orthopaedic Memory Foam Mattress (King - 78x72x8 inch)",
            "length_mm": 1981,
            "width_mm": 1828,
            "height_mm": 203,
            "net_weight": 28.5,
            "gross_weight": 31.2,
            "package_type": "Rolled Vacuum Box",
            "status_id": "active",
        },
        {
            "id": "md-002",
            "fg_image": [
                "/products/mattress_2.jpg",
                "https://wakefit-co.s3.ap-south-1.amazonaws.com/img/npl_raw_images/WSFANPRN1FOBL.jpg",
            ],
            "material_code": "WAK-MAT-756006",
            "part_number": "FG-ORT-QUN-06",
            "category_id": "cat-mattress",
            "model": "Dual Comfort Foam",
            "product_description": "Dual Comfort Foam Mattress (Queen - 75x60x6 inch)",
            "length_mm": 1905,
            "width_mm": 1524,
            "height_mm": 152,
            "net_weight": 21.0,
            "gross_weight": 23.4,
            "package_type": "Rolled Vacuum Box",
            "status_id": "active",
        },
        {
            "id": "md-003",
            "fg_image": [
                "https://wakefit-co.s3.ap-south-1.amazonaws.com/img/npl_raw_images/WSFANPRN1FOBL.jpg",
                "/products/sofa_1.jpg",
            ],
            "material_code": "WAK-SOF-NAP-3ST",
            "part_number": "FG-SOF-NAP-NAVY",
            "category_id": "cat-sofa",
            "model": "Napper 3-Seater Premium",
            "product_description": "Napper 3-Seater Premium Fabric Sofa (Navy Blue)",
            "length_mm": 2100,
            "width_mm": 880,
            "height_mm": 850,
            "net_weight": 48.0,
            "gross_weight": 52.5,
            "package_type": "Corrugated Carton Box",
            "status_id": "active",
        },
        {
            "id": "md-004",
            "fg_image": [
                "/products/recliner_1.jpg",
            ],
            "material_code": "WAK-REC-MOT-BRN",
            "part_number": "FG-REC-MOT-CHEST",
            "category_id": "cat-recliner",
            "model": "Motorized Single Seater",
            "product_description": "Motorized Single Seater Recliner with Cup Holder (Chestnut Brown)",
            "length_mm": 980,
            "width_mm": 940,
            "height_mm": 1050,
            "net_weight": 42.0,
            "gross_weight": 46.8,
            "package_type": "Heavy-duty Corrugated Crate",
            "status_id": "active",
        },
        {
            "id": "md-005",
            "fg_image": [
                "/products/bed_1.jpg",
            ],
            "material_code": "WAK-BED-TEK-QN",
            "part_number": "FG-BED-TEK-QN-WLN",
            "category_id": "cat-bed",
            "model": "Teak Wood Queen Bed",
            "product_description": "Teak Wood Queen Bed with Hydraulic Storage (Walnut)",
            "length_mm": 2080,
            "width_mm": 1620,
            "height_mm": 900,
            "net_weight": 85.0,
            "gross_weight": 92.0,
            "package_type": "Heavy-duty Corrugated Crate",
            "status_id": "active",
        },
        {
            "id": "md-006",
            "fg_image": [
                "/products/pillow_1.jpg",
            ],
            "material_code": "WAK-PIL-MEM-STD",
            "part_number": "FG-PIL-MEM-02PK",
            "category_id": "cat-pillow",
            "model": "Cooling Gel Memory Foam Pillow",
            "product_description": "Memory Foam Pillow with Cooling Gel (Pack of 2)",
            "length_mm": 600,
            "width_mm": 400,
            "height_mm": 120,
            "net_weight": 2.8,
            "gross_weight": 3.4,
            "package_type": "Corrugated Carton Box",
            "status_id": "active",
        },
    ]

    seeded_count = 0
    for item_dict in initial_items:
        existing = db.query(MasterDataItem).filter(MasterDataItem.id == item_dict["id"]).first()
        if not existing:
            new_rec = MasterDataItem(
                **item_dict,
                created_by="seed",
                updated_by="seed",
            )
            db.add(new_rec)
            seeded_count += 1

    db.commit()

    total_categories = db.query(FgCategory).count()
    total_statuses = db.query(FgStatus).count()
    total_items = db.query(MasterDataItem).count()

    return {
        "message": "Master data seeded successfully",
        "newlySeededItems": seeded_count,
        "totalCategories": total_categories,
        "totalStatuses": total_statuses,
        "totalMasterDataItems": total_items,
    }




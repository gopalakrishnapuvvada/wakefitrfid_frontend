from __future__ import annotations
from datetime import datetime, timezone
try:
    from typing import Any, Dict, List, Optional, Union
except ImportError:
    from typing_extensions import Annotated, Optional, Union, List, Dict, Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from models.master_data import FgCategory, FgStatus, MasterDataItem
from models.roles import Role
from models.devices import Device
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

@router.get("/categories", response_model=List[FgCategoryResponse])
def get_categories(db: Session = Depends(get_db)):
    return db.query(FgCategory).order_by(FgCategory.name).all()


@router.post("/categories", response_model=FgCategoryResponse, status_code=status.HTTP_201_CREATED)
def create_category(payload: FgCategoryCreate, db: Session = Depends(get_db)):
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


@router.get("/statuses", response_model=List[FgStatusResponse])
def get_statuses(db: Session = Depends(get_db)):
    return db.query(FgStatus).order_by(FgStatus.name).all()


@router.post("/statuses", response_model=FgStatusResponse, status_code=status.HTTP_201_CREATED)
def create_status(payload: FgStatusCreate, db: Session = Depends(get_db)):
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

def resolve_category(db: Session, category_id: Optional[str], category_name: Optional[str]) -> str:
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


def resolve_status(db: Session, status_id: Optional[str], status_name: Optional[str]) -> str:
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

@router.get("/", response_model=List[MasterDataItemResponse])
def get_master_data_items(
    db: Session = Depends(get_db),
    category_id: Optional[str] = None,
    status_id: Optional[str] = None,
    search: Optional[str] = None,
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
    db: Session = Depends(get_db),
    category_id: Optional[str] = None,
    status_id: Optional[str] = None,
    search: Optional[str] = None,
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

@router.get("/get_roles_data", response_model=List[RoleResponse])
def get_roles_data_endpoint(db: Session = Depends(get_db)):
    from api.routers.roles import get_roles_data
    return get_roles_data(db)


@router.put("/update_roles_password")
def update_roles_password_endpoint(
    payload: RoleUpdatePasswordRequest,
    db: Session = Depends(get_db),
):
    from api.routers.roles import update_roles_password
    return update_roles_password(payload, db)


@router.get("/get_devices_data", response_model=List[DeviceResponse])
def get_devices_data_endpoint(
    db: Session = Depends(get_db),
    device_type: Optional[str] = None,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
):
    from api.routers.devices import get_devices_data
    return get_devices_data(db=db, device_type=device_type, search=search, skip=skip, limit=limit)


@router.post("/post_devices_data", response_model=DeviceResponse, status_code=status.HTTP_201_CREATED)
def post_devices_data_endpoint(
    payload: DeviceCreateRequest,
    db: Session = Depends(get_db),
):
    from api.routers.devices import post_devices_data
    return post_devices_data(payload, db)


@router.put("/update_devices_data", response_model=DeviceResponse)
def update_devices_data_endpoint(
    payload: DeviceUpdateRequest,
    db: Session = Depends(get_db),
):
    from api.routers.devices import update_devices_data
    return update_devices_data(payload, db)


@router.post("/post_scan")
@router.post("/post_can")
def post_scan_endpoint(
    payload: dict,
    db: Session = Depends(get_db),
):
    from api.routers.transactions import post_scan
    from schemas.transactions import PostScanRequest
    req = PostScanRequest(**payload)
    return post_scan(req, db)


post_can_endpoint = post_scan_endpoint


@router.get("/{identifier}", response_model=MasterDataItemResponse)
def get_master_data_item_by_identifier(
    identifier: str,
    db: Session = Depends(get_db),
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
    db: Session = Depends(get_db),
):
    # Uniqueness checks
    clean_mat = payload.material_code.strip()
    clean_part = payload.part_number.strip()

    existing_mat = db.query(MasterDataItem).filter(
        func.lower(MasterDataItem.material_code) == clean_mat.lower()
    ).first()
    if existing_mat:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Duplicate Validation: Material Code '{clean_mat}' already exists in Master Data (Item ID: {existing_mat.id}). Material Code must be unique across all items.",
        )

    existing_part = db.query(MasterDataItem).filter(
        func.lower(MasterDataItem.part_number) == clean_part.lower()
    ).first()
    if existing_part:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Duplicate Validation: Part Number '{clean_part}' already exists in Master Data (Item ID: {existing_part.id}). Part Number must be unique across all items.",
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
        color=payload.color,
        status_id=stat_id,
        created_by=payload.created_by or "admin",
        updated_by=payload.created_by or "admin",
    )

    try:
        db.add(new_item)
        db.commit()
    except IntegrityError as e:
        db.rollback()
        err_msg = str(e.orig) if hasattr(e, "orig") else str(e)
        if "material_code" in err_msg.lower():
            detail = f"Duplicate Validation: Material Code '{clean_mat}' already exists in the database. Material Code must be unique."
        elif "part_number" in err_msg.lower():
            detail = f"Duplicate Validation: Part Number '{clean_part}' already exists in the database. Part Number must be unique."
        else:
            detail = f"Database Unique Constraint Violation: {err_msg}"
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)

    return get_master_data_item_by_identifier(new_item.id, db)


@router.put("/{id}", response_model=MasterDataItemResponse)
def update_master_data_item(
    id: str,
    payload: MasterDataItemUpdate,
    db: Session = Depends(get_db),
):
    item = db.query(MasterDataItem).filter(MasterDataItem.id == id).first()
    if not item:
        raise HTTPException(status_code=404, detail=f"Master data item '{id}' not found.")

    if payload.material_code is not None:
        clean_mat = payload.material_code.strip()
        if clean_mat.lower() != item.material_code.lower():
            conflict = db.query(MasterDataItem).filter(
                func.lower(MasterDataItem.material_code) == clean_mat.lower(),
                MasterDataItem.id != id,
            ).first()
            if conflict:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Duplicate Validation: Material Code '{clean_mat}' is already used by another item (ID: {conflict.id}). Material Code must be unique.",
                )
            item.material_code = clean_mat

    if payload.part_number is not None:
        clean_part = payload.part_number.strip()
        if clean_part.lower() != item.part_number.lower():
            conflict = db.query(MasterDataItem).filter(
                func.lower(MasterDataItem.part_number) == clean_part.lower(),
                MasterDataItem.id != id,
            ).first()
            if conflict:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Duplicate Validation: Part Number '{clean_part}' is already used by another item (ID: {conflict.id}). Part Number must be unique.",
                )
            item.part_number = clean_part

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

    if payload.color is not None:
        item.color = payload.color

    item.updated_by = payload.updated_by or "admin"
    item.updated_on = datetime.now(timezone.utc)

    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        err_msg = str(e.orig) if hasattr(e, "orig") else str(e)
        if "material_code" in err_msg.lower():
            detail = f"Duplicate Validation: Material Code '{payload.material_code}' already exists in the database."
        elif "part_number" in err_msg.lower():
            detail = f"Duplicate Validation: Part Number '{payload.part_number}' already exists in the database."
        else:
            detail = f"Database Unique Constraint Violation: {err_msg}"
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)

    return get_master_data_item_by_identifier(id, db)


@router.delete("/{id}")
def delete_master_data_item(
    id: str,
    db: Session = Depends(get_db),
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
def seed_master_data(db: Session = Depends(get_db)):
    """
    Seeds essential lookup tables (Roles, FG Categories, FG Statuses)
    without inserting hardcoded mock devices or mock products.
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

    # 2. Seed FG Categories
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

    # 3. Seed FG Statuses
    statuses_data = [
        {"id": "active", "name": "Active"},
        {"id": "on_hold", "name": "On hold"},
        {"id": "inactive", "name": "Inactive"},
    ]
    for st in statuses_data:
        if not db.query(FgStatus).filter(FgStatus.id == st["id"]).first():
            db.add(FgStatus(id=st["id"], name=st["name"], created_by="system"))

    db.commit()

    total_categories = db.query(FgCategory).count()
    total_statuses = db.query(FgStatus).count()
    total_items = db.query(MasterDataItem).count()

    return {
        "message": "Master data system lookups seeded successfully",
        "newlySeededItems": 0,
        "totalCategories": total_categories,
        "totalStatuses": total_statuses,
        "totalMasterDataItems": total_items,
    }

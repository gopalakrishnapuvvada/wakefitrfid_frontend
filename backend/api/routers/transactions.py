from datetime import datetime, timezone, timedelta
from typing import Annotated, Any

IST = timezone(timedelta(hours=5, minutes=30))

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from models.devices import Device
from models.master_data import MasterDataItem
from models.transactions import StatusTransactionData, TransactionData
from schemas.transactions import (
    PostCanRequest,
    PostCanResponse,
    PostScanRequest,
    PostScanResponse,
    PostFixedRfidRequest,
    PostFixedRfidResponse,
    StatusTransactionDataResponse,
    TransactionCreateRequest,
    TransactionResponse,
    TransactionStatusUpdateRequest,
)
from schemas.master_data import normalize_fg_image
from utils.dependencies import get_db

router = APIRouter(
    tags=["FG Marriage & Scan Transactions"],
)

# In-memory buffer for latest scanned label awaiting user decision (Queue vs Cancel)
_latest_pending_scan: dict[str, Any] | None = None
_scan_counter: int = 0

# Buffer for SICK fixed portal scans
_latest_pending_fixed_scan: dict[str, Any] | None = None
_fixed_scan_counter: int = 0



@router.get("/statuses", response_model=list[StatusTransactionDataResponse])
def get_transaction_statuses(db: Annotated[Session, Depends(get_db)]):
    return db.query(StatusTransactionData).all()


@router.get("/", response_model=list[TransactionResponse])
def get_transactions(
    db: Annotated[Session, Depends(get_db)],
    status: str | None = None,
    material_code: str | None = None,
    device_id: str | None = None,
    category: str | None = None,
    category_id: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    search: str | None = None,
    skip: int = Query(0, ge=0),
    limit: int | None = Query(None, ge=-1),
):
    query = db.query(TransactionData).options(
        joinedload(TransactionData.master_item),
        joinedload(TransactionData.device),
        joinedload(TransactionData.status),
    )

    if status and status.upper() != "ALL":
        stat_clean = status.lower()
        if stat_clean in ["dispatched", "dispatch"]:
            query = query.filter(TransactionData.status_id.in_(["dispatch", "dispatched"]))
        elif stat_clean == "wip":
            query = query.filter(TransactionData.status_id == "wip")
        else:
            query = query.filter(TransactionData.status_id == "wip")
            query = query.filter(TransactionData.status_id.ilike(f"%{stat_clean}%"))

    if material_code:
        query = query.filter(TransactionData.material_code == material_code)
        query = query.filter(TransactionData.material_code.ilike(material_code.strip()))

    if device_id and device_id.upper() != "ALL":
        query = query.filter(TransactionData.scanner_device == device_id)
        dev_term = f"%{device_id.strip()}%"
        query = query.filter(
            or_(
                TransactionData.scanner_device == device_id.strip(),
                TransactionData.scanner_device.ilike(dev_term),
                TransactionData.device.has(Device.display_name.ilike(dev_term)),
                TransactionData.device.has(Device.asset_code.ilike(dev_term)),
            )
        )

    cat_filter = category_id or category
    if cat_filter and cat_filter.upper() != "ALL":
        cat_term = f"%{cat_filter.strip()}%"
        query = query.filter(
            or_(
                TransactionData.category_id.ilike(cat_term),
                TransactionData.master_item.has(MasterDataItem.category_id.ilike(cat_term)),
            )
        )

    if start_date:
        clean_start = start_date.strip().replace("T", " ")
        if "." in clean_start and "+" in clean_start:
            clean_start = clean_start.split("+")[0]
        try:
            dt_start = datetime.fromisoformat(clean_start)
            if dt_start.tzinfo is not None:
                dt_start = dt_start.astimezone(timezone.utc).replace(tzinfo=None)
            query = query.filter(
                or_(
                    TransactionData.product_validation_timestamp >= dt_start,
                    TransactionData.created_on >= dt_start,
                )
            )
        except Exception:
            pass

    if end_date:
        clean_end = end_date.strip().replace("T", " ")
        if "." in clean_end and "+" in clean_end:
            clean_end = clean_end.split("+")[0]
        try:
            dt_end = datetime.fromisoformat(clean_end)
            if dt_end.tzinfo is not None:
                dt_end = dt_end.astimezone(timezone.utc).replace(tzinfo=None)
            query = query.filter(
                or_(
                    TransactionData.product_validation_timestamp <= dt_end,
                    TransactionData.created_on <= dt_end,
                )
            )
        except Exception:
            pass

    if search:
        term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                TransactionData.transaction_id.ilike(term),
                TransactionData.material_code.ilike(term),
                TransactionData.part_number.ilike(term),
                TransactionData.work_order_no.ilike(term),
                TransactionData.factory_rfid_tag_id.ilike(term),
                TransactionData.scanner_device.ilike(term),
                TransactionData.status_id.ilike(term),
                TransactionData.master_item.has(MasterDataItem.product_name.ilike(term)),
            )
        )

    return query.order_by(TransactionData.created_on.desc()).offset(skip).limit(limit).all()
    query = query.order_by(TransactionData.sno.desc(), TransactionData.created_on.desc())
    if skip > 0:
        query = query.offset(skip)
    if limit is not None and limit > 0:
        query = query.limit(limit)

    return query.all()


@router.post("/", response_model=TransactionResponse, status_code=status.HTTP_201_CREATED)
@router.post("/marriage", response_model=TransactionResponse, status_code=status.HTTP_201_CREATED)
def create_marriage_transaction(
    payload: TransactionCreateRequest,
    db: Annotated[Session, Depends(get_db)],
):
    clean_rfid = (payload.factory_rfid_tag_id or "").strip()
    clean_mat = (payload.material_code or "").strip()
    clean_wo = (payload.work_order_no or "").strip()

    if not clean_rfid:
        raise HTTPException(status_code=400, detail="Factory Generated RFID Tag Unique ID is required for marriage.")
    if not clean_mat:
        raise HTTPException(status_code=400, detail="Material Code is required for marriage.")
    if not clean_wo:
        raise HTTPException(status_code=400, detail="Work Order Number is required for marriage.")

    # Check for duplicate composite combination (RFID Tag + Material Code + Work Order No)
    # 1. Global RFID Tag Uniqueness Check: Every RFID Tag ID must be unique across entire database
    existing_rfid = (
        db.query(TransactionData)
        .filter(TransactionData.factory_rfid_tag_id.ilike(clean_rfid))
        .first()
    )
    if existing_rfid:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Duplicate RFID Tag Rejected: Factory RFID Tag ID '{clean_rfid}' is already registered "
                f"in Transaction '{existing_rfid.transaction_id}' (Work Order: '{existing_rfid.work_order_no or 'N/A'}', "
                f"Material Code: '{existing_rfid.material_code or 'N/A'}', Status: '{existing_rfid.status_id}'). "
                f"Every RFID tag must be unique across the entire database."
            ),
        )

    # 2. Check for duplicate composite combination (RFID Tag + Material Code + Work Order No)
    existing_combo = (
        db.query(TransactionData)
        .filter(
            TransactionData.factory_rfid_tag_id.ilike(clean_rfid),
            TransactionData.material_code.ilike(clean_mat),
            TransactionData.work_order_no.ilike(clean_wo),
        )
        .first()
    )
    if existing_combo:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Duplicate Scan Rejected: The combination of RFID Tag '{clean_rfid}', "
                f"Material Code '{clean_mat}', and Work Order '{clean_wo}' is already registered "
                f"in Transaction '{existing_combo.transaction_id}'. Same pair/triplet cannot repeat."
            ),
        )

    # Check master data item (Foreign Key constraint enforcement)
    item = (
        db.query(MasterDataItem)
        .filter(
            or_(
                MasterDataItem.material_code.ilike(clean_mat),
                MasterDataItem.part_number.ilike(clean_mat),
            )
        )
        .first()
    )
    if not item:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Foreign Key Constraint Failed: Material Code '{clean_mat}' is not present in "
                f"Master Data Management. Please register this item in Material Management first before validating/inserting."
            ),
        )

    now = datetime.now(timezone.utc)
    date_str = now.strftime("%Y%m%d")
    max_sno = db.query(func.max(TransactionData.sno)).scalar() or 0
    txn_seq = max(max_sno + 1, db.query(TransactionData).count() + 1)
    txn_id = payload.transaction_id or f"TXN-{date_str}-{txn_seq:04d}"
    while db.query(TransactionData).filter(TransactionData.transaction_id == txn_id).first():
        txn_seq += 1
        txn_id = f"TXN-{date_str}-{txn_seq:04d}"

    # Determine status and validate scanner device foreign key
    is_dispatch = False
    valid_device_id = None
    if payload.scanner_device:
        dev = db.query(Device).filter(
            or_(
                Device.device_id == payload.scanner_device,
                Device.asset_code == payload.scanner_device,
                Device.display_name.ilike(f"%{payload.scanner_device}%"),
            )
        ).first()
        if dev:
            valid_device_id = dev.device_id
            if "portal" in dev.display_name.lower() or "dock" in dev.display_name.lower():
                is_dispatch = True
        else:
            first_dev = db.query(Device).first()
            valid_device_id = first_dev.device_id if first_dev else None

    if payload.status_id and payload.status_id.lower() in ["dispatch", "dispatched"]:
        is_dispatch = True

    status_code = "dispatch" if is_dispatch else "wip"

    # Ensure status row exists
    if not db.query(StatusTransactionData).filter(StatusTransactionData.id == status_code).first():
        db.add(StatusTransactionData(id=status_code, name=status_code.capitalize(), created_by="system"))
        db.flush()

    new_txn = TransactionData(
        transaction_id=txn_id,
        factory_rfid_tag_id=clean_rfid,
        work_order_no=clean_wo,
        material_code=item.material_code,  # exact foreign key matching master_data_items
        part_number=payload.part_number or item.part_number,
        category_id=payload.category_id or item.category_id,
        scanner_device=valid_device_id,
        product_validation_timestamp=now,
        status_id=status_code,
        label_lookup_timestamp=now if is_dispatch else None,
        created_by=payload.created_by or payload.operator_role or "Operator",
    )

    try:
        db.add(new_txn)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        err_msg = str(getattr(exc, "orig", exc))
        if "FOREIGN KEY constraint failed" in err_msg or "master_data_items.material_code" in err_msg or "FOREIGN KEY" in err_msg:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Foreign Key Violation: Material Code '{clean_mat}' is not present in Master Data Management.",
            )
        elif "uq_transactions_data_rfid" in err_msg or ("factory_rfid_tag_id" in err_msg and ("UNIQUE" in err_msg.upper() or "constraint failed" in err_msg.lower())):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Duplicate RFID Tag Rejected: Factory RFID Tag ID '{clean_rfid}' is already registered in the database. Every RFID tag must be unique.",
            )
        elif "uq_transactions_data_mat_wo_rfid" in err_msg or ("material_code" in err_msg and "factory_rfid_tag_id" in err_msg):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Duplicate Combination Rejected: The combination of RFID Tag '{clean_rfid}', Material Code '{clean_mat}', and Work Order '{clean_wo}' already exists.",
            )
        elif "transactions_data.transaction_id" in err_msg:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Transaction ID collision detected ('{txn_id}'). Please retry submission.",
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Database constraint violation: {err_msg}",
            )

    # Reset pending scan buffer now that item is committed
    global _latest_pending_scan
    _latest_pending_scan = None

    return (
        db.query(TransactionData)
        .options(
            joinedload(TransactionData.master_item),
            joinedload(TransactionData.device),
            joinedload(TransactionData.status),
        )
        .filter(TransactionData.transaction_id == new_txn.transaction_id)
        .first()
    )


@router.put("/{transaction_id}/status", response_model=TransactionResponse)
def update_transaction_status(
    transaction_id: str,
    payload: TransactionStatusUpdateRequest,
    db: Annotated[Session, Depends(get_db)],
):
    txn = db.query(TransactionData).filter(TransactionData.transaction_id == transaction_id).first()
    if not txn:
        raise HTTPException(status_code=404, detail=f"Transaction '{transaction_id}' not found.")

    stat_clean = "dispatch" if payload.status.lower() in ["dispatch", "dispatched"] else "wip"
    txn.status_id = stat_clean
    txn.updated_on = datetime.now(timezone.utc)
    txn.updated_by = payload.updated_by or "admin"

    db.commit()

    return (
        db.query(TransactionData)
        .options(
            joinedload(TransactionData.master_item),
            joinedload(TransactionData.device),
            joinedload(TransactionData.status),
        )
        .filter(TransactionData.transaction_id == transaction_id)
        .first()
    )


# ==============================================================================
# POST_CAN / POST_SCAN (Awaiting Queue / Cancel in Product Validation)
# ==============================================================================

def get_image_for_material(material_code: str | None, category: str | None = None) -> str:
    mat = (material_code or "").upper()
    cat = (str(category) or "").lower()
    if "REC" in mat or "recliner" in cat:
        return "/products/recliner_1.jpg"
    if "SOF" in mat or "sofa" in cat:
        return "/products/sofa_1.jpg"
    if "BED" in mat or "bed" in cat:
        return "/products/bed_1.jpg"
    if "PIL" in mat or "pillow" in cat:
        return "/products/pillow_1.jpg"
    if "MAT-756" in mat or "756006" in mat:
        return "/products/mattress_2.jpg"
    return "/products/mattress_1.jpg"


@router.post("/post_can", response_model=PostCanResponse, status_code=status.HTTP_200_OK)
@router.post("/post_scan", response_model=PostCanResponse, status_code=status.HTTP_200_OK)
def post_can(
    payload: PostCanRequest,
    db: Annotated[Session, Depends(get_db)],
):
    """
    POST Operation: Takes Factory Generated RFID Tag Unique ID, Material Code, or Work Order Number - WO.
    Supports incremental/single-data scans (e.g. only workOrderNo, only materialCode, or only rfidUniqueId)
    and merges them into the active pending scan buffer.
    """
    global _latest_pending_scan, _scan_counter
    _scan_counter += 1

    # Extract incoming values for this scan event
    raw_rfid = (payload.factory_rfid_tag_id or "").strip()
    raw_mat = (payload.material_code or "").strip()
    raw_wo = (payload.work_order_no or "").strip()

    dev_id = payload.scanner_device or "dev-cpr-01"
    dev = db.query(Device).filter(
        or_(Device.device_id == dev_id, Device.asset_code == dev_id)
    ).first()
    dev_name = dev.display_name if dev else "CIPHER RS38 UHF Reader #01 (Station Line 1)"
    actual_dev_id = dev.device_id if dev else dev_id

    matched_data = None
    if raw_mat:
        clean_mat = raw_mat
        item = (
            db.query(MasterDataItem)
            .options(
                joinedload(MasterDataItem.category),
                joinedload(MasterDataItem.status),
            )
            .filter(
                or_(
                    MasterDataItem.material_code.ilike(clean_mat),
                    MasterDataItem.part_number.ilike(clean_mat),
                )
            )
            .first()
        )

        cat_str = item.category.name if (item and item.category) else (item.category_id if item else None)
        item_images: list[str] = []
        if item and item.fg_image:
            item_images = normalize_fg_image(item.fg_image)

        if not item_images:
            item_images = [get_image_for_material(clean_mat, cat_str)]

        prod_image = item_images[0]

        if item:
            matched_data = {
                "id": item.id,
                "materialCode": item.material_code,
                "partNumber": item.part_number,
                "category": cat_str,
                "model": item.model or "",
                "productDescription": item.product_description or "",
                "productName": item.product_description or item.model or f"FG Item ({item.material_code})",
                "dimensions": {
                    "lengthMm": item.length_mm or 0,
                    "widthMm": item.width_mm or 0,
                    "heightMm": item.height_mm or 0,
                },
                "netWeight": float(item.net_weight or 25.0),
                "grossWeight": float(item.gross_weight or 27.5),
                "packageType": item.package_type or "Rolled Vacuum Box",
                "status": item.status.name if item.status else "Active",
                "fgImage": item_images,
                "images": item_images,
                "colorVariant": "Classic Grey / Navy",
                "firmnessRating": "Medium Firm (Ortho)",
                "warrantyYears": 10,
                "rfidInlayType": "EPC Gen2 UHF 865-867 MHz",
            }
        else:
            # Foreign Key constraint: item does NOT exist in Master Data Management
            matched_data = None

    # Foreign Key validation state
    material_in_master = bool(item) if raw_mat else True

    # Check if RFID Tag or composite combination has already been committed in database
    already_committed = False
    existing_txn_info = None
    existing_row = None
    duplicate_reason = None

    check_rfid = raw_rfid or (_latest_pending_scan.get("rfidUniqueId") if _latest_pending_scan else None)
    check_mat = raw_mat or (_latest_pending_scan.get("materialCode") if _latest_pending_scan else None)
    check_wo = raw_wo or (_latest_pending_scan.get("workOrderNo") if _latest_pending_scan else None)

    # 1. Global RFID Tag uniqueness check (RFID must be unique across entire DB)
    if check_rfid:
        existing_row = (
            db.query(TransactionData)
            .filter(TransactionData.factory_rfid_tag_id.ilike(check_rfid.strip()))
            .first()
        )
        if existing_row:
            duplicate_reason = "duplicate_rfid"

    # 2. Composite triplet check fallback
    if not existing_row and check_rfid and check_mat and check_wo:
        existing_row = (
            db.query(TransactionData)
            .filter(
                TransactionData.factory_rfid_tag_id.ilike(check_rfid.strip()),
                TransactionData.material_code.ilike(check_mat.strip()),
                TransactionData.work_order_no.ilike(check_wo.strip()),
            )
            .first()
        )
        if existing_row:
            duplicate_reason = "duplicate_triplet"

    if existing_row:
        already_committed = True
        existing_txn_info = {
            "transactionId": existing_row.transaction_id,
            "rfidUniqueId": existing_row.factory_rfid_tag_id,
            "materialCode": existing_row.material_code,
            "workOrderNo": existing_row.work_order_no,
            "status": existing_row.status_id,
            "conflictReason": duplicate_reason,
        }

    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    scan_id = f"SCAN-{int(datetime.now().timestamp())}-{_scan_counter}"
    is_complete = bool(raw_rfid and raw_mat and raw_wo and material_in_master)
    summary_parts = [f"{k}='{v}'" for k, v in [('RFID', raw_rfid), ('Material', raw_mat), ('WO', raw_wo)] if v]

    scan_msg = f"Scan captured: {', '.join(summary_parts) if summary_parts else 'Empty scan'}"
    if duplicate_reason == "duplicate_rfid":
        scan_msg = f"Duplicate RFID Tag: Factory RFID '{check_rfid}' is already registered in Transaction '{existing_row.transaction_id}'."
    elif duplicate_reason == "duplicate_triplet":
        scan_msg = f"Duplicate Combination: '{check_rfid}' + '{check_mat}' + '{check_wo}' is already registered in Transaction '{existing_row.transaction_id}'."

    _latest_pending_scan = {
        "success": True,
        "message": scan_msg,
        "scanId": scan_id,
        "rawRfid": raw_rfid or None,
        "rawMaterialCode": raw_mat or None,
        "rawWorkOrderNo": raw_wo or None,
        "rfidUniqueId": raw_rfid or None,
        "materialCode": raw_mat or None,
        "workOrderNo": raw_wo or None,
        "deviceId": actual_dev_id,
        "deviceName": dev_name,
        "matchedFgItem": matched_data,
        "materialInMaster": material_in_master,
        "materialErrorMessage": None if material_in_master else f"Material Code '{raw_mat}' is not present in Master Data Management.",
        "readingSuccess": is_complete and not already_committed,
        "isComplete": is_complete,
        "alreadyCommitted": already_committed,
        "existingTransaction": existing_txn_info,
        "scannedAt": now_str,
        "status": "AWAITING_QUEUE",
    }

    return _latest_pending_scan


@router.get("/pending_scan")
def get_pending_scan():
    """
    Returns the currently active scanned label analysis data waiting to be Queued or Cancelled.
    """
    global _latest_pending_scan
    return _latest_pending_scan or {"pending": False, "message": "No scan currently awaiting queue"}


@router.post("/cancel_can")
@router.post("/cancel_scan")
def cancel_can():
    """
    Discards the current pending scan. Records are NOT saved to transactions_data.
    """
    global _latest_pending_scan
    _latest_pending_scan = None
    return {
        "success": True,
        "message": "Scan session cancelled. Not sent to FG WIP Transaction Records (transactions_data)."
    }


# Aliases
post_scan = post_can
cancel_scan = cancel_can


@router.post("/post_fixed_rfid", response_model=PostFixedRfidResponse, status_code=status.HTTP_200_OK)
def post_fixed_rfid(
    payload: PostFixedRfidRequest,
    db: Annotated[Session, Depends(get_db)],
):
    """
    Fixed SICK RFU630 Portal Reader Detection:
    Takes RFID unique ID scanned as finished good passes overhead portal.
    1. Verifies tag exists in transactions_data SQLite table. If not found -> 404.
    2. Couples with Transaction ID, Material Code, Part Number, and Work Order Number.
    3. Updates status to 'dispatch' and sets label_lookup_timestamp in transactions_data.
    4. Emits detection event to SICK portal continuous listener in the UI.
    """
    global _latest_pending_fixed_scan, _fixed_scan_counter
    _fixed_scan_counter += 1

    rfid = payload.factory_rfid_tag_id.strip()

    txn = (
        db.query(TransactionData)
        .options(
            joinedload(TransactionData.master_item),
            joinedload(TransactionData.device),
            joinedload(TransactionData.status),
        )
        .filter(
            or_(
                TransactionData.factory_rfid_tag_id == rfid,
                TransactionData.factory_rfid_tag_id.ilike(rfid),
            )
        )
        .order_by(TransactionData.sno.desc())
        .first()
    )

    if not txn:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"RFID unique ID '{rfid}' was not found in transaction data table. Please validate and marry the FG first.",
        )

    # 1. Ensure 'dispatch' status exists in status_transaction_data lookup table
    if not db.query(StatusTransactionData).filter(StatusTransactionData.id == "dispatch").first():
        db.add(StatusTransactionData(id="dispatch", name="Dispatch", created_by="system"))
        db.flush()

    # 2. Update status to 'dispatch' and timestamp
    now_utc = datetime.now(timezone.utc)
    now_ist = datetime.now(IST)
    txn.status_id = "dispatch"
    txn.label_lookup_timestamp = now_utc
    txn.updated_on = now_utc

    try:
        db.commit()
        db.refresh(txn)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Database constraint violation while updating transaction status to dispatch: {exc}",
        )

    item = txn.master_item
    time_str = now_ist.strftime("%Y-%m-%d %H:%M:%S")
    full_time_str = now_ist.strftime("%Y-%m-%d %H:%M:%S")
    scan_id = f"FIXED-SCAN-{int(now_ist.timestamp())}-{_fixed_scan_counter}"

    prod_name = (
        (item.model or item.product_description)
        if item
        else f"FG Product ({txn.material_code})"
    )
    cat_name = (
        (item.category.name if item and getattr(item, "category", None) else getattr(txn, "category_id", None))
    )

    item_images: list[str] = []
    if item and item.fg_image:
        item_images = normalize_fg_image(item.fg_image)

    if not item_images:
        item_images = [get_image_for_material(txn.material_code, cat_name)]

    prod_image = item_images[0]

    matched_data = None
    if item:
        matched_data = {
            "id": item.id,
            "materialCode": item.material_code,
            "partNumber": item.part_number,
            "category": item.category.name if item.category else item.category_id,
            "model": item.model or "",
            "productDescription": item.product_description or "",
            "productName": item.product_description or item.model or f"FG Item ({item.material_code})",
            "dimensions": {
                "lengthMm": item.length_mm or 0,
                "widthMm": item.width_mm or 0,
                "heightMm": item.height_mm or 0,
            },
            "netWeight": float(item.net_weight or 25.0),
            "grossWeight": float(item.gross_weight or 27.5),
            "packageType": item.package_type or "Rolled Vacuum Box",
            "fgImage": item_images,
            "images": item_images,
        }

    response_data = {
        "success": True,
        "message": f"SICK Fixed RFID Portal detected RFID '{rfid}'. Coupled to Transaction '{txn.transaction_id}', Material '{txn.material_code}', Part '{txn.part_number or (item.part_number if item else '')}', WO '{txn.work_order_no}'. Status updated to Dispatch.",
        "scanId": scan_id,
        "transactionId": txn.transaction_id,
        "rfidUniqueId": rfid,
        "materialCode": txn.material_code,
        "partNumber": txn.part_number or (item.part_number if item else ""),
        "workOrderNo": txn.work_order_no or "",
        "productName": prod_name,
        "category": cat_name,
        "product_image": prod_image,
        "fg_image": prod_image,
        "status": "Dispatch",
        "statusId": "dispatch",
        "antenna": payload.antenna or "Port 1 (Overhead)",
        "timestamp": time_str,
        "fullTimestamp": full_time_str,
        "matchedFgItem": matched_data,
    }

    _latest_pending_fixed_scan = response_data
    return response_data


@router.get("/pending_fixed_rfid")
def get_pending_fixed_rfid():
    """
    Returns the latest fixed RFID portal detection event for the SICK portal listener.
    """
    global _latest_pending_fixed_scan
    return _latest_pending_fixed_scan or {"pending": False, "message": "No fixed RFID scan currently active"}


@router.post("/clear_fixed_rfid")
def clear_fixed_rfid():
    """
    Clears the pending fixed RFID scan buffer.
    """
    global _latest_pending_fixed_scan
    _latest_pending_fixed_scan = None
    return {"success": True, "message": "Fixed RFID scan buffer cleared"}


@router.post("/clear")
def clear_all_transactions(db: Annotated[Session, Depends(get_db)]):
    """
    Clears all transaction data from SQLite transactions_data table
    and resets all in-memory scan buffers.
    """
    global _latest_pending_scan, _latest_pending_fixed_scan
    _latest_pending_scan = None
    _latest_pending_fixed_scan = None
    deleted_count = db.query(TransactionData).delete()
    db.commit()
    return {
        "success": True,
        "message": f"Successfully cleared {deleted_count} transaction records and reset scan buffers.",
    }




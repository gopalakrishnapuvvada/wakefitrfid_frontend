from datetime import datetime, timezone, timedelta
from typing import Annotated, Any

IST = timezone(timedelta(hours=5, minutes=30))

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
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
    search: str | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=1000),
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
        else:
            query = query.filter(TransactionData.status_id == "wip")

    if material_code:
        query = query.filter(TransactionData.material_code == material_code)

    if device_id and device_id.upper() != "ALL":
        query = query.filter(TransactionData.scanner_device == device_id)

    if search:
        term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                TransactionData.transaction_id.ilike(term),
                TransactionData.material_code.ilike(term),
                TransactionData.part_number.ilike(term),
                TransactionData.work_order_no.ilike(term),
                TransactionData.factory_rfid_tag_id.ilike(term),
            )
        )

    return query.order_by(TransactionData.created_on.desc()).offset(skip).limit(limit).all()


@router.post("/", response_model=TransactionResponse, status_code=status.HTTP_201_CREATED)
@router.post("/marriage", response_model=TransactionResponse, status_code=status.HTTP_201_CREATED)
def create_marriage_transaction(
    payload: TransactionCreateRequest,
    db: Annotated[Session, Depends(get_db)],
):
    # Check master data item
    item = db.query(MasterDataItem).filter(MasterDataItem.material_code == payload.material_code).first()

    now = datetime.now(timezone.utc)
    date_str = now.strftime("%Y%m%d")
    count_today = db.query(TransactionData).count() + 1
    txn_id = payload.transaction_id or f"TXN-{date_str}-{count_today:04d}"

    # Determine status
    is_dispatch = False
    if payload.scanner_device:
        dev = db.query(Device).filter(Device.device_id == payload.scanner_device).first()
        if dev and ("portal" in dev.display_name.lower() or "dock" in dev.display_name.lower()):
            is_dispatch = True
    if payload.status_id and payload.status_id.lower() in ["dispatch", "dispatched"]:
        is_dispatch = True

    status_code = "dispatch" if is_dispatch else "wip"

    # Ensure status row exists
    if not db.query(StatusTransactionData).filter(StatusTransactionData.id == status_code).first():
        db.add(StatusTransactionData(id=status_code, name=status_code.capitalize(), created_by="system"))
        db.flush()

    new_txn = TransactionData(
        transaction_id=txn_id,
        factory_rfid_tag_id=payload.factory_rfid_tag_id,
        work_order_no=payload.work_order_no,
        material_code=payload.material_code,
        part_number=payload.part_number or (item.part_number if item else None),
        category_id=payload.category_id or (item.category_id if item else None),
        scanner_device=payload.scanner_device,
        product_validation_timestamp=now,
        status_id=status_code,
        label_lookup_timestamp=now if is_dispatch else None,
        created_by=payload.created_by or payload.operator_role or "Operator",
    )

    db.add(new_txn)
    db.commit()

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
    POST Operation: Takes Factory Generated RFID Tag Unique ID, Material Code, and Work Order Number - WO.
    Does NOT save to transactions_data yet. Emits an incoming scan event that appears in the
    Product Validation UI under 'Captured Finished Good Label Analysis'.
    Saving to transactions_data occurs only when the user clicks 'Queue'.
    """
    global _latest_pending_scan, _scan_counter
    _scan_counter += 1

    clean_mat = payload.material_code.strip()
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

    dev_id = payload.scanner_device or "dev-cpr-01"
    dev = db.query(Device).filter(
        or_(Device.device_id == dev_id, Device.asset_code == dev_id)
    ).first()
    dev_name = dev.display_name if dev else "CIPHER RS38 UHF Reader #01 (Station Line 1)"
    actual_dev_id = dev.device_id if dev else dev_id

    cat_str = item.category.name if (item and item.category) else (item.category_id if item else None)
    item_images: list[str] = []
    if item and item.fg_image:
        if isinstance(item.fg_image, list) and len(item.fg_image) > 0:
            item_images = [str(x) for x in item.fg_image if x][:4]
        elif isinstance(item.fg_image, str) and item.fg_image != "string" and item.fg_image.strip():
            item_images = [item.fg_image.strip()]

    if not item_images:
        item_images = [get_image_for_material(clean_mat, cat_str)]

    prod_image = item_images[0]

    matched_data = None
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
        inferred_cat = "Recliner" if "REC" in clean_mat.upper() else "Sofa" if "SOF" in clean_mat.upper() else "Bed" if "BED" in clean_mat.upper() else "Pillow" if "PIL" in clean_mat.upper() else "Mattress"
        matched_data = {
            "id": f"temp-{clean_mat}",
            "materialCode": clean_mat,
            "partNumber": f"FG-{clean_mat}",
            "category": inferred_cat,
            "model": "Standard FG Model",
            "productDescription": f"Finished Good Product ({clean_mat})",
            "productName": f"Finished Good ({clean_mat})",
            "dimensions": {"lengthMm": 1981, "widthMm": 1829, "heightMm": 203},
            "netWeight": 25.0,
            "grossWeight": 27.5,
            "packageType": "Standard Package",
            "status": "Active",
            "fgImage": prod_image,
            "images": [prod_image],
            "colorVariant": "Standard",
            "firmnessRating": "Standard",
            "warrantyYears": 5,
            "rfidInlayType": "EPC Gen2 UHF 865-867 MHz",
        }

    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    scan_id = f"SCAN-{int(datetime.now().timestamp())}-{_scan_counter}"

    _latest_pending_scan = {
        "success": True,
        "message": f"Scan captured for Material Code '{payload.material_code}' and WO '{payload.work_order_no}'. Awaiting user Queue or Cancel in Product Validation.",
        "scanId": scan_id,
        "rfidUniqueId": payload.factory_rfid_tag_id.strip(),
        "materialCode": payload.material_code.strip(),
        "workOrderNo": payload.work_order_no.strip(),
        "deviceId": actual_dev_id,
        "deviceName": dev_name,
        "matchedFgItem": matched_data,
        "readingSuccess": True,
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

    # Update status to 'dispatch' and timestamp
    now_utc = datetime.now(timezone.utc)
    now_ist = datetime.now(IST)
    txn.status_id = "dispatch"
    txn.label_lookup_timestamp = now_utc
    txn.updated_on = now_utc
    db.commit()
    db.refresh(txn)

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
        if isinstance(item.fg_image, list) and len(item.fg_image) > 0:
            item_images = [str(x) for x in item.fg_image if x][:4]
        elif isinstance(item.fg_image, str) and item.fg_image != "string" and item.fg_image.strip():
            item_images = [item.fg_image.strip()]

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




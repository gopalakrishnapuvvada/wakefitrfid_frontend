from datetime import datetime, timezone, timedelta
from typing import Any
from pydantic import BaseModel, ConfigDict, Field, model_validator

IST = timezone(timedelta(hours=5, minutes=30))


class StatusTransactionDataResponse(BaseModel):
    id: str
    name: str
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)


class TransactionCreateRequest(BaseModel):
    transaction_id: str | None = Field(None, alias="transactionId")
    factory_rfid_tag_id: str | None = Field(None, alias="rfidUniqueId")
    work_order_no: str | None = Field(None, alias="workOrderNo")
    material_code: str = Field(..., alias="materialCode")
    part_number: str | None = Field(None, alias="partNumber")
    category_id: str | None = Field(None, alias="categoryId")
    scanner_device: str | None = Field(None, alias="deviceId")
    status_id: str | None = Field("wip", alias="status")
    operator_role: str | None = Field("admin", alias="operatorRole")
    created_by: str | None = Field(None, alias="createdBy")

    model_config = ConfigDict(populate_by_name=True)

    @model_validator(mode="before")
    @classmethod
    def normalize_aliases(cls, data: Any) -> Any:
        if isinstance(data, dict):
            # Map qr1MaterialCode -> materialCode
            if "materialCode" not in data and "material_code" not in data:
                if "qr1MaterialCode" in data:
                    data["materialCode"] = data["qr1MaterialCode"]
            # Map qr2WorkOrderNo -> workOrderNo
            if "workOrderNo" not in data and "work_order_no" not in data:
                if "qr2WorkOrderNo" in data:
                    data["workOrderNo"] = data["qr2WorkOrderNo"]
            # Fallback for created_by from operatorRole
            if not data.get("created_by") and data.get("operatorRole"):
                data["created_by"] = data["operatorRole"]
        return data


class TransactionStatusUpdateRequest(BaseModel):
    status: str = Field(..., description="'wip' | 'dispatch' | 'Dispatched' | 'WIP'")
    updated_by: str | None = Field("admin", alias="updatedBy")
    model_config = ConfigDict(populate_by_name=True)


class TransactionResponse(BaseModel):
    sno: int
    transaction_id: str = Field(..., alias="transactionId")
    id: str  # Alias for transactionId
    rfid_unique_id: str | None = Field(None, alias="rfidUniqueId")
    work_order_no: str | None = Field(None, alias="workOrderNo")
    material_code: str = Field(..., alias="materialCode")
    part_number: str | None = Field(None, alias="partNumber")
    product_name: str | None = Field(None, alias="productName")
    category: str | None = None
    category_id: str | None = Field(None, alias="categoryId")
    product_image: str | None = Field(None, alias="productImage")
    fg_image: str | None = Field(None, alias="fgImage")
    device_id: str | None = Field(None, alias="deviceId")
    device_name: str | None = Field(None, alias="deviceName")
    operator_role: str | None = Field(None, alias="operatorRole")
    status: str
    status_id: str = Field(..., alias="statusId")
    product_validation_timestamp: datetime | None = Field(None, alias="productValidationTimestamp")
    label_lookup_timestamp: datetime | None = Field(None, alias="labelLookupTimestamp")
    created_on: datetime = Field(..., alias="createdOn")
    timestamp: str  # Formatted timestamp for frontend table display

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
    )

    @model_validator(mode="before")
    @classmethod
    def transform_transaction_orm(cls, data: Any) -> Any:
        if hasattr(data, "__table__"):
            stat_name = "Dispatched" if data.status_id in ["dispatch", "dispatched"] else "WIP"
            item = getattr(data, "master_item", None)
            dev = getattr(data, "device", None)

            prod_name = (
                (item.model or item.product_description)
                if item
                else f"FG Product ({data.material_code})"
            )
            cat_name = (
                (item.category.name if item and getattr(item, "category", None) else getattr(data, "category_id", None))
            )
            dev_name = dev.display_name if dev else getattr(data, "scanner_device", None)

            # Fallback image resolution based on material code and category
            mat_upper = (data.material_code or "").upper()
            cat_lower = (str(cat_name) or "").lower()
            if item and item.fg_image:
                if isinstance(item.fg_image, list) and len(item.fg_image) > 0:
                    prod_img = str(item.fg_image[0])
                elif isinstance(item.fg_image, str) and item.fg_image != "string" and item.fg_image.strip():
                    prod_img = item.fg_image.strip()
                else:
                    prod_img = "/products/mattress_1.jpg"
            elif "REC" in mat_upper or "recliner" in cat_lower:
                prod_img = "/products/recliner_1.jpg"
            elif "SOF" in mat_upper or "sofa" in cat_lower:
                prod_img = "/products/sofa_1.jpg"
            elif "BED" in mat_upper or "bed" in cat_lower:
                prod_img = "/products/bed_1.jpg"
            elif "PIL" in mat_upper or "pillow" in cat_lower:
                prod_img = "/products/pillow_1.jpg"
            elif "MAT-756" in mat_upper or "756006" in mat_upper:
                prod_img = "/products/mattress_2.jpg"
            else:
                prod_img = "/products/mattress_1.jpg"

            time_dt = data.product_validation_timestamp or data.created_on
            if time_dt:
                c_on = time_dt
                if c_on.tzinfo is None:
                    c_on = c_on.replace(tzinfo=timezone.utc)
                time_str = c_on.astimezone(IST).strftime("%Y-%m-%d %H:%M:%S")
            else:
                time_str = ""

            return {
                "sno": data.sno,
                "transaction_id": data.transaction_id,
                "id": data.transaction_id,
                "rfid_unique_id": data.factory_rfid_tag_id,
                "work_order_no": data.work_order_no,
                "material_code": data.material_code,
                "part_number": data.part_number or (item.part_number if item else None),
                "product_name": prod_name,
                "category": cat_name,
                "category_id": data.category_id,
                "product_image": prod_img,
                "fg_image": prod_img,
                "device_id": data.scanner_device,
                "device_name": dev_name,
                "operator_role": data.created_by or "Operator",
                "status": stat_name,
                "status_id": data.status_id,
                "product_validation_timestamp": data.product_validation_timestamp,
                "label_lookup_timestamp": data.label_lookup_timestamp,
                "created_on": data.created_on,
                "timestamp": time_str,
            }
        return data


class PostCanRequest(BaseModel):
    factory_rfid_tag_id: str | None = Field(None, alias="rfidUniqueId", description="Factory Generated RFID Tag Unique ID")
    material_code: str | None = Field(None, alias="materialCode", description="Material Code")
    work_order_no: str | None = Field(None, alias="workOrderNo", description="Work Order Number - WO")
    scanner_device: str | None = Field(None, alias="deviceId", description="Scanner Device ID or Name")

    model_config = ConfigDict(populate_by_name=True)

    @model_validator(mode="before")
    @classmethod
    def normalize_inputs(cls, data: Any) -> Any:
        if isinstance(data, dict):
            # RFID
            if "rfidUniqueId" not in data and "factory_rfid_tag_id" not in data:
                for k in ["rfid", "rfid_unique_id", "factory_rfid_tag_id", "tagId", "epc"]:
                    if k in data:
                        data["rfidUniqueId"] = str(data[k])
                        break
            # Material Code
            if "materialCode" not in data and "material_code" not in data:
                for k in ["material", "matCode", "qr1MaterialCode", "qr1", "material_code"]:
                    if k in data:
                        data["materialCode"] = str(data[k])
                        break
            # Work Order No
            if "workOrderNo" not in data and "work_order_no" not in data:
                for k in ["wo", "woNo", "qr2WorkOrderNo", "qr2", "work_order_no", "workOrder"]:
                    if k in data:
                        data["workOrderNo"] = str(data[k])
                        break
            # Scanner Device
            if "deviceId" not in data and "scanner_device" not in data:
                for k in ["device", "scanner_device", "scannerDevice"]:
                    if k in data:
                        data["deviceId"] = str(data[k])
                        break
        return data


class PostCanResponse(BaseModel):
    success: bool = True
    message: str
    scan_id: str = Field(..., alias="scanId")
    rfid_unique_id: str | None = Field(None, alias="rfidUniqueId")
    material_code: str | None = Field(None, alias="materialCode")
    work_order_no: str | None = Field(None, alias="workOrderNo")
    raw_rfid: str | None = Field(None, alias="rawRfid")
    raw_material_code: str | None = Field(None, alias="rawMaterialCode")
    raw_work_order_no: str | None = Field(None, alias="rawWorkOrderNo")
    device_id: str = Field(..., alias="deviceId")
    device_name: str = Field(..., alias="deviceName")
    matched_fg_item: Any | None = Field(None, alias="matchedFgItem")
    reading_success: bool = Field(False, alias="readingSuccess")
    is_complete: bool = Field(False, alias="isComplete")
    already_committed: bool = Field(False, alias="alreadyCommitted")
    existing_transaction: Any | None = Field(None, alias="existingTransaction")
    scanned_at: str = Field(..., alias="scannedAt")
    status: str = "AWAITING_QUEUE"

    model_config = ConfigDict(populate_by_name=True)


# Aliases for post_scan
PostScanRequest = PostCanRequest
PostScanResponse = PostCanResponse


class PostFixedRfidRequest(BaseModel):
    factory_rfid_tag_id: str = Field(..., alias="rfidUniqueId", description="Scanned RFID unique ID")
    scanner_device: str | None = Field("dev-rf-portal-01", alias="deviceId")
    antenna: str | None = Field("Port 1 (Overhead)", alias="antenna")

    model_config = ConfigDict(populate_by_name=True)

    @model_validator(mode="before")
    @classmethod
    def normalize_rfid(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "rfidUniqueId" not in data and "factory_rfid_tag_id" not in data:
                for k in ["rfid", "rfid_unique_id", "rfid_tag", "tagId", "epc", "rfidTag"]:
                    if k in data:
                        data["rfidUniqueId"] = str(data[k])
                        break
        return data


class PostFixedRfidResponse(BaseModel):
    success: bool = True
    message: str
    scan_id: str = Field(..., alias="scanId")
    transaction_id: str = Field(..., alias="transactionId")
    rfid_unique_id: str = Field(..., alias="rfidUniqueId")
    material_code: str = Field(..., alias="materialCode")
    part_number: str | None = Field(None, alias="partNumber")
    work_order_no: str | None = Field(None, alias="workOrderNo")
    product_name: str | None = Field(None, alias="productName")
    category: str | None = Field(None, alias="category")
    product_image: str | None = Field(None, alias="productImage")
    fg_image: str | None = Field(None, alias="fgImage")
    status: str = "Dispatch"
    status_id: str = Field("dispatch", alias="statusId")
    antenna: str = "Port 1 (Overhead)"
    timestamp: str
    full_timestamp: str = Field(..., alias="fullTimestamp")
    matched_fg_item: Any | None = Field(None, alias="matchedFgItem")

    model_config = ConfigDict(populate_by_name=True)




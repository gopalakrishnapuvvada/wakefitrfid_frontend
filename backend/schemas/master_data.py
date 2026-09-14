from datetime import datetime
import json
from typing import Any
from pydantic import BaseModel, ConfigDict, Field, model_validator


# --- Category Schemas ---
class FgCategoryBase(BaseModel):
    id: str
    name: str

    model_config = ConfigDict(populate_by_name=True, from_attributes=True)


class FgCategoryCreate(BaseModel):
    id: str | None = None
    name: str
    created_by: str | None = Field(default="admin", alias="createdBy")

    model_config = ConfigDict(populate_by_name=True)


class FgCategoryResponse(FgCategoryBase):
    created_on: datetime = Field(..., alias="createdOn")
    created_by: str | None = Field(None, alias="createdBy")
    updated_on: datetime | None = Field(None, alias="updatedOn")
    updated_by: str | None = Field(None, alias="updatedBy")


# --- Status Schemas ---
class FgStatusBase(BaseModel):
    id: str
    name: str

    model_config = ConfigDict(populate_by_name=True, from_attributes=True)


class FgStatusCreate(BaseModel):
    id: str | None = None
    name: str
    created_by: str | None = Field(default="admin", alias="createdBy")

    model_config = ConfigDict(populate_by_name=True)


class FgStatusResponse(FgStatusBase):
    created_on: datetime = Field(..., alias="createdOn")
    created_by: str | None = Field(None, alias="createdBy")
    updated_on: datetime | None = Field(None, alias="updatedOn")
    updated_by: str | None = Field(None, alias="updatedBy")


# --- Dimensions Helper Schema ---
class DimensionsSchema(BaseModel):
    length_mm: int | None = Field(None, alias="lengthMm")
    width_mm: int | None = Field(None, alias="widthMm")
    height_mm: int | None = Field(None, alias="heightMm")

    model_config = ConfigDict(populate_by_name=True, from_attributes=True)


def is_valid_image_url(url: Any) -> bool:
    """Checks if a string is a valid image URL/path and NOT a raw base64 data blob."""
    if not url or not isinstance(url, str):
        return False
    u = url.strip()
    if not u or u == "string" or u.lower() == "null":
        return False
    # Strictly reject Base64 data URIs or binary dumps
    if u.startswith("data:") or "base64" in u.lower() or len(u) > 500:
        return False
    # Accept HTTP/HTTPS URLs or valid relative asset paths (e.g. /products/...)
    if u.startswith("http://") or u.startswith("https://") or u.startswith("/"):
        return True
    return False


def normalize_fg_image(val: Any) -> list[str]:
    """Ensures fg_image is a list of up to 4 valid image URL strings (HTTP/HTTPS or relative path). Rejects raw Base64 data."""
    if val is None:
        return []
    raw_list: list[Any] = []
    if isinstance(val, list):
        raw_list = val
    elif isinstance(val, str):
        v = val.strip()
        if not v or v.lower() == "null" or v == "string":
            return []
        if v.startswith("["):
            try:
                parsed = json.loads(v)
                if isinstance(parsed, list):
                    raw_list = parsed
                else:
                    raw_list = [v]
            except Exception:
                raw_list = [v]
        else:
            raw_list = [v]

    res = [str(x).strip() for x in raw_list if is_valid_image_url(x)]
    return res[:4]



# --- Master Data Item Schemas ---
class MasterDataItemCreate(BaseModel):
    id: str | None = None
    fg_image: list[str] = Field(default_factory=list, alias="fgImage")
    material_code: str = Field(..., alias="materialCode")
    part_number: str = Field(..., alias="partNumber")
    category_id: str | None = Field(None, alias="categoryId")
    category: str | None = None  # Accepts category name (e.g. "Mattress") or ID
    model: str | None = None
    product_description: str | None = Field(None, alias="productDescription")
    dimensions: DimensionsSchema | None = None
    length_mm: int | None = Field(None, alias="lengthMm")
    width_mm: int | None = Field(None, alias="widthMm")
    height_mm: int | None = Field(None, alias="heightMm")
    net_weight: float | None = Field(None, alias="netWeight")
    gross_weight: float | None = Field(None, alias="grossWeight")
    package_type: str | None = Field(None, alias="packageType")
    status_id: str | None = Field(None, alias="statusId")
    status: str | None = None  # Accepts status name (e.g. "Active") or ID
    created_by: str | None = Field(default="admin", alias="createdBy")

    model_config = ConfigDict(populate_by_name=True)

    @model_validator(mode="before")
    @classmethod
    def normalize_inputs(cls, data: Any) -> Any:
        if isinstance(data, dict):
            raw_img = data.get("fgImage") if "fgImage" in data else data.get("fg_image")
            if raw_img is None and "images" in data:
                raw_img = data.get("images")
            data["fg_image"] = normalize_fg_image(raw_img)
        return data


class MasterDataItemUpdate(BaseModel):
    fg_image: list[str] | None = Field(None, alias="fgImage")
    material_code: str | None = Field(None, alias="materialCode")
    part_number: str | None = Field(None, alias="partNumber")
    category_id: str | None = Field(None, alias="categoryId")
    category: str | None = None
    model: str | None = None
    product_description: str | None = Field(None, alias="productDescription")
    dimensions: DimensionsSchema | None = None
    length_mm: int | None = Field(None, alias="lengthMm")
    width_mm: int | None = Field(None, alias="widthMm")
    height_mm: int | None = Field(None, alias="heightMm")
    net_weight: float | None = Field(None, alias="netWeight")
    gross_weight: float | None = Field(None, alias="grossWeight")
    package_type: str | None = Field(None, alias="packageType")
    status_id: str | None = Field(None, alias="statusId")
    status: str | None = None
    updated_by: str | None = Field(default="admin", alias="updatedBy")

    model_config = ConfigDict(populate_by_name=True)

    @model_validator(mode="before")
    @classmethod
    def normalize_inputs(cls, data: Any) -> Any:
        if isinstance(data, dict):
            raw_img = data.get("fgImage") if "fgImage" in data else data.get("fg_image")
            if raw_img is None and "images" in data:
                raw_img = data.get("images")
            if raw_img is not None:
                data["fg_image"] = normalize_fg_image(raw_img)
        return data


class MasterDataItemResponse(BaseModel):
    id: str
    fg_image: list[str] = Field(default_factory=list, alias="fgImage")
    images: list[str] = Field(default_factory=list, alias="images")
    material_code: str = Field(..., alias="materialCode")
    part_number: str = Field(..., alias="partNumber")
    category_id: str = Field(..., alias="categoryId")
    category: str | None = None
    model: str | None = None
    product_description: str | None = Field(None, alias="productDescription")
    product_name: str | None = Field(None, alias="productName")
    dimensions: DimensionsSchema
    net_weight: float | None = Field(None, alias="netWeight")
    gross_weight: float | None = Field(None, alias="grossWeight")
    package_type: str | None = Field(None, alias="packageType")
    status_id: str = Field(..., alias="statusId")
    status: str | None = None
    created_on: datetime = Field(..., alias="createdOn")
    created_by: str | None = Field(None, alias="createdBy")
    updated_on: datetime | None = Field(None, alias="updatedOn")
    updated_by: str | None = Field(None, alias="updatedBy")

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
    )

    @model_validator(mode="before")
    @classmethod
    def transform_orm_and_payload(cls, data: Any) -> Any:
        if hasattr(data, "__table__"):
            # Reading from SQLAlchemy ORM instance
            category_rel = getattr(data, "category", None)
            status_rel = getattr(data, "status", None)
            category_name = category_rel.name if category_rel else getattr(data, "category_id", None)
            status_name = status_rel.name if status_rel else getattr(data, "status_id", None)

            dimensions_dict = {
                "lengthMm": getattr(data, "length_mm", None),
                "widthMm": getattr(data, "width_mm", None),
                "heightMm": getattr(data, "height_mm", None),
            }

            prod_name = getattr(data, "model", None) or getattr(data, "product_description", None)

            net_wt = getattr(data, "net_weight", None)
            if net_wt is not None:
                net_wt = float(net_wt)

            gross_wt = getattr(data, "gross_weight", None)
            if gross_wt is not None:
                gross_wt = float(gross_wt)

            raw_imgs = getattr(data, "fg_image", None)
            img_list = normalize_fg_image(raw_imgs)

            return {
                "id": data.id,
                "fg_image": img_list,
                "images": img_list,
                "material_code": data.material_code,
                "part_number": data.part_number,
                "category_id": data.category_id,
                "category": category_name,
                "model": data.model,
                "product_description": data.product_description,
                "product_name": prod_name,
                "dimensions": dimensions_dict,
                "net_weight": net_wt,
                "gross_weight": gross_wt,
                "package_type": data.package_type,
                "status_id": data.status_id,
                "status": status_name,
                "created_on": data.created_on,
                "created_by": data.created_by,
                "updated_on": data.updated_on,
                "updated_by": data.updated_by,
            }
        return data


class MasterDataListResponse(BaseModel):
    success: bool = True
    count: int
    data: list[MasterDataItemResponse]

    model_config = ConfigDict(populate_by_name=True)


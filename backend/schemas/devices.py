from datetime import datetime
from typing import Any
from pydantic import BaseModel, ConfigDict, Field, model_validator


class DeviceCreateRequest(BaseModel):
    device_id: str | None = Field(None, alias="deviceId")
    id: str | None = None
    display_name: str | None = Field(None, alias="displayName")
    name: str | None = None
    ip_address: str | None = Field(None, alias="ipAddress")
    mac_address: str | None = Field(None, alias="macAddress")
    make: str | None = None
    port: int | None = None
    created_by: str | None = Field("admin", alias="createdBy")

    model_config = ConfigDict(populate_by_name=True)


class DeviceUpdateRequest(BaseModel):
    device_id: str | None = Field(None, alias="deviceId")
    id: str | None = None
    display_name: str | None = Field(None, alias="displayName")
    name: str | None = None
    ip_address: str | None = Field(None, alias="ipAddress")
    mac_address: str | None = Field(None, alias="macAddress")
    make: str | None = None
    port: int | None = None
    updated_by: str | None = Field("admin", alias="updatedBy")

    model_config = ConfigDict(populate_by_name=True)


class DeviceResponse(BaseModel):
    device_id: str = Field(..., alias="deviceId")
    id: str
    display_name: str | None = Field(None, alias="displayName")
    name: str
    ip_address: str | None = Field(None, alias="ipAddress")
    mac_address: str | None = Field(None, alias="macAddress")
    make: str | None = None
    port: int | None = None
    created_on: datetime = Field(..., alias="createdOn")
    updated_on: datetime | None = Field(None, alias="updatedOn")
    created_by: str | None = Field(None, alias="createdBy")
    updated_by: str | None = Field(None, alias="updatedBy")

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    @model_validator(mode="before")
    @classmethod
    def transform_device_orm(cls, data: Any) -> Any:
        if hasattr(data, "__table__"):
            return {
                "device_id": data.device_id,
                "id": data.device_id,
                "display_name": data.name,
                "name": data.name,
                "ip_address": data.ip_address,
                "mac_address": data.mac_address,
                "make": data.make,
                "port": data.port,
                "created_on": data.created_on,
                "updated_on": data.updated_on,
                "created_by": data.created_by,
                "updated_by": data.updated_by,
            }
        return data


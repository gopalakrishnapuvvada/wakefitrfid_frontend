from __future__ import annotations
from datetime import datetime
from typing import Any, Dict, List, Optional, Union
from pydantic import BaseModel, ConfigDict, Field, model_validator


class DeviceCreateRequest(BaseModel):
    device_id: Optional[str] = Field(None, alias="deviceId")
    id: Optional[str] = None
    display_name: Optional[str] = Field(None, alias="displayName")
    name: Optional[str] = None
    ip_address: Optional[str] = Field(None, alias="ipAddress")
    mac_address: Optional[str] = Field(None, alias="macAddress")
    make: Optional[str] = None
    port: Optional[int] = None
    created_by: Optional[str] = Field("admin", alias="createdBy")

    model_config = ConfigDict(populate_by_name=True)


class DeviceUpdateRequest(BaseModel):
    device_id: Optional[str] = Field(None, alias="deviceId")
    id: Optional[str] = None
    display_name: Optional[str] = Field(None, alias="displayName")
    name: Optional[str] = None
    ip_address: Optional[str] = Field(None, alias="ipAddress")
    mac_address: Optional[str] = Field(None, alias="macAddress")
    make: Optional[str] = None
    port: Optional[int] = None
    updated_by: Optional[str] = Field("admin", alias="updatedBy")

    model_config = ConfigDict(populate_by_name=True)


class DeviceResponse(BaseModel):
    device_id: str = Field(..., alias="deviceId")
    id: str
    display_name: Optional[str] = Field(None, alias="displayName")
    name: str
    ip_address: Optional[str] = Field(None, alias="ipAddress")
    mac_address: Optional[str] = Field(None, alias="macAddress")
    make: Optional[str] = None
    port: Optional[int] = None
    created_on: datetime = Field(..., alias="createdOn")
    updated_on: Optional[datetime] = Field(None, alias="updatedOn")
    created_by: Optional[str] = Field(None, alias="createdBy")
    updated_by: Optional[str] = Field(None, alias="updatedBy")

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


class DeviceRegisterAuthorizeRequest(BaseModel):
    mac_address: Optional[str] = Field(None, alias="macAddress")
    display_name: Optional[str] = Field(None, alias="displayName")
    name: Optional[str] = None
    device_id: Optional[str] = Field(None, alias="deviceId")
    id: Optional[str] = None
    status: Optional[str] = "online"
    ip_address: Optional[str] = Field(None, alias="ipAddress")
    make: Optional[str] = "CipherLab"
    port: Optional[int] = None
    updated_by: Optional[str] = Field("device-auth", alias="updatedBy")
    created_by: Optional[str] = Field("device-auth", alias="createdBy")

    model_config = ConfigDict(populate_by_name=True)


class DeviceAuthorizeResponse(BaseModel):
    authorized: bool
    status: str
    displayName: Optional[str] = Field(None, alias="displayName")
    name: Optional[str] = None
    deviceId: Optional[str] = Field(None, alias="deviceId")
    device_id: Optional[str] = Field(None, alias="device_id")
    macAddress: Optional[str] = Field(None, alias="macAddress")
    mac_address: Optional[str] = Field(None, alias="mac_address")
    make: Optional[str] = None
    message: str

    model_config = ConfigDict(populate_by_name=True)


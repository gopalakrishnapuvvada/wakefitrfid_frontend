from __future__ import annotations
from datetime import datetime
from typing import Any, Dict, List, Optional, Union
from pydantic import BaseModel, ConfigDict, Field, model_validator


class RoleResponse(BaseModel):
    id: str
    name: str
    password: str
    created_on: Optional[datetime] = Field(None, alias="createdOn")
    created_by: Optional[str] = Field(None, alias="createdBy")
    updated_on: Optional[datetime] = Field(None, alias="updatedOn")
    updated_by: Optional[str] = Field(None, alias="updatedBy")

    model_config = ConfigDict(populate_by_name=True, from_attributes=True)


class RoleUpdatePasswordRequest(BaseModel):
    id: Optional[str] = None
    role_id: Optional[str] = Field(None, alias="roleId")
    name: Optional[str] = None
    new_password: str = Field(..., alias="newPassword")
    updated_by: Optional[str] = Field("admin", alias="updatedBy")

    model_config = ConfigDict(populate_by_name=True)

    @model_validator(mode="before")
    @classmethod
    def check_identifier(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "newPassword" not in data and "new_password" not in data and "password" in data:
                data["newPassword"] = data["password"]
            if not data.get("id") and not data.get("roleId") and not data.get("role_id") and data.get("role"):
                data["id"] = data["role"]
        return data


class RoleLoginRequest(BaseModel):
    role_id: str = Field(..., alias="roleId")
    password: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)


from datetime import datetime
from typing import Any
from pydantic import BaseModel, ConfigDict, Field, model_validator


class DeviceCategoryResponse(BaseModel):
    id: str
    name: str
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)


class ConnectionResponse(BaseModel):
    id: str
    name: str
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)


class DeviceStatusResponse(BaseModel):
    id: str
    name: str
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)


class DeviceCreateRequest(BaseModel):
    device_id: str | None = Field(None, alias="deviceId")
    id: str | None = None
    display_name: str | None = Field(None, alias="displayName")
    name: str | None = None
    asset_code: str | None = Field(None, alias="assetCode")
    code: str | None = None
    category_id: str | None = Field(None, alias="categoryId")
    category: str | None = None
    manufacturer: str | None = None
    model: str | None = None
    serial_number: str | None = Field(None, alias="serialNumber")
    mac_address: str | None = Field(None, alias="macAddress")
    station_id: str | None = Field(None, alias="stationId")
    location_line: str | None = Field(None, alias="locationLine")
    connection_id: str | None = Field(None, alias="connectionId")
    connection_type: str | None = Field(None, alias="connectionType")
    ip_address: str | None = Field(None, alias="ipAddress")
    port: int | None = None
    com_port: str | None = Field(None, alias="comPort")
    connection_parameters: str | None = Field(None, alias="connectionParameters")
    scan_mode: str | None = Field("Manual Scan", alias="scanMode")
    trigger_mode: str | None = Field(None, alias="triggerMode")
    status_id: str | None = Field("online", alias="statusId")
    status: str | None = None
    firmware_version: str | None = Field(None, alias="firmwareVersion")
    last_error: str | None = Field(None, alias="lastError")
    battery_level: int | None = Field(None, alias="batteryLevel")
    signal_strength_dbm: int | None = Field(None, alias="signalStrengthDbm")
    antenna_count: int | None = Field(None, alias="antennaCount")
    frequency_band: str | None = Field(None, alias="frequencyBand")
    baud_rate: str | None = Field(None, alias="baudRate")
    last_maintenance: datetime | None = Field(None, alias="lastMaintenance")
    assigned_operator: str | None = Field(None, alias="assignedOperator")
    brand: str | None = None
    created_by: str | None = Field("admin", alias="createdBy")

    model_config = ConfigDict(populate_by_name=True)


class DeviceUpdateRequest(BaseModel):
    device_id: str | None = Field(None, alias="deviceId")
    id: str | None = None
    display_name: str | None = Field(None, alias="displayName")
    name: str | None = None
    asset_code: str | None = Field(None, alias="assetCode")
    code: str | None = None
    category_id: str | None = Field(None, alias="categoryId")
    category: str | None = None
    manufacturer: str | None = None
    model: str | None = None
    serial_number: str | None = Field(None, alias="serialNumber")
    mac_address: str | None = Field(None, alias="macAddress")
    station_id: str | None = Field(None, alias="stationId")
    location_line: str | None = Field(None, alias="locationLine")
    connection_id: str | None = Field(None, alias="connectionId")
    connection_type: str | None = Field(None, alias="connectionType")
    ip_address: str | None = Field(None, alias="ipAddress")
    port: int | None = None
    com_port: str | None = Field(None, alias="comPort")
    connection_parameters: str | None = Field(None, alias="connectionParameters")
    scan_mode: str | None = Field(None, alias="scanMode")
    trigger_mode: str | None = Field(None, alias="triggerMode")
    status_id: str | None = Field(None, alias="statusId")
    status: str | None = None
    firmware_version: str | None = Field(None, alias="firmwareVersion")
    last_error: str | None = Field(None, alias="lastError")
    battery_level: int | None = Field(None, alias="batteryLevel")
    signal_strength_dbm: int | None = Field(None, alias="signalStrengthDbm")
    antenna_count: int | None = Field(None, alias="antennaCount")
    frequency_band: str | None = Field(None, alias="frequencyBand")
    baud_rate: str | None = Field(None, alias="baudRate")
    last_maintenance: datetime | None = Field(None, alias="lastMaintenance")
    assigned_operator: str | None = Field(None, alias="assignedOperator")
    brand: str | None = None
    updated_by: str | None = Field("admin", alias="updatedBy")

    model_config = ConfigDict(populate_by_name=True)


class DeviceResponse(BaseModel):
    device_id: str = Field(..., alias="deviceId")
    id: str
    display_name: str = Field(..., alias="displayName")
    name: str
    asset_code: str | None = Field(None, alias="assetCode")
    code: str | None = None
    category_id: str = Field(..., alias="categoryId")
    category: str | None = None
    manufacturer: str | None = None
    model: str | None = None
    serial_number: str | None = Field(None, alias="serialNumber")
    mac_address: str | None = Field(None, alias="macAddress")
    station_id: str | None = Field(None, alias="stationId")
    location_line: str | None = Field(None, alias="locationLine")
    connection_id: str = Field(..., alias="connectionId")
    connection_type: str | None = Field(None, alias="connectionType")
    ip_address: str | None = Field(None, alias="ipAddress")
    port: int | None = None
    com_port: str | None = Field(None, alias="comPort")
    connection_parameters: str | None = Field(None, alias="connectionParameters")
    scan_mode: str | None = Field(None, alias="scanMode")
    trigger_mode: str | None = Field(None, alias="triggerMode")
    status_id: str = Field(..., alias="statusId")
    status: str | None = None
    last_seen: datetime | None = Field(None, alias="lastSeen")
    firmware_version: str | None = Field(None, alias="firmwareVersion")
    last_error: str | None = Field(None, alias="lastError")
    battery_level: int | None = Field(None, alias="batteryLevel")
    signal_strength_dbm: int | None = Field(None, alias="signalStrengthDbm")
    antenna_count: int | None = Field(None, alias="antennaCount")
    frequency_band: str | None = Field(None, alias="frequencyBand")
    baud_rate: str | None = Field(None, alias="baudRate")
    last_maintenance: datetime | None = Field(None, alias="lastMaintenance")
    assigned_operator: str | None = Field(None, alias="assignedOperator")
    brand: str | None = None
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
    def transform_device_orm(cls, data: Any) -> Any:
        if hasattr(data, "__table__"):
            cat_rel = getattr(data, "category", None)
            conn_rel = getattr(data, "connection", None)
            stat_rel = getattr(data, "status", None)

            cat_name = cat_rel.name if cat_rel else getattr(data, "category_id", None)
            conn_name = conn_rel.name if conn_rel else getattr(data, "connection_id", None)
            stat_name = stat_rel.name if stat_rel else getattr(data, "status_id", None)

            return {
                "device_id": data.device_id,
                "id": data.device_id,
                "display_name": data.display_name,
                "name": data.display_name,
                "asset_code": data.asset_code,
                "code": data.asset_code,
                "category_id": data.category_id,
                "category": cat_name,
                "manufacturer": data.manufacturer,
                "model": data.model,
                "serial_number": data.serial_number,
                "mac_address": data.mac_address,
                "station_id": data.station_id,
                "location_line": data.station_id,
                "connection_id": data.connection_id,
                "connection_type": conn_name,
                "ip_address": data.ip_address,
                "port": data.port,
                "com_port": data.com_port,
                "connection_parameters": data.connection_parameters,
                "scan_mode": data.scan_mode,
                "trigger_mode": data.scan_mode,
                "status_id": data.status_id,
                "status": stat_name,
                "last_seen": data.last_seen,
                "firmware_version": data.firmware_version,
                "last_error": data.last_error,
                "battery_level": data.battery_level,
                "signal_strength_dbm": data.signal_strength_dbm,
                "antenna_count": data.antenna_count,
                "frequency_band": data.frequency_band,
                "baud_rate": data.baud_rate,
                "last_maintenance": data.last_maintenance,
                "assigned_operator": data.assigned_operator,
                "brand": data.brand,
                "created_on": data.created_on,
                "created_by": data.created_by,
                "updated_on": data.updated_on,
                "updated_by": data.updated_by,
            }
        return data


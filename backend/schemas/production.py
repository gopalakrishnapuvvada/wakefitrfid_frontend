from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ProductionRecordResponse(BaseModel):
    id: int
    timestamp: datetime
    serial_number: str
    model_name: str
    model_id: str
    created_by: str
    created_on: datetime
    updated_by: str | None
    updated_on: datetime | None

    model_config = ConfigDict(
        from_attributes=True,
        protected_namespaces=(),
    )

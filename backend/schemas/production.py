from __future__ import annotations
from typing import Any, Dict, List, Optional, Union
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
    updated_by: Optional[str]
    updated_on: Optional[datetime]

    model_config = ConfigDict(
        from_attributes=True,
        protected_namespaces=(),
    )

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from utils.dependencies import get_db
from models.production import ProductionRecord
from schemas.production import ProductionRecordResponse


router = APIRouter(
    prefix="/production-records",
    tags=["Production Records"],
)


@router.get(
    "/",
    response_model=list[ProductionRecordResponse],
)
def get_production_records(
    db: Annotated[Session, Depends(get_db)],
):
    return db.query(ProductionRecord).all()


@router.post("/seed")
def seed_production_records(
    db: Annotated[Session, Depends(get_db)],
):
    records = [
        ProductionRecord(
            timestamp=datetime(2026, 9, 3, 10, 30, tzinfo=timezone.utc),
            serial_number="SN10001",
            model_name="Model-X100",
            model_id="MDL-001",
            created_by="admin",
            updated_by="admin",
        ),
        ProductionRecord(
            timestamp=datetime(2026, 9, 3, 11, 15, tzinfo=timezone.utc),
            serial_number="SN10002",
            model_name="Model-X200",
            model_id="MDL-002",
            created_by="admin",
            updated_by="admin",
        ),
        ProductionRecord(
            timestamp=datetime(2026, 9, 3, 12, 45, tzinfo=timezone.utc),
            serial_number="SN10003",
            model_name="Model-X100",
            model_id="MDL-001",
            created_by="john",
            updated_by="john",
        ),
    ]

    db.add_all(records)
    db.commit()

    return {
        "message": "Production records seeded successfully",
        "count": len(records),
    }

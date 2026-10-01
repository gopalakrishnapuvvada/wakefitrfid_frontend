from __future__ import annotations
from typing import Any, Dict, List, Optional, Union
from collections.abc import Generator

from sqlalchemy.orm import Session

from utils.database import SessionLocal


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()

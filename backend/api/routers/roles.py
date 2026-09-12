from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from models.roles import Role
from schemas.roles import RoleLoginRequest, RoleResponse, RoleUpdatePasswordRequest
from utils.dependencies import get_db

router = APIRouter(
    tags=["Roles & Access Control"],
)


@router.get("/get_roles_data", response_model=list[RoleResponse])
@router.get("/", response_model=list[RoleResponse])
def get_roles_data(db: Annotated[Session, Depends(get_db)]):
    """Retrieve all operator roles and their configuration."""
    return db.query(Role).order_by(Role.id).all()


@router.put("/update_roles_password")
@router.put("/password")
def update_roles_password(
    payload: RoleUpdatePasswordRequest,
    db: Annotated[Session, Depends(get_db)],
):
    """Update role password by role ID or name."""
    identifier = payload.id or payload.role_id or payload.name
    if not identifier:
        raise HTTPException(status_code=400, detail="Role identifier (id, roleId, or name) is required.")

    role = db.query(Role).filter(
        or_(
            Role.id == identifier,
            Role.name == identifier,
            Role.id == identifier.lower(),
            Role.name.ilike(f"%{identifier}%"),
        )
    ).first()

    if not role:
        raise HTTPException(status_code=404, detail=f"Role '{identifier}' not found.")

    if not payload.new_password or not payload.new_password.strip():
        raise HTTPException(status_code=400, detail="New password cannot be empty.")

    role.password = payload.new_password.strip()
    role.updated_on = datetime.now(timezone.utc)
    role.updated_by = payload.updated_by or "admin"

    db.commit()
    db.refresh(role)

    return {
        "success": True,
        "message": f"Password updated successfully for role '{role.name}' ({role.id})",
        "role": RoleResponse.model_validate(role),
    }


@router.post("/login")
def login_role(
    payload: RoleLoginRequest,
    db: Annotated[Session, Depends(get_db)],
):
    """Authenticate a role against database password."""
    role = db.query(Role).filter(
        or_(
            Role.id == payload.role_id.strip(),
            Role.id == payload.role_id.strip().lower(),
        )
    ).first()

    if not role:
        raise HTTPException(status_code=404, detail=f"Role '{payload.role_id}' not found.")

    if role.password and payload.password:
        if role.password.strip() != payload.password.strip():
            raise HTTPException(status_code=401, detail="Invalid password.")

    return {
        "success": True,
        "role": RoleResponse.model_validate(role),
    }


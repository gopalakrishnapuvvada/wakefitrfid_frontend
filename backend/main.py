from __future__ import annotations
from typing import Any, Dict, List, Optional, Union
import os
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from utils.database import (
    Base,
    engine,
    SessionLocal,
    migrate_legacy_devices_table,
    migrate_devices_table,
    migrate_master_data_items_table,
    migrate_transactions_data_table,
)
import models  # Imports and registers all models: Role, Device, MasterDataItem, TransactionData, ProductionRecord
from api.routers.production import router as production_router
from api.routers.roles import router as roles_router
from api.routers.devices import router as devices_router
from api.routers.master_data import router as master_data_router
from api.routers.transactions import router as transactions_router

# Migrate the old tables before creating any missing tables.
migrate_legacy_devices_table()
migrate_devices_table()
migrate_master_data_items_table()
migrate_transactions_data_table()

# Create all database tables on startup
Base.metadata.create_all(bind=engine)


def init_required_db_records():
    """Ensure core transaction statuses are present and unique index exists."""
    with SessionLocal() as db:
        # 1. StatusTransactionData: 'wip' and 'dispatch'
        for st_id, st_name in [("wip", "Wip"), ("dispatch", "Dispatch")]:
            if not db.query(models.StatusTransactionData).filter(models.StatusTransactionData.id == st_id).first():
                db.add(models.StatusTransactionData(id=st_id, name=st_name, created_by="system"))

        # 2. Ensure global unique index on factory_rfid_tag_id in transactions_data
        try:
            from sqlalchemy import text
            db.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_data_rfid ON transactions_data(factory_rfid_tag_id)"))
        except Exception as idx_err:
            print(f"Notice: Unique index uq_transactions_data_rfid creation: {idx_err}")

        db.commit()


try:
    init_required_db_records()
except Exception as e:
    print(f"Startup DB initialization notice: {e}")

# Ensure uploads directory exists
import sys

if getattr(sys, 'frozen', False):
    APP_ROOT = Path(sys.executable).resolve().parent
else:
    APP_ROOT = Path(__file__).resolve().parent

UPLOADS_DIR = APP_ROOT / "uploads"
(UPLOADS_DIR / "transactions").mkdir(parents=True, exist_ok=True)

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle manager: Starts SICK Fixed RFID reader on server boot and stops on shutdown."""
    try:
        from uaim_device.service import start_rfid_service
        await start_rfid_service()
    except Exception as e:
        print(f"Warning: Could not start SICK RFID scanner service: {e}")

    yield

    try:
        from uaim_device.service import stop_rfid_service
        await stop_rfid_service()
    except Exception as e:
        print(f"Notice: Error stopping SICK RFID scanner service: {e}")


app = FastAPI(
    title="Wakefit FG Auto-ID, Devices, Roles & Master Data API",
    version="2.5.0",
    description="Backend API for Wakefit Finished Goods (FG) Marriage, Device Management, Roles & Catalog.",
    lifespan=lifespan,
)

# Mount /uploads for static image retrieval
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")

# Enable CORS for frontend web integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 1. Master Data Items & Catalog (includes /post_devices_data, /get_devices_data, /get_roles_data, /update_roles_password)
app.include_router(master_data_router, prefix="/api/master_data")
app.include_router(master_data_router, prefix="/api/master-data")
app.include_router(master_data_router, prefix="/master_data")
app.include_router(master_data_router, prefix="/master-data")

# 2. Dedicated Roles Router
app.include_router(roles_router, prefix="/api/roles")
app.include_router(roles_router, prefix="/roles")

# 3. Dedicated Devices Router
app.include_router(devices_router, prefix="/api/devices")
app.include_router(devices_router, prefix="/devices")

# 4. Married FG Transactions & Audit Router
from utils.dependencies import get_db
from fastapi import Depends

app.include_router(transactions_router, prefix="/api/transactions")
app.include_router(transactions_router, prefix="/api/marriage")
app.include_router(transactions_router, prefix="/transactions")

# Global routes for post_scan (with post_can aliases)
@app.post("/api/post_scan")
@app.post("/post_scan")
@app.post("/api/post_can")
@app.post("/post_can")
def global_post_scan(payload: dict, db=Depends(get_db)):
    from api.routers.transactions import post_scan
    from schemas.transactions import PostScanRequest
    return post_scan(PostScanRequest(**payload), db)

global_post_can = global_post_scan

@app.get("/api/pending_scan")
@app.get("/pending_scan")
def global_pending_scan():
    from api.routers.transactions import get_pending_scan
    return get_pending_scan()

@app.post("/api/cancel_scan")
@app.post("/cancel_scan")
@app.post("/api/cancel_can")
@app.post("/cancel_can")
def global_cancel_scan():
    from api.routers.transactions import cancel_scan
    return cancel_scan()

global_cancel_can = global_cancel_scan

# Global routes for post_fixed_rfid (SICK Fixed RFID Portal)
@app.post("/api/post_fixed_rfid")
@app.post("/post_fixed_rfid")
def global_post_fixed_rfid(payload: dict, db=Depends(get_db)):
    from api.routers.transactions import post_fixed_rfid
    from schemas.transactions import PostFixedRfidRequest
    return post_fixed_rfid(PostFixedRfidRequest(**payload), db)

@app.get("/api/pending_fixed_rfid")
@app.get("/pending_fixed_rfid")
def global_pending_fixed_rfid(db=Depends(get_db)):
    from api.routers.transactions import get_pending_fixed_rfid
    return get_pending_fixed_rfid(db)

@app.post("/api/clear_fixed_rfid")
@app.post("/clear_fixed_rfid")
def global_clear_fixed_rfid():
    from api.routers.transactions import clear_fixed_rfid
    return clear_fixed_rfid()

@app.post("/api/clear")
@app.post("/clear")
def global_clear_transactions(db=Depends(get_db)):
    from api.routers.transactions import clear_all_transactions
    return clear_all_transactions(db)

# 5. Production Records (legacy dummy)
app.include_router(production_router, prefix="/api/production")
app.include_router(production_router, prefix="/production-records")

# 6. SICK Fixed RFID Hardware Management Router & Real-Time WebSocket
from fastapi import WebSocket, WebSocketDisconnect
from uaim_device.api.routes import router as rfid_adapter_router
from uaim_device.api.websocket import WS_MANAGER

app.include_router(rfid_adapter_router, prefix="/api/v1")

@app.websocket("/ws/events")
async def websocket_events_endpoint(websocket: WebSocket):
    """Real-time normalized RFID event stream for UI dashboard."""
    await WS_MANAGER.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except (WebSocketDisconnect, Exception):
        await WS_MANAGER.disconnect(websocket)



# -------------------------------------------------------------
# Frontend SPA & Static Assets Mounting
# -------------------------------------------------------------
from fastapi.responses import FileResponse

# Check for compiled frontend distribution directory
FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if getattr(sys, 'frozen', False):
    base_meipass = getattr(sys, '_MEIPASS', APP_ROOT)
    bundled_dist = Path(base_meipass) / "frontend" / "dist"
    if bundled_dist.exists():
        FRONTEND_DIST = bundled_dist
    elif (APP_ROOT / "frontend" / "dist").exists():
        FRONTEND_DIST = APP_ROOT / "frontend" / "dist"

if FRONTEND_DIST.exists() and (FRONTEND_DIST / "index.html").exists():
    if (FRONTEND_DIST / "assets").exists():
        app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="frontend_assets")

    @app.get("/{full_path:path}")
    async def serve_frontend_spa(full_path: str):
        # Allow API and Swagger docs to pass through
        if full_path.startswith("api/") or full_path.startswith("docs") or full_path.startswith("openapi.json"):
            return {"error": "Not Found"}
        target_file = FRONTEND_DIST / full_path
        if full_path and target_file.is_file():
            return FileResponse(str(target_file))
        return FileResponse(str(FRONTEND_DIST / "index.html"))
else:
    @app.get("/")
    def health_check():
        return {
            "status": "online",
            "system": "Wakefit Finished Goods Auto-ID & Marriage API",
            "version": "2.5.0",
            "endpoints": {
                "masterData": "/api/master-data",
                "devices": "/api/devices",
                "roles": "/api/roles",
                "transactions": "/api/transactions",
                "post_scan": "/api/transactions/post_scan",
                "post_fixed_rfid": "/api/transactions/post_fixed_rfid",
            }
        }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)


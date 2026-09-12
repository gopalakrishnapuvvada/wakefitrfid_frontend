from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from utils.database import Base, engine
import models  # Imports and registers all models: Role, Device, MasterDataItem, TransactionData, ProductionRecord
from api.routers.production import router as production_router
from api.routers.roles import router as roles_router
from api.routers.devices import router as devices_router
from api.routers.master_data import router as master_data_router
from api.routers.transactions import router as transactions_router

# Create all database tables on startup
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Wakefit FG Auto-ID, Devices, Roles & Master Data API",
    version="2.5.0",
    description="Backend API for Wakefit Finished Goods (FG) Marriage, Device Management, Roles & Catalog.",
)

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
def global_pending_fixed_rfid():
    from api.routers.transactions import get_pending_fixed_rfid
    return get_pending_fixed_rfid()

@app.post("/api/clear_fixed_rfid")
@app.post("/clear_fixed_rfid")
def global_clear_fixed_rfid():
    from api.routers.transactions import clear_fixed_rfid
    return clear_fixed_rfid()

# 5. Production Records (legacy dummy)
app.include_router(production_router, prefix="/api/production")
app.include_router(production_router, prefix="/production-records")


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


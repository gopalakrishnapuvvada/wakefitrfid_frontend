from api.routers.production import router as production_router
from api.routers.roles import router as roles_router
from api.routers.devices import router as devices_router
from api.routers.master_data import router as master_data_router
from api.routers.transactions import router as transactions_router

__all__ = [
    "production_router",
    "roles_router",
    "devices_router",
    "master_data_router",
    "transactions_router",
]


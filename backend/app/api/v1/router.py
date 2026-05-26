from fastapi import APIRouter

from app.api.v1.routes import (
    auth,
    business,
    communication,
    finance,
    hrms,
    inventory,
    leads,
    projects,
    settings,
    workspace,
)

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(workspace.router, prefix="/workspace", tags=["workspace"])
api_router.include_router(projects.router, prefix="/projects", tags=["projects"])
api_router.include_router(inventory.router, prefix="/inventory", tags=["inventory"])
api_router.include_router(leads.router, prefix="/leads", tags=["leads"])
api_router.include_router(finance.router, prefix="/finance", tags=["finance"])
api_router.include_router(communication.router, prefix="/communication", tags=["communication"])
api_router.include_router(hrms.router, prefix="/hrms", tags=["hrms"])
api_router.include_router(settings.router, prefix="/settings", tags=["settings"])
api_router.include_router(business.router, prefix="/business", tags=["business"])

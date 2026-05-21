from fastapi import APIRouter
router = APIRouter(prefix="/api", tags=["health"])
@router.get("/health")
def health():
    return {"status": "ok", "service": "mathpath-backend-v1"}

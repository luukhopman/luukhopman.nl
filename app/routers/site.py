import os
from typing import Any

from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse

from app.auth import verify_auth_page
from app.config import STATIC_DIR

router = APIRouter()


@router.get("/", response_class=FileResponse, dependencies=[Depends(verify_auth_page)])
def serve_landing_page() -> Any:
    index_path = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "Landing page not found."}

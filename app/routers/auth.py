from fastapi import APIRouter, Request, Response
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.auth import login_user
from app.config import STATIC_DIR


class LoginRequest(BaseModel):
    password: str


router = APIRouter()


@router.get("/login")
def login_page():
    """Serve the unified login page."""
    return FileResponse(f"{STATIC_DIR}/login.html")


@router.post("/api/login")
def login(
    login_req: LoginRequest, request: Request, response: Response
) -> dict[str, str]:
    """Authenticate user and set a cookie."""
    return login_user(login_req.password, request, response)

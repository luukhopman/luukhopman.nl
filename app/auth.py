from fastapi import HTTPException, Request, Response

from app.config import APP_PASSWORD, AUTH_MAX_AGE_SECONDS, AUTH_TOKEN


def _request_is_secure(request: Request) -> bool:
    """Treat proxied HTTPS requests as secure for cookie issuance."""
    forwarded_proto = request.headers.get("x-forwarded-proto", "")
    if forwarded_proto:
        return forwarded_proto.split(",", 1)[0].strip().lower() == "https"
    return request.url.scheme == "https"


def verify_auth(request: Request) -> None:
    """Verify the authentication cookie for API requests."""
    if not APP_PASSWORD:
        return
    token = request.cookies.get("auth_token")
    if token != AUTH_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized")


def verify_auth_page(request: Request) -> None:
    """Verify auth and redirect to login if missing (for HTML pages)."""
    if not APP_PASSWORD:
        return
    token = request.cookies.get("auth_token")
    if token != AUTH_TOKEN:
        raise HTTPException(
            status_code=307,
            detail="Redirecting to login",
            headers={"Location": f"/login?redirect={request.url.path}"},
        )


def login_user(password: str, request: Request, response: Response) -> dict[str, str]:
    """Authenticate the request and attach the auth cookie."""
    if not APP_PASSWORD:
        return {"message": "No password configured"}
    if password != APP_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid password")

    assert AUTH_TOKEN is not None
    response.set_cookie(
        key="auth_token",
        value=AUTH_TOKEN,
        max_age=AUTH_MAX_AGE_SECONDS,
        httponly=True,
        samesite="lax",
        secure=_request_is_secure(request),
        path="/",
    )
    return {"message": "Logged in successfully"}

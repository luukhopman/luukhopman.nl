"""Application entrypoint and assembly for the website."""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session

load_dotenv()

from app.config import STATIC_DIR  # noqa: E402
from app.database import engine, init_db  # noqa: E402
from app.features.cookbook.routes import router as cookbook_router  # noqa: E402
from app.features.todo.routes import router as todo_router  # noqa: E402
from app.features.wishlist.routes import router as wishlist_router  # noqa: E402
from app.routers.auth import router as auth_router  # noqa: E402
from app.routers.realtime import router as realtime_router  # noqa: E402
from app.routers.site import router as site_router  # noqa: E402
from app.services.cleanup import cleanup_expired_acquired_products  # noqa: E402

SUBDOMAIN_REDIRECTS = {
    "todo": "/todo",
    "wishlist": "/wishlist",
    "cookbook": "/cookbook",
}


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
    """Manage startup tasks for database connectivity and housekeeping."""
    init_db()
    with Session(engine) as session:
        cleanup_expired_acquired_products(session)
    yield


app = FastAPI(title="Wishlist", lifespan=lifespan)


def _get_forwarded_host(request: Request) -> str:
    forwarded_host = request.headers.get("x-forwarded-host")
    host = forwarded_host or request.headers.get("host", "")
    return host.split(",", 1)[0].strip()


def _split_host_and_port(host: str) -> tuple[str, str | None]:
    if not host:
        return "", None
    if host.startswith("["):
        return host, None
    if host.count(":") == 1:
        hostname, port = host.split(":", 1)
        return hostname.lower(), port
    return host.lower(), None


def _subdomain_redirect_target(request: Request) -> str | None:
    raw_host = _get_forwarded_host(request)
    hostname, port = _split_host_and_port(raw_host)
    if not hostname:
        return None

    labels = hostname.split(".")
    if len(labels) < 3:
        return None

    subdomain = labels[0]
    target_path = SUBDOMAIN_REDIRECTS.get(subdomain)
    if not target_path:
        return None

    root_host = ".".join(labels[1:])
    if not root_host:
        return None

    forwarded_proto = request.headers.get("x-forwarded-proto")
    scheme = (forwarded_proto or request.url.scheme or "https").split(",", 1)[0].strip()
    port_suffix = f":{port}" if port else ""
    query = f"?{request.url.query}" if request.url.query else ""
    return f"{scheme}://{root_host}{port_suffix}{target_path}{query}"


@app.middleware("http")
async def redirect_known_subdomains(request: Request, call_next):
    redirect_target = _subdomain_redirect_target(request)
    if redirect_target:
        return RedirectResponse(url=redirect_target, status_code=307)
    return await call_next(request)


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
app.include_router(auth_router)
app.include_router(realtime_router)
app.include_router(wishlist_router)
app.include_router(todo_router)
app.include_router(cookbook_router)
app.include_router(site_router)

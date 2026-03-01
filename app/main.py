"""
Main FastAPI server for Wishlist.

Serves the REST API for managing products and hosts the static frontend files.
Includes full type-hinting and soft-deletion capabilities.
"""

import hashlib
import json
import os
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlmodel import Session, col, select

# Load environment variables from .env before importing modules that read env at import time.
load_dotenv()

from app.database import (  # noqa: E402
    Product,
    ProductCreate,
    ProductUpdate,
    Recipe,
    RecipeCreate,
    RecipeUpdate,
    get_session,
    init_db,
)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
    """Manage the application lifespan to ensure the DB connects on startup."""
    init_db()
    yield


# Auth setup
APP_PASSWORD = os.getenv("APP_PASSWORD")
AUTH_TOKEN = hashlib.sha256(APP_PASSWORD.encode()).hexdigest() if APP_PASSWORD else None

static_dir = os.path.join(os.path.dirname(__file__), "static")
if not os.path.exists(static_dir):
    os.makedirs(static_dir)


def verify_auth(request: Request) -> None:
    """Verify the authentication cookie for API requests."""
    if not APP_PASSWORD:
        return
    token = request.cookies.get("auth_token")
    if token != AUTH_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized")


app = FastAPI(title="Wishlist", lifespan=lifespan)


def verify_auth_page(request: Request) -> None:
    """Verify auth and redirect to login if missing (for HTML pages)."""
    if not APP_PASSWORD:
        return
    token = request.cookies.get("auth_token")
    if token != AUTH_TOKEN:
        # Redirect to login with the current path as redirect param
        path = request.url.path
        raise HTTPException(
            status_code=307,
            detail="Redirecting to login",
            headers={"Location": f"/login?redirect={path}"},
        )


@app.get("/login")
def login_page():
    """Serve the unified login page."""
    return FileResponse(os.path.join(static_dir, "login.html"))


class LoginRequest(BaseModel):
    password: str


@app.post("/api/login")
def login(login_req: LoginRequest, response: Response) -> dict[str, str]:
    """Authenticate user and set a cookie."""
    if not APP_PASSWORD:
        return {"message": "No password configured"}
    if login_req.password != APP_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid password")
    # 10 years expiration
    max_age = 10 * 365 * 24 * 60 * 60
    assert AUTH_TOKEN is not None
    response.set_cookie(
        key="auth_token",
        value=AUTH_TOKEN,
        max_age=max_age,
        httponly=True,
        samesite="lax",
        path="/",
    )
    return {"message": "Logged in successfully"}


@app.get(
    "/api/wishlist/products",
    response_model=list[Product],
    dependencies=[Depends(verify_auth)],
)
@app.get(
    "/api/todo/products",
    response_model=list[Product],
    dependencies=[Depends(verify_auth)],
)
def get_products(session: Session = Depends(get_session)) -> list[Product]:
    """
    Retrieve all products.

    Returns:
        A list of Product database records ordered by creation date descending.
    """
    statement = select(Product).order_by(col(Product.created_at).desc())
    products = session.exec(statement).all()

    # Auto-delete items acquired more than 7 days ago
    changed = False
    now = datetime.now(UTC)
    for product in products:
        if product.acquired and not product.is_deleted and product.acquired_at:
            try:
                acquired_date = datetime.fromisoformat(product.acquired_at)
                if now - acquired_date > timedelta(days=7):
                    product.is_deleted = True
                    product.deleted_at = now.isoformat()
                    session.add(product)
                    changed = True
            except ValueError:
                pass

        # Optionally, hard-delete items deleted more than 7 days ago?
        # The prompt says: "7 days after acquiring it should be deleted."
        # We will stop there to be safe.

    if changed:
        session.commit()

    return list(products)


@app.post(
    "/api/wishlist/products",
    response_model=dict[str, Any],
    status_code=201,
    dependencies=[Depends(verify_auth)],
)
@app.post(
    "/api/todo/products",
    response_model=dict[str, Any],
    status_code=201,
    dependencies=[Depends(verify_auth)],
)
def create_product(
    product: ProductCreate, session: Session = Depends(get_session)
) -> dict[str, Any]:
    """
    Create a new product to be tracked.

    Args:
        product: The Product properties sent in the request body.
        session: The database session injected by dependency.

    Returns:
        A dictionary with the new ID and a success message.
    """
    db_product = Product.model_validate(product)
    session.add(db_product)
    session.commit()
    # Explicitly get the ID instead of a full refresh if it's hanging
    product_id = db_product.id
    return {"id": product_id, "message": "Product added successfully"}


@app.delete(
    "/api/wishlist/products/{product_id}",
    response_model=dict[str, str],
    dependencies=[Depends(verify_auth)],
)
@app.delete(
    "/api/todo/products/{product_id}",
    response_model=dict[str, str],
    dependencies=[Depends(verify_auth)],
)
def delete_product(
    product_id: int, session: Session = Depends(get_session), hard: bool = False
) -> dict[str, str]:
    """
    Soft-delete or hard-delete a product by its ID.

    Args:
        product_id: The unique ID of the product.
        session: The database session injected by dependency.
        hard: If true, permanently deletes the item instead of soft-deleting.

    Returns:
        A dictionary with a success message.

    Raises:
        HTTPException: If the product does not exist.
    """
    product = session.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    if hard:
        session.delete(product)
        session.commit()
        return {"message": "Product permanently deleted"}
    else:
        # Implement soft-deletion instead of hard deletion
        product.is_deleted = True
        product.deleted_at = datetime.now(UTC).isoformat()
        session.add(product)
        session.commit()
        return {"message": "Product soft-deleted successfully"}


@app.patch(
    "/api/wishlist/products/{product_id}",
    response_model=dict[str, str],
    dependencies=[Depends(verify_auth)],
)
@app.patch(
    "/api/todo/products/{product_id}",
    response_model=dict[str, str],
    dependencies=[Depends(verify_auth)],
)
def update_product_status(
    product_id: int,
    product_update: ProductUpdate,
    session: Session = Depends(get_session),
) -> dict[str, str]:
    """
    Update a product's state, such as marking it acquired or recovering it.

    Args:
        product_id: The unique ID of the product.
        product_update: The fields to update (acquired, is_deleted).
        session: The database session injected by dependency.

    Returns:
        A dictionary with a success message.

    Raises:
        HTTPException: If the product does not exist.
    """
    product = session.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    if product_update.acquired is not None:
        if product_update.acquired and not product.acquired:
            product.acquired_at = datetime.now(UTC).isoformat()
        elif not product_update.acquired and product.acquired:
            product.acquired_at = None
        product.acquired = product_update.acquired

    if product_update.is_deleted is not None:
        if product_update.is_deleted and not product.is_deleted:
            product.deleted_at = datetime.now(UTC).isoformat()
        elif not product_update.is_deleted and product.is_deleted:
            product.deleted_at = None
        product.is_deleted = product_update.is_deleted

    if product_update.name is not None:
        product.name = product_update.name

    # Allow explicitly unsetting store or url, maybe by passing empty strings
    if product_update.store is not None:
        product.store = product_update.store if product_update.store != "" else None
    if product_update.url is not None:
        product.url = product_update.url if product_update.url != "" else None

    session.add(product)
    session.commit()
    return {"message": "Product status updated"}


@app.get(
    "/api/cookbook", response_model=list[Recipe], dependencies=[Depends(verify_auth)]
)
def get_recipes(session: Session = Depends(get_session)) -> list[Recipe]:
    """Retrieve all recipes."""
    statement = select(Recipe).order_by(col(Recipe.created_at).desc())
    return list(session.exec(statement).all())


@app.post(
    "/api/cookbook",
    response_model=dict[str, Any],
    status_code=201,
    dependencies=[Depends(verify_auth)],
)
def create_recipe(
    recipe: RecipeCreate, session: Session = Depends(get_session)
) -> dict[str, Any]:
    """Create a new recipe."""
    db_recipe = Recipe.model_validate(recipe)
    session.add(db_recipe)
    session.commit()
    recipe_id = db_recipe.id
    return {"id": recipe_id, "message": "Recipe added successfully"}


@app.delete(
    "/api/cookbook/{recipe_id}",
    response_model=dict[str, str],
    dependencies=[Depends(verify_auth)],
)
def delete_recipe(
    recipe_id: int, session: Session = Depends(get_session)
) -> dict[str, str]:
    """Delete a recipe by its ID."""
    recipe = session.get(Recipe, recipe_id)
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    session.delete(recipe)
    session.commit()
    return {"message": "Recipe deleted successfully"}


@app.patch(
    "/api/cookbook/{recipe_id}",
    response_model=dict[str, str],
    dependencies=[Depends(verify_auth)],
)
def update_recipe(
    recipe_id: int,
    recipe_update: RecipeUpdate,
    session: Session = Depends(get_session),
) -> dict[str, str]:
    """Update a recipe's details."""
    recipe = session.get(Recipe, recipe_id)
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")

    update_data = recipe_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(recipe, key, value)

    session.add(recipe)
    session.commit()
    return {"message": "Recipe updated successfully"}


@app.get("/api/cookbook/parse", dependencies=[Depends(verify_auth)])
async def parse_recipe(url: str) -> dict[str, Any]:
    """
    Experimental: Parse recipe data from a URL.
    Uses JSON-LD, meta tags, and common patterns.
    """
    def fallback_title(input_url: str) -> str:
        try:
            path = httpx.URL(input_url).path.strip("/")
            if not path:
                return "New Recipe"
            slug = path.split("/")[-1].replace("-", " ").strip()
            return slug.title() if slug else "New Recipe"
        except Exception:
            return "New Recipe"

    browser_headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/122.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.google.com/",
    }

    result = {
        "title": "",
        "description": "",
        "url": url,
        "ingredients": "",
        "instructions": "",
    }

    try:
        # Validate URL early.
        parsed_url = httpx.URL(url)
        if parsed_url.scheme not in {"http", "https"}:
            raise ValueError("URL must be http or https")
    except Exception as err:
        raise HTTPException(status_code=400, detail=f"Invalid URL: {err}") from err

    html = ""
    last_error = None

    try:
        async with httpx.AsyncClient(headers=browser_headers, follow_redirects=True, timeout=15.0) as client:
            response = await client.get(url)
            if response.status_code < 400:
                html = response.text
            else:
                last_error = f"HTTP {response.status_code}"
    except Exception as err:
        last_error = str(err)

    # Some sites block bot-like requests. Try a readable fallback proxy.
    if not html:
        try:
            proxy_url = f"https://r.jina.ai/http://{parsed_url.host}{parsed_url.path}"
            async with httpx.AsyncClient(timeout=20.0) as client:
                proxy_resp = await client.get(proxy_url)
                if proxy_resp.status_code < 400:
                    html = proxy_resp.text
                else:
                    last_error = f"Proxy HTTP {proxy_resp.status_code}"
        except Exception as err:
            last_error = str(err)

    if not html:
        # Graceful fallback instead of hard failing the UI flow.
        return {
            "title": fallback_title(url),
            "description": f"Could not auto-parse this page ({last_error or 'unknown error'}).",
            "url": url,
            "ingredients": "",
            "instructions": "",
        }

    try:
        soup = BeautifulSoup(html, "html.parser")

        # 1. Try JSON-LD (Schema.org)
        scripts = soup.find_all("script", type="application/ld+json")
        for script in scripts:
            try:
                if script.string is None:
                    continue
                data = json.loads(script.string)

                # Could be a list or a single object
                if isinstance(data, list):
                    nodes = data
                elif isinstance(data, dict) and "@graph" in data:
                    nodes = data["@graph"]
                else:
                    nodes = [data]

                for node in nodes:
                    if node.get("@type") == "Recipe" or "Recipe" in str(
                        node.get("@type", "")
                    ):
                        if not result["title"]:
                            result["title"] = node.get("name")
                        if not result["description"]:
                            result["description"] = node.get("description")

                        # Ingredients
                        ings = node.get("recipeIngredient")
                        if ings:
                            if isinstance(ings, list):
                                result["ingredients"] = "\n".join([f"- {i}" for i in ings])
                            else:
                                result["ingredients"] = str(ings)

                        # Instructions
                        inst = node.get("recipeInstructions")
                        if inst:
                            if isinstance(inst, list):
                                steps = []
                                for step in inst:
                                    if isinstance(step, dict) and "text" in step:
                                        steps.append(step["text"])
                                    elif isinstance(step, str):
                                        steps.append(step)
                                result["instructions"] = "\n".join(
                                    [f"{idx + 1}. {s}" for idx, s in enumerate(steps)]
                                )
                            elif isinstance(inst, str):
                                result["instructions"] = inst
            except Exception:
                continue

        # 2. Fallback to Meta tags
        if not result["title"]:
            og_title = soup.find("meta", property="og:title")
            if og_title:
                result["title"] = og_title.get("content", "")
            if not result["title"]:
                result["title"] = soup.title.string if soup.title else ""

        if not result["description"]:
            og_desc = soup.find("meta", property="og:description")
            if og_desc:
                result["description"] = og_desc.get("content", "")

        # Final cleanup
        for key in ["title", "description", "ingredients", "instructions"]:
            if result[key]:
                result[key] = str(result[key]).strip()
            else:
                result[key] = ""

        if not result["title"]:
            result["title"] = fallback_title(url)

        return result
    except Exception as err:
        return {
            "title": fallback_title(url),
            "description": f"Could not fully parse this page ({str(err)}).",
            "url": url,
            "ingredients": "",
            "instructions": "",
        }


# Mount static files
app.mount("/static", StaticFiles(directory=static_dir), name="static")


@app.get(
    "/wishlist", response_class=FileResponse, dependencies=[Depends(verify_auth_page)]
)
def serve_wishlist() -> Any:
    """Serve the wishlist app index.html."""
    index_path = os.path.join(static_dir, "wishlist", "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "Wishlist app not found."}


@app.get("/todo", dependencies=[Depends(verify_auth_page)])
def serve_todo() -> Any:
    """Legacy route kept for backwards compatibility."""
    return RedirectResponse(url="/wishlist", status_code=307)


@app.get(
    "/cookbook", response_class=FileResponse, dependencies=[Depends(verify_auth_page)]
)
def serve_cookbook() -> Any:
    """Serve the cookbook app index.html."""
    index_path = os.path.join(static_dir, "recipes", "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "Recipes app not found."}


@app.get("/", response_class=FileResponse, dependencies=[Depends(verify_auth_page)])
def serve_landing_page() -> Any:
    """Serve the root index.html landing page."""
    index_path = os.path.join(static_dir, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "Landing page not found."}

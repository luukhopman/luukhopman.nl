"""
Main FastAPI server for Wishlist.

Serves the REST API for managing products and hosts the static frontend files.
Includes full type-hinting and soft-deletion capabilities.
"""

import hashlib
import html
import json
import logging
import os
import re
import unicodedata
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
    engine,
    get_session,
    init_db,
)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
    """Manage the application lifespan to ensure the DB connects on startup."""
    init_db()
    with Session(engine) as session:
        cleanup_expired_acquired_products(session)
    yield


# Auth setup
APP_PASSWORD = os.getenv("APP_PASSWORD")
AUTH_MAX_AGE_SECONDS = int(
    os.getenv("AUTH_MAX_AGE_SECONDS", str(10 * 365 * 24 * 60 * 60))
)
AUTH_TOKEN = hashlib.sha256(APP_PASSWORD.encode()).hexdigest() if APP_PASSWORD else None

logger = logging.getLogger(__name__)

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


RECIPE_TEXT_FIELDS = {
    "title",
    "course",
    "description",
    "url",
    "ingredients",
    "instructions",
    "notes",
}

_CHAR_REPLACEMENTS = str.maketrans(
    {
        "\u00a0": " ",
        "\u2018": "'",
        "\u2019": "'",
        "\u201c": '"',
        "\u201d": '"',
        "\u2013": "-",
        "\u2014": "-",
        "\u2026": "...",
        "\u00bc": "1/4",
        "\u00bd": "1/2",
        "\u00be": "3/4",
        "\u215b": "1/8",
        "\u215c": "3/8",
        "\u215d": "5/8",
        "\u215e": "7/8",
    }
)

_CONTROL_CHAR_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_ZERO_WIDTH_RE = re.compile(r"[\u200b\u200c\u200d\ufeff]")
_WHITESPACE_RE = re.compile(r"[^\S\n]+")
_QUANTITY_RE = r"(?:\d+(?:\.\d+)?(?:\s+\d+/\d+)?|\d+/\d+)"
_TEMP_RANGE_RE = re.compile(
    rf"(?i)\b(?P<q1>{_QUANTITY_RE})\s*(?P<sep>-|to)\s*(?P<q2>{_QUANTITY_RE})\s*(?:°\s*)?(?:f|fahrenheit)\b"
)
_TEMP_SINGLE_RE = re.compile(
    rf"(?i)\b(?P<q>{_QUANTITY_RE})\s*(?:°\s*)?(?:f|fahrenheit)\b"
)
_TEMP_DEGREES_RANGE_RE = re.compile(
    rf"(?i)\b(?P<q1>{_QUANTITY_RE})\s*(?P<sep>-|to)\s*(?P<q2>{_QUANTITY_RE})\s*(?:°\s*)?(?:degrees?)\b"
)
_TEMP_DEGREES_SINGLE_RE = re.compile(
    rf"(?i)\b(?P<q>{_QUANTITY_RE})\s*(?:°\s*)?(?:degrees?)\b"
)
_INCH_SYMBOL_RE = re.compile(rf"(?i)\b(?P<q>{_QUANTITY_RE})\s*(?:\"|”|″)")

_US_UNIT_CONVERSIONS: list[tuple[str, str, float]] = [
    (r"(?:cups?|cup)", "ml", 240.0),
    (r"(?:tablespoons?|tbsp|tbs)", "ml", 15.0),
    (r"(?:teaspoons?|tsp)", "ml", 5.0),
    (r"(?:fluid\s*ounces?|fl\.?\s*oz)", "ml", 29.5735),
    (r"(?:pints?|pt)", "ml", 473.176),
    (r"(?:quarts?|qt)", "ml", 946.353),
    (r"(?:gallons?|gal)", "ml", 3785.41),
    (r"(?:pounds?|lbs?|lb)", "g", 453.592),
    (r"(?:ounces?|oz)", "g", 28.3495),
    (r"(?:inches|inch|in\.)", "cm", 2.54),
]


def _mojibake_score(value: str) -> int:
    markers = ("Ã", "Â", "â", "œ", "€", "™", "�")
    return sum(value.count(marker) for marker in markers)


def _fix_mojibake(value: str) -> str:
    if not value:
        return value
    if _mojibake_score(value) == 0:
        return value

    try:
        candidate = value.encode("latin-1").decode("utf-8")
    except (UnicodeDecodeError, UnicodeEncodeError):
        return value

    return candidate if _mojibake_score(candidate) < _mojibake_score(value) else value


def normalize_recipe_text(value: Any) -> str:
    """Normalize recipe text to avoid weird Unicode/control artifacts."""
    if value is None:
        return ""

    text = html.unescape(str(value))
    text = _fix_mojibake(text)
    text = unicodedata.normalize("NFKC", text)
    text = text.translate(_CHAR_REPLACEMENTS)
    text = _ZERO_WIDTH_RE.sub("", text)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = _CONTROL_CHAR_RE.sub("", text)

    lines = []
    for line in text.split("\n"):
        clean_line = _WHITESPACE_RE.sub(" ", line).strip()
        lines.append(clean_line)

    return "\n".join(lines).strip()


def _parse_quantity(value: str) -> float | None:
    token = value.strip()
    if not token:
        return None
    try:
        if " " in token and "/" in token:
            whole, frac = token.split(" ", 1)
            num, den = frac.split("/", 1)
            return float(whole) + (float(num) / float(den))
        if "/" in token:
            num, den = token.split("/", 1)
            return float(num) / float(den)
        return float(token)
    except ValueError:
        return None


def _format_number(value: float) -> str:
    if abs(value - round(value)) < 0.05:
        return str(int(round(value)))
    if value >= 10:
        return f"{value:.1f}".rstrip("0").rstrip(".")
    return f"{value:.2f}".rstrip("0").rstrip(".")


def _format_metric_value(value: float, target_unit: str) -> str:
    number, unit = _format_metric_parts(value, target_unit)
    return f"{number} {unit}"


def _format_metric_parts(value: float, target_unit: str) -> tuple[str, str]:
    if target_unit == "ml" and value >= 1000:
        return _format_number(value / 1000), "L"
    if target_unit == "g" and value >= 1000:
        return _format_number(value / 1000), "kg"
    return _format_number(value), target_unit


def _format_celsius_temp(fahrenheit_value: float) -> str:
    celsius = (fahrenheit_value - 32) * 5 / 9
    # Cooking temperatures are usually expressed in 5 C steps.
    if celsius >= 80:
        rounded = int(round(celsius / 5) * 5)
        return str(rounded)
    return _format_number(celsius)


def convert_us_to_metric(text: str) -> str:
    """Best-effort conversion for common US recipe units and Fahrenheit."""
    converted = text

    def replace_temp_range(match: re.Match[str]) -> str:
        q1 = _parse_quantity(match.group("q1"))
        q2 = _parse_quantity(match.group("q2"))
        sep = match.group("sep")
        if q1 is None or q2 is None:
            return match.group(0)
        c1 = _format_celsius_temp(q1)
        c2 = _format_celsius_temp(q2)
        return f"{c1}-{c2} C" if sep == "-" else f"{c1} to {c2} C"

    def replace_temp_single(match: re.Match[str]) -> str:
        q = _parse_quantity(match.group("q"))
        if q is None:
            return match.group(0)
        return f"{_format_celsius_temp(q)} C"

    def replace_inches_symbol(match: re.Match[str]) -> str:
        q = _parse_quantity(match.group("q"))
        if q is None:
            return match.group(0)
        return _format_metric_value(q * 2.54, "cm")

    converted = _TEMP_RANGE_RE.sub(replace_temp_range, converted)
    converted = _TEMP_SINGLE_RE.sub(replace_temp_single, converted)
    converted = _TEMP_DEGREES_RANGE_RE.sub(replace_temp_range, converted)
    converted = _TEMP_DEGREES_SINGLE_RE.sub(replace_temp_single, converted)
    converted = _INCH_SYMBOL_RE.sub(replace_inches_symbol, converted)

    for unit_pattern, target, factor in _US_UNIT_CONVERSIONS:
        range_re = re.compile(
            rf"(?i)\b(?P<q1>{_QUANTITY_RE})\s*(?P<sep>-|to)\s*(?P<q2>{_QUANTITY_RE})\s*(?P<unit>{unit_pattern})\b"
        )
        single_re = re.compile(
            rf"(?i)\b(?P<q>{_QUANTITY_RE})\s*(?P<unit>{unit_pattern})\b"
        )

        def replace_range(
            match: re.Match[str], *, _factor: float = factor, _target: str = target
        ) -> str:
            q1 = _parse_quantity(match.group("q1"))
            q2 = _parse_quantity(match.group("q2"))
            sep = match.group("sep")
            if q1 is None or q2 is None:
                return match.group(0)
            left_num, left_unit = _format_metric_parts(q1 * _factor, _target)
            right_num, right_unit = _format_metric_parts(q2 * _factor, _target)
            if left_unit == right_unit:
                if sep == "-":
                    return f"{left_num}-{right_num} {left_unit}"
                return f"{left_num} to {right_num} {left_unit}"
            if sep == "-":
                return f"{left_num} {left_unit}-{right_num} {right_unit}"
            return f"{left_num} {left_unit} to {right_num} {right_unit}"

        def replace_single(
            match: re.Match[str], *, _factor: float = factor, _target: str = target
        ) -> str:
            q = _parse_quantity(match.group("q"))
            if q is None:
                return match.group(0)
            return _format_metric_value(q * _factor, _target)

        converted = range_re.sub(replace_range, converted)
        converted = single_re.sub(replace_single, converted)

    return converted


def normalize_recipe_payload(
    payload: dict[str, Any], *, convert_units: bool = True
) -> dict[str, Any]:
    """Normalize all recipe text fields before persistence/response."""
    normalized = dict(payload)
    for key in RECIPE_TEXT_FIELDS:
        if key not in normalized:
            continue
        value = normalized[key]
        if value is None:
            continue
        cleaned = normalize_recipe_text(value)
        if convert_units and key in {
            "ingredients",
            "instructions",
            "description",
            "notes",
        }:
            cleaned = convert_us_to_metric(cleaned)
        normalized[key] = cleaned
    return normalized


def _as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def _is_recipe_type(node_type: Any) -> bool:
    if node_type is None:
        return False
    if isinstance(node_type, list):
        return any(_is_recipe_type(item) for item in node_type)
    return str(node_type).strip().lower() == "recipe"


def _collect_jsonld_nodes(data: Any) -> list[dict[str, Any]]:
    nodes: list[dict[str, Any]] = []

    def walk(value: Any) -> None:
        if isinstance(value, dict):
            nodes.append(value)
            for nested in value.values():
                walk(nested)
        elif isinstance(value, list):
            for item in value:
                walk(item)

    walk(data)
    return nodes


def _extract_ingredients(raw_ingredients: Any) -> list[str]:
    ingredients: list[str] = []
    for item in _as_list(raw_ingredients):
        if isinstance(item, str):
            text = normalize_recipe_text(item)
            if text:
                ingredients.append(text)
        elif isinstance(item, dict):
            # Some sites place ingredient text under "text" or "name".
            candidate = normalize_recipe_text(item.get("text") or item.get("name") or "")
            if candidate:
                ingredients.append(candidate)
    return ingredients


def _extract_instruction_steps(raw: Any) -> list[str]:
    steps: list[str] = []

    def walk(node: Any) -> None:
        if node is None:
            return
        if isinstance(node, str):
            text = normalize_recipe_text(node)
            if text:
                steps.append(text)
            return
        if isinstance(node, list):
            for item in node:
                walk(item)
            return
        if isinstance(node, dict):
            # Handles HowToStep, HowToSection, and similar shapes.
            text_value = node.get("text") or node.get("name")
            if isinstance(text_value, str):
                text = normalize_recipe_text(text_value)
                if text:
                    steps.append(text)
            for key in ("itemListElement", "steps", "recipeInstructions"):
                if key in node:
                    walk(node.get(key))
            return

    walk(raw)
    return steps


def _select_best_recipe_node(nodes: list[dict[str, Any]]) -> dict[str, Any] | None:
    best_node: dict[str, Any] | None = None
    best_score = -1

    for node in nodes:
        if not _is_recipe_type(node.get("@type")):
            continue

        ingredients = _extract_ingredients(
            node.get("recipeIngredient") or node.get("ingredients")
        )
        instructions = _extract_instruction_steps(node.get("recipeInstructions"))
        title = normalize_recipe_text(node.get("name") or "")
        description = normalize_recipe_text(node.get("description") or "")

        score = (
            (4 if instructions else 0)
            + (3 if ingredients else 0)
            + (1 if title else 0)
            + (1 if description else 0)
        )
        if score > best_score:
            best_score = score
            best_node = node

    return best_node


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


class WishlistImportRequest(BaseModel):
    ingredients: list[str]
    store: str | None = None
    recipe_id: int | None = None
    source_url: str | None = None


def cleanup_expired_acquired_products(session: Session) -> int:
    """Mark acquired products older than 7 days as deleted."""
    statement = select(Product).where(
        col(Product.acquired) == True,  # noqa: E712
        col(Product.is_deleted) == False,  # noqa: E712
        col(Product.acquired_at).is_not(None),
    )
    products = session.exec(statement).all()
    now = datetime.now(UTC)
    changed = 0

    for product in products:
        acquired_at = product.acquired_at
        if not acquired_at:
            continue
        try:
            acquired_date = datetime.fromisoformat(acquired_at)
        except ValueError:
            continue
        if now - acquired_date <= timedelta(days=7):
            continue
        product.is_deleted = True
        product.deleted_at = now.isoformat()
        session.add(product)
        changed += 1

    if changed:
        session.commit()
    return changed


@app.post("/api/login")
def login(
    login_req: LoginRequest, request: Request, response: Response
) -> dict[str, str]:
    """Authenticate user and set a cookie."""
    if not APP_PASSWORD:
        return {"message": "No password configured"}
    if login_req.password != APP_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid password")
    assert AUTH_TOKEN is not None
    is_secure = request.url.scheme == "https"
    response.set_cookie(
        key="auth_token",
        value=AUTH_TOKEN,
        max_age=AUTH_MAX_AGE_SECONDS,
        httponly=True,
        samesite="lax",
        secure=is_secure,
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
    return list(session.exec(statement).all())


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
    recipe: RecipeCreate,
    session: Session = Depends(get_session),
    convert_units: bool = True,
) -> dict[str, Any]:
    """Create a new recipe."""
    db_recipe = Recipe.model_validate(
        normalize_recipe_payload(recipe.model_dump(), convert_units=convert_units)
    )
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
    convert_units: bool = True,
) -> dict[str, str]:
    """Update a recipe's details."""
    recipe = session.get(Recipe, recipe_id)
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")

    update_data = normalize_recipe_payload(
        recipe_update.model_dump(exclude_unset=True), convert_units=convert_units
    )
    for key, value in update_data.items():
        setattr(recipe, key, value)

    session.add(recipe)
    session.commit()
    return {"message": "Recipe updated successfully"}


@app.post(
    "/api/cookbook/wishlist/import",
    response_model=dict[str, int],
    dependencies=[Depends(verify_auth)],
)
def import_recipe_ingredients_to_wishlist(
    request: WishlistImportRequest, session: Session = Depends(get_session)
) -> dict[str, int]:
    """Import recipe ingredients into wishlist products with simple deduping."""

    def clean_ingredient(value: str) -> str:
        text = normalize_recipe_text(value)
        # Remove common list prefixes like bullets, checkboxes and numbering.
        text = re.sub(r"^\s*(?:[-*•]\s*|\[\s*[xX ]?\s*\]\s*|\d+[.)-]\s*)", "", text)
        return text.strip()

    store = normalize_recipe_text(request.store or "")
    source_url = normalize_recipe_text(request.source_url or "") or None
    wishlist_url = (
        f"/cookbook?recipe={request.recipe_id}" if request.recipe_id else "/cookbook"
    )
    product_url = wishlist_url or source_url

    existing_products = session.exec(select(Product)).all()
    existing_keys = {
        (
            normalize_recipe_text(product.name).lower(),
            normalize_recipe_text(product.store or "").lower(),
        )
        for product in existing_products
        if not product.is_deleted
    }

    added = 0
    skipped = 0

    for raw in request.ingredients:
        name = clean_ingredient(raw)
        if not name:
            skipped += 1
            continue

        key = (name.lower(), store.lower())
        if key in existing_keys:
            skipped += 1
            continue

        session.add(Product(name=name, store=store or None, url=product_url))
        existing_keys.add(key)
        added += 1

    if added:
        session.commit()

    return {"added": added, "skipped": skipped}


@app.get("/api/cookbook/parse", dependencies=[Depends(verify_auth)])
async def parse_recipe(url: str, convert_units: bool = True) -> dict[str, Any]:
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
        "url": normalize_recipe_text(url),
        "ingredients": "",
        "instructions": "",
        "parse_error": "",
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
        async with httpx.AsyncClient(
            headers=browser_headers, follow_redirects=True, timeout=15.0
        ) as client:
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
            proxy_url = f"https://r.jina.ai/{url}"
            async with httpx.AsyncClient(timeout=20.0) as client:
                proxy_resp = await client.get(proxy_url)
                if proxy_resp.status_code < 400:
                    html = proxy_resp.text
                else:
                    last_error = f"Proxy HTTP {proxy_resp.status_code}"
        except httpx.HTTPError as err:
            last_error = str(err)

    if not html:
        # Graceful fallback instead of hard failing the UI flow.
        return normalize_recipe_payload(
            {
                "title": normalize_recipe_text(fallback_title(url)),
                "description": "",
                "url": normalize_recipe_text(url),
                "ingredients": "",
                "instructions": "",
                "parse_error": normalize_recipe_text(
                    f"Could not auto-parse this page ({last_error or 'unknown error'})."
                ),
            },
            convert_units=convert_units,
        )

    try:
        soup = BeautifulSoup(html, "html.parser")

        # 1. Try JSON-LD (Schema.org)
        scripts = soup.find_all("script", type="application/ld+json")
        recipe_nodes: list[dict[str, Any]] = []
        for script in scripts:
            try:
                script_text = script.string or script.get_text(strip=True)
                if not script_text:
                    continue
                data = json.loads(script_text)
                recipe_nodes.extend(_collect_jsonld_nodes(data))
            except (json.JSONDecodeError, TypeError) as err:
                logger.debug("Skipping invalid JSON-LD block: %s", err)
                continue

        best_recipe_node = _select_best_recipe_node(recipe_nodes)
        if best_recipe_node:
            if not result["title"]:
                result["title"] = best_recipe_node.get("name")
            if not result["description"]:
                result["description"] = best_recipe_node.get("description")

            ingredients = _extract_ingredients(
                best_recipe_node.get("recipeIngredient")
                or best_recipe_node.get("ingredients")
            )
            if ingredients and not result["ingredients"]:
                result["ingredients"] = "\n".join([f"- {item}" for item in ingredients])

            steps = _extract_instruction_steps(best_recipe_node.get("recipeInstructions"))
            if steps and not result["instructions"]:
                result["instructions"] = "\n".join(
                    [f"{idx + 1}. {step}" for idx, step in enumerate(steps)]
                )

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
            if not result["description"]:
                name_desc = soup.find("meta", attrs={"name": "description"})
                if name_desc:
                    result["description"] = name_desc.get("content", "")

        # 3. Fallback HTML selectors for ingredients/instructions if JSON-LD is missing.
        if not result["ingredients"]:
            ingredient_nodes = soup.select(
                '[itemprop="recipeIngredient"], .recipe-ingredients li, .ingredients li'
            )
            raw_ingredients = [
                normalize_recipe_text(node.get_text(" ", strip=True))
                for node in ingredient_nodes
            ]
            clean_ingredients = [item for item in raw_ingredients if item]
            if clean_ingredients:
                result["ingredients"] = "\n".join(
                    [f"- {item}" for item in clean_ingredients]
                )

        if not result["instructions"]:
            instruction_nodes = soup.select(
                '[itemprop="recipeInstructions"] li, .recipe-instructions li, .instructions li'
            )
            steps = [
                normalize_recipe_text(node.get_text(" ", strip=True))
                for node in instruction_nodes
            ]
            clean_steps = [step for step in steps if step]
            if clean_steps:
                result["instructions"] = "\n".join(
                    [f"{idx + 1}. {step}" for idx, step in enumerate(clean_steps)]
                )

        # Final cleanup
        for key in ["title", "description", "ingredients", "instructions"]:
            if result[key]:
                result[key] = normalize_recipe_text(result[key])
            else:
                result[key] = ""

        if not result["title"]:
            result["title"] = normalize_recipe_text(fallback_title(url))

        if not result["ingredients"] and not result["instructions"]:
            result["parse_error"] = "No structured recipe fields found on this page."

        return normalize_recipe_payload(result, convert_units=convert_units)
    except Exception as err:
        logger.exception("Recipe parsing failed for url=%s", url)
        return normalize_recipe_payload(
            {
                "title": normalize_recipe_text(fallback_title(url)),
                "description": "",
                "url": normalize_recipe_text(url),
                "ingredients": "",
                "instructions": "",
                "parse_error": normalize_recipe_text(
                    f"Could not fully parse this page ({str(err)})."
                ),
            },
            convert_units=convert_units,
        )


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

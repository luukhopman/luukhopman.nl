import os
import re
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlmodel import Session, col, select

from app.auth import verify_auth, verify_auth_page
from app.config import GEMINI_API_KEY, STATIC_DIR
from app.database import get_session
from app.features.cookbook.models import Recipe, RecipeCreate, RecipeUpdate
from app.features.cookbook.parsing import parse_recipe_url
from app.features.cookbook.schemas import WishlistImportRequest
from app.features.cookbook.text import normalize_recipe_payload, normalize_recipe_text
from app.features.wishlist.models import Product

router = APIRouter()


@router.get(
    "/cookbook", response_class=FileResponse, dependencies=[Depends(verify_auth_page)]
)
def serve_cookbook() -> Any:
    index_path = os.path.join(STATIC_DIR, "recipes", "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "Recipes app not found."}


@router.get(
    "/api/cookbook", response_model=list[Recipe], dependencies=[Depends(verify_auth)]
)
def get_recipes(session: Session = Depends(get_session)) -> list[Recipe]:
    statement = select(Recipe).order_by(col(Recipe.created_at).desc())
    return list(session.exec(statement).all())


@router.get("/api/cookbook/parser", dependencies=[Depends(verify_auth)])
def get_cookbook_parser() -> dict[str, bool]:
    return {"gemini_enabled": bool(GEMINI_API_KEY)}


@router.post(
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
    db_recipe = Recipe.model_validate(
        normalize_recipe_payload(recipe.model_dump(), convert_units=convert_units)
    )
    session.add(db_recipe)
    session.commit()
    return {"id": db_recipe.id, "message": "Recipe added successfully"}


@router.delete(
    "/api/cookbook/{recipe_id}",
    response_model=dict[str, str],
    dependencies=[Depends(verify_auth)],
)
def delete_recipe(
    recipe_id: int, session: Session = Depends(get_session)
) -> dict[str, str]:
    recipe = session.get(Recipe, recipe_id)
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    session.delete(recipe)
    session.commit()
    return {"message": "Recipe deleted successfully"}


@router.patch(
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


@router.post(
    "/api/cookbook/wishlist/import",
    response_model=dict[str, int],
    dependencies=[Depends(verify_auth)],
)
def import_recipe_ingredients_to_wishlist(
    request: WishlistImportRequest, session: Session = Depends(get_session)
) -> dict[str, int]:
    def clean_ingredient(value: str) -> str:
        text = normalize_recipe_text(value)
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


@router.get("/api/cookbook/parse", dependencies=[Depends(verify_auth)])
async def parse_recipe(url: str, convert_units: bool = True) -> dict[str, Any]:
    return await parse_recipe_url(url, convert_units=convert_units)

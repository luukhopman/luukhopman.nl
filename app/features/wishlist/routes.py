import os
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlmodel import Session, col, select

from app.auth import verify_auth, verify_auth_page
from app.config import STATIC_DIR
from app.database import get_session
from app.features.wishlist.models import (
    Product,
    ProductCreate,
    ProductStoreRename,
    ProductUpdate,
)
from app.services.realtime import RESOURCE_WISHLIST, bump_resource_version

router = APIRouter()


def normalize_store_name(value: str | None) -> str | None:
    """Normalize store values so blank strings are treated as no store."""
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


@router.get(
    "/wishlist", response_class=FileResponse, dependencies=[Depends(verify_auth_page)]
)
def serve_wishlist() -> Any:
    index_path = os.path.join(STATIC_DIR, "wishlist", "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "Wishlist app not found."}


@router.get(
    "/api/wishlist/products",
    response_model=list[Product],
    dependencies=[Depends(verify_auth)],
)
@router.get(
    "/api/todo/products",
    response_model=list[Product],
    dependencies=[Depends(verify_auth)],
)
def get_products(session: Session = Depends(get_session)) -> list[Product]:
    statement = select(Product).order_by(col(Product.created_at).desc())
    return list(session.exec(statement).all())


@router.post(
    "/api/wishlist/products",
    response_model=dict[str, Any],
    status_code=201,
    dependencies=[Depends(verify_auth)],
)
@router.post(
    "/api/todo/products",
    response_model=dict[str, Any],
    status_code=201,
    dependencies=[Depends(verify_auth)],
)
def create_product(
    product: ProductCreate, session: Session = Depends(get_session)
) -> dict[str, Any]:
    db_product = Product.model_validate(product)
    session.add(db_product)
    bump_resource_version(session, RESOURCE_WISHLIST)
    session.commit()
    return {"id": db_product.id, "message": "Product added successfully"}


@router.patch(
    "/api/wishlist/products/rename-store",
    response_model=dict[str, Any],
    dependencies=[Depends(verify_auth)],
)
def rename_store(
    payload: ProductStoreRename, session: Session = Depends(get_session)
) -> dict[str, Any]:
    old_store = normalize_store_name(payload.old_store)
    new_store = normalize_store_name(payload.new_store)

    if old_store == new_store:
        return {"message": "Store name unchanged", "updated": 0}

    products = list(session.exec(select(Product)).all())
    matched_products = [
        product
        for product in products
        if normalize_store_name(product.store) == old_store
    ]

    if not matched_products:
        raise HTTPException(status_code=404, detail="Store not found")

    for product in matched_products:
        product.store = new_store
        session.add(product)

    bump_resource_version(session, RESOURCE_WISHLIST)
    session.commit()
    return {
        "message": "Store renamed successfully",
        "updated": len(matched_products),
    }


@router.delete(
    "/api/wishlist/products/{product_id}",
    response_model=dict[str, str],
    dependencies=[Depends(verify_auth)],
)
@router.delete(
    "/api/todo/products/{product_id}",
    response_model=dict[str, str],
    dependencies=[Depends(verify_auth)],
)
def delete_product(
    product_id: int, session: Session = Depends(get_session), hard: bool = False
) -> dict[str, str]:
    product = session.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if hard:
        session.delete(product)
        bump_resource_version(session, RESOURCE_WISHLIST)
        session.commit()
        return {"message": "Product permanently deleted"}
    product.is_deleted = True
    product.deleted_at = datetime.now(UTC).isoformat()
    session.add(product)
    bump_resource_version(session, RESOURCE_WISHLIST)
    session.commit()
    return {"message": "Product soft-deleted successfully"}


@router.patch(
    "/api/wishlist/products/{product_id}",
    response_model=dict[str, str],
    dependencies=[Depends(verify_auth)],
)
@router.patch(
    "/api/todo/products/{product_id}",
    response_model=dict[str, str],
    dependencies=[Depends(verify_auth)],
)
def update_product_status(
    product_id: int,
    product_update: ProductUpdate,
    session: Session = Depends(get_session),
) -> dict[str, str]:
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
    if product_update.store is not None:
        product.store = normalize_store_name(product_update.store)
    if product_update.url is not None:
        product.url = product_update.url if product_update.url != "" else None

    session.add(product)
    bump_resource_version(session, RESOURCE_WISHLIST)
    session.commit()
    return {"message": "Product status updated"}

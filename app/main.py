"""
Main FastAPI server for Wishlist.

Serves the REST API for managing products and hosts the static frontend files.
Includes full type-hinting and soft-deletion capabilities.
"""

import os
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import Depends, FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session, col, select

from app.database import Product, ProductCreate, ProductUpdate, get_session, init_db


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Manage the application lifespan to ensure the DB connects on startup."""
    init_db()
    yield


app = FastAPI(title="Wishlist", lifespan=lifespan)


@app.get("/api/products", response_model=list[Product])
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
    now = datetime.now(timezone.utc)
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


@app.post("/api/products", response_model=dict[str, Any], status_code=201)
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
    session.refresh(db_product)
    return {"id": db_product.id, "message": "Product added successfully"}


@app.delete("/api/products/{product_id}", response_model=dict[str, str])
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
        product.deleted_at = datetime.now(timezone.utc).isoformat()
        session.add(product)
        session.commit()
        return {"message": "Product soft-deleted successfully"}


@app.patch("/api/products/{product_id}", response_model=dict[str, str])
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
            product.acquired_at = datetime.now(timezone.utc).isoformat()
        elif not product_update.acquired and product.acquired:
            product.acquired_at = None
        product.acquired = product_update.acquired

    if product_update.is_deleted is not None:
        if product_update.is_deleted and not product.is_deleted:
            product.deleted_at = datetime.now(timezone.utc).isoformat()
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


# Mount static files
static_dir = os.path.join(os.path.dirname(__file__), "static")
if not os.path.exists(static_dir):
    os.makedirs(static_dir)

app.mount("/static", StaticFiles(directory=static_dir), name="static")


@app.get("/", response_class=FileResponse)
def serve_frontend() -> Any:
    """Serve the root index.html logic layout for the frontend."""
    index_path = os.path.join(static_dir, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "Frontend not found. Please create static/index.html"}

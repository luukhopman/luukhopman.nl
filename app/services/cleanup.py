from datetime import UTC, datetime, timedelta

from sqlmodel import Session, col, select

from app.features.wishlist.models import Product


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

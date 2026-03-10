"""Shared helpers for lightweight cross-client realtime sync."""

from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlmodel import Session

from app.database import engine

RESOURCE_TODOS = "todos"
RESOURCE_WISHLIST = "wishlist"
VALID_REALTIME_RESOURCES = frozenset({RESOURCE_TODOS, RESOURCE_WISHLIST})


def _is_missing_resource_versions_table(error: DBAPIError) -> bool:
    statement = getattr(error, "statement", "") or ""
    message = str(getattr(error, "orig", error)).lower()
    code = getattr(getattr(error, "orig", None), "pgcode", None)
    return (
        code == "42P01"
        or "resource_versions" in statement.lower()
        or "resource_versions" in message
    )


def bump_resource_version(session: Session, resource: str) -> None:
    """Advance the version counter for a resource inside the current transaction."""
    connection = session.connection()
    try:
        connection.execute(
            text(
                """
                INSERT INTO resource_versions (resource, version)
                VALUES (:resource, 1)
                ON CONFLICT (resource)
                DO UPDATE SET
                    version = resource_versions.version + 1,
                    updated_at = NOW()
                """
            ),
            {"resource": resource},
        )
    except DBAPIError as error:
        if _is_missing_resource_versions_table(error):
            return
        raise


def get_resource_version(resource: str) -> int:
    """Read the latest committed version for a shared resource."""
    try:
        with engine.connect() as connection:
            result = connection.execute(
                text(
                    """
                    SELECT version
                    FROM resource_versions
                    WHERE resource = :resource
                    """
                ),
                {"resource": resource},
            ).scalar_one_or_none()
    except DBAPIError as error:
        if _is_missing_resource_versions_table(error):
            return 0
        raise

    if result is None:
        return 0
    return int(result)

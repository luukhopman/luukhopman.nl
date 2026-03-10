from pydantic import BaseModel


class WishlistImportRequest(BaseModel):
    ingredients: list[str]
    store: str | None = None
    recipe_id: int | None = None
    source_url: str | None = None

from datetime import UTC, datetime

from sqlmodel import Field, SQLModel


class RecipeBase(SQLModel):
    """Base SQLModel class for Recipe shared properties."""

    title: str | None = Field(default=None, description="The name of the recipe")
    course: str | None = Field(
        default=None, description="Optional course label (e.g. Breakfast, Dinner)"
    )
    url: str | None = Field(default=None, description="Optional URL to the recipe")
    ingredients: str | None = Field(
        default=None, description="Ingredients list (markdown or plain text)"
    )
    instructions: str | None = Field(
        default=None, description="Cooking instructions (markdown or plain text)"
    )
    notes: str | None = Field(default=None, description="Personal notes or tips")


class Recipe(RecipeBase, table=True):
    """Main Recipe model."""

    __tablename__ = "recipes"

    id: int | None = Field(default=None, primary_key=True)
    created_at: str = Field(default_factory=lambda: datetime.now(UTC).isoformat())


class RecipeCreate(RecipeBase):
    """Schema for creating a new recipe."""

    pass


class RecipeUpdate(SQLModel):
    """Schema for updating a recipe."""

    title: str | None = None
    course: str | None = None
    url: str | None = None
    ingredients: str | None = None
    instructions: str | None = None
    notes: str | None = None

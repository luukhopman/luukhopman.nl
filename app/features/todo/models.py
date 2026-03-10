from datetime import UTC, datetime

from sqlmodel import Field, SQLModel


class TodoBase(SQLModel):
    """Base SQLModel class for Todo shared properties."""

    title: str = Field(description="The task title")
    due_date: str | None = Field(
        default=None, description="Optional due date in ISO YYYY-MM-DD format"
    )


class Todo(TodoBase, table=True):
    """Main Todo model."""

    __tablename__ = "todos"

    id: int | None = Field(default=None, primary_key=True)
    completed: bool = Field(default=False, description="Whether the task is completed")
    completed_at: str | None = Field(
        default=None, description="ISO timestamp of when the task was completed"
    )
    created_at: str = Field(
        default_factory=lambda: datetime.now(UTC).isoformat(),
        description="ISO timestamp of when the record was created",
    )


class TodoCreate(TodoBase):
    """Schema for creating a todo via the API."""

    pass


class TodoUpdate(SQLModel):
    """Schema for updating an existing todo."""

    title: str | None = None
    due_date: str | None = None
    completed: bool | None = None

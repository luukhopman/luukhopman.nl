import os
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlmodel import Session, col, select

from app.auth import verify_auth, verify_auth_page
from app.config import STATIC_DIR
from app.database import get_session
from app.features.todo.models import Todo, TodoCreate, TodoUpdate

router = APIRouter()


@router.get(
    "/todo", response_class=FileResponse, dependencies=[Depends(verify_auth_page)]
)
def serve_todo() -> Any:
    index_path = os.path.join(STATIC_DIR, "todo", "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "Todo app not found."}


@router.get(
    "/api/todos",
    response_model=list[Todo],
    dependencies=[Depends(verify_auth)],
)
def get_todos(session: Session = Depends(get_session)) -> list[Todo]:
    statement = select(Todo).order_by(col(Todo.created_at).desc())
    return list(session.exec(statement).all())


@router.post(
    "/api/todos",
    response_model=dict[str, Any],
    status_code=201,
    dependencies=[Depends(verify_auth)],
)
def create_todo(
    todo: TodoCreate, session: Session = Depends(get_session)
) -> dict[str, Any]:
    db_todo = Todo.model_validate(todo)
    session.add(db_todo)
    session.commit()
    return {"id": db_todo.id, "message": "Todo added successfully"}


@router.patch(
    "/api/todos/{todo_id}",
    response_model=dict[str, str],
    dependencies=[Depends(verify_auth)],
)
def update_todo(
    todo_id: int,
    todo_update: TodoUpdate,
    session: Session = Depends(get_session),
) -> dict[str, str]:
    todo = session.get(Todo, todo_id)
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")

    if todo_update.title is not None:
        todo.title = todo_update.title
    if todo_update.due_date is not None:
        todo.due_date = todo_update.due_date or None
    if todo_update.completed is not None:
        if todo_update.completed and not todo.completed:
            todo.completed_at = datetime.now(UTC).isoformat()
        elif not todo_update.completed and todo.completed:
            todo.completed_at = None
        todo.completed = todo_update.completed

    session.add(todo)
    session.commit()
    return {"message": "Todo updated successfully"}


@router.delete(
    "/api/todos/{todo_id}",
    response_model=dict[str, str],
    dependencies=[Depends(verify_auth)],
)
def delete_todo(
    todo_id: int, session: Session = Depends(get_session)
) -> dict[str, str]:
    todo = session.get(Todo, todo_id)
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    session.delete(todo)
    session.commit()
    return {"message": "Todo deleted successfully"}

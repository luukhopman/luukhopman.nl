import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from app.auth import verify_auth
from app.services.realtime import VALID_REALTIME_RESOURCES, get_resource_version

router = APIRouter()


def _format_sse(event: str, data: dict[str, int]) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


@router.get("/api/realtime/{resource}", dependencies=[Depends(verify_auth)])
async def realtime_events(resource: str, request: Request) -> StreamingResponse:
    if resource not in VALID_REALTIME_RESOURCES:
        raise HTTPException(status_code=404, detail="Realtime resource not found")

    async def stream():
        version = await asyncio.to_thread(get_resource_version, resource)
        heartbeat_ticks = 0
        yield _format_sse("ready", {"version": version})

        while not await request.is_disconnected():
            await asyncio.sleep(1)
            current_version = await asyncio.to_thread(get_resource_version, resource)
            if current_version != version:
                version = current_version
                heartbeat_ticks = 0
                yield _format_sse("changed", {"version": version})
                continue

            heartbeat_ticks += 1
            if heartbeat_ticks >= 15:
                heartbeat_ticks = 0
                yield ": keepalive\n\n"

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )

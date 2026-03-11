import { NextResponse, type NextRequest } from "next/server";

import { requireApiAuth } from "@/lib/server/auth";
import {
  VALID_REALTIME_RESOURCES,
  getResourceVersion,
} from "@/lib/server/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function formatSse(event: string, data: Record<string, number>) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
) {
  const unauthorized = requireApiAuth(request);
  if (unauthorized) return unauthorized;

  const rawResource = (await context.params).resource;
  if (typeof rawResource !== "string") {
    return NextResponse.json(
      { detail: "Realtime resource not found" },
      { status: 404 },
    );
  }
  const resource = rawResource;
  if (!VALID_REALTIME_RESOURCES.has(resource)) {
    return NextResponse.json(
      { detail: "Realtime resource not found" },
      { status: 404 },
    );
  }

  const encoder = new TextEncoder();
  let interval: NodeJS.Timeout | undefined;

  const stream = new ReadableStream({
    async start(controller) {
      let version = await getResourceVersion(resource);
      let heartbeatTicks = 0;

      controller.enqueue(encoder.encode(formatSse("ready", { version })));

      interval = setInterval(async () => {
        if (request.signal.aborted) {
          clearInterval(interval);
          controller.close();
          return;
        }

        const currentVersion = await getResourceVersion(resource);
        if (currentVersion !== version) {
          version = currentVersion;
          heartbeatTicks = 0;
          controller.enqueue(encoder.encode(formatSse("changed", { version })));
          return;
        }

        heartbeatTicks += 1;
        if (heartbeatTicks >= 15) {
          heartbeatTicks = 0;
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        }
      }, 1000);
    },
    cancel() {
      if (interval) {
        clearInterval(interval);
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

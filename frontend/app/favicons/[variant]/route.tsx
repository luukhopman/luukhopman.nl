import { getFaviconVariant, getPngFaviconPath } from "@/lib/favicons";

const DEFAULT_SIZE = 64;
const MAX_SIZE = 512;
const STATIC_ICON_SIZES = [32, 180, 192, 512] as const;

function getIconSize(request: Request): number {
  const requested = Number(new URL(request.url).searchParams.get("size"));

  if (!Number.isFinite(requested)) {
    return DEFAULT_SIZE;
  }

  const rounded = Math.round(requested);

  if (rounded < 16) {
    return 16;
  }

  if (rounded > MAX_SIZE) {
    return MAX_SIZE;
  }

  return rounded;
}

function getClosestStaticSize(size: number): (typeof STATIC_ICON_SIZES)[number] {
  return STATIC_ICON_SIZES.reduce((closest, candidate) =>
    Math.abs(candidate - size) < Math.abs(closest - size) ? candidate : closest,
  );
}

function getRouteParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

export async function GET(
  request: Request,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
) {
  const params = await context.params;
  const size = getIconSize(request);
  const variant = getFaviconVariant(getRouteParam(params.variant));
  const staticSize = getClosestStaticSize(size);

  return new Response(null, {
    status: 307,
    headers: { location: getPngFaviconPath(variant, staticSize) },
  });
}

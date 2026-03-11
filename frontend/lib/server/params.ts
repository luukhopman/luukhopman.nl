import { NextResponse } from "next/server";

export function parsePositiveIntegerParam(value: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

export function invalidParamResponse(paramName: string) {
  return NextResponse.json(
    { detail: `Invalid ${paramName}` },
    { status: 400 },
  );
}

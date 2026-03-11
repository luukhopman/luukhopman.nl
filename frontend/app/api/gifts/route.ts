import { NextResponse, type NextRequest } from "next/server";

import { requireApiAuth } from "@/lib/server/auth";
import {
  getGiftAuthenticatedUsername,
  requireGiftApiAuth,
} from "@/lib/server/gifts-auth";
import { query, queryOne } from "@/lib/server/db";
import type { GiftIdea } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const unauthorized = requireApiAuth(request) ?? requireGiftApiAuth(request);
  if (unauthorized) return unauthorized;

  const username = getGiftAuthenticatedUsername(request);
  const rows = await query<GiftIdea>(
    `
      SELECT id, recipient_name, title, url, notes, purchased, created_at
      FROM gift_ideas
      WHERE owner_username = $1
      ORDER BY recipient_name ASC, created_at DESC
    `,
    [username],
  );

  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const unauthorized = requireApiAuth(request) ?? requireGiftApiAuth(request);
  if (unauthorized) return unauthorized;

  const username = getGiftAuthenticatedUsername(request);
  const body = (await request.json()) as {
    recipient_name?: string;
    title?: string;
    url?: string | null;
    notes?: string | null;
  };

  const recipientName = body.recipient_name?.trim();
  const title = body.title?.trim();

  if (!recipientName) {
    return NextResponse.json({ detail: "Recipient name is required" }, { status: 400 });
  }

  if (!title) {
    return NextResponse.json({ detail: "Gift idea is required" }, { status: 400 });
  }

  const row = await queryOne<{ id: number }>(
    `
      INSERT INTO gift_ideas (owner_username, recipient_name, title, url, notes, purchased, created_at)
      VALUES ($1, $2, $3, $4, $5, FALSE, $6)
      RETURNING id
    `,
    [
      username,
      recipientName,
      title,
      body.url?.trim() || null,
      body.notes?.trim() || null,
      new Date().toISOString(),
    ],
  );

  return NextResponse.json(
    { id: row?.id, message: "Gift idea added successfully" },
    { status: 201 },
  );
}

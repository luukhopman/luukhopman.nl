import { query, queryOne } from "./db";

export const FEEDBACK_STATUSES = ["open", "in_progress", "done"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export type FeedbackItem = {
  id: number;
  pagePath: string;
  message: string;
  status: FeedbackStatus;
  createdAt: string;
  updatedAt: string;
};

type FeedbackRow = {
  id: number | string;
  page_path: string;
  message: string;
  status: FeedbackStatus;
  created_at: string;
  updated_at: string;
};

function mapFeedbackRow(row: FeedbackRow): FeedbackItem {
  return {
    id: Number(row.id),
    pagePath: row.page_path,
    message: row.message,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function normalizeFeedbackPath(value: unknown) {
  const path = String(value ?? "").trim();
  if (!path || !path.startsWith("/") || path.startsWith("//") || path.length > 500) {
    return null;
  }
  return path;
}

export function normalizeFeedbackMessage(value: unknown) {
  const message = String(value ?? "").trim();
  if (!message || message.length > 2000) return null;
  return message;
}

export function parseFeedbackStatus(value: unknown): FeedbackStatus | null {
  const status = String(value ?? "").trim();
  return FEEDBACK_STATUSES.includes(status as FeedbackStatus)
    ? (status as FeedbackStatus)
    : null;
}

export async function createFeedbackItem(pagePath: string, message: string) {
  const row = await queryOne<FeedbackRow>(
    `
      INSERT INTO feedback_items (page_path, message)
      VALUES ($1, $2)
      RETURNING id, page_path, message, status, created_at, updated_at
    `,
    [pagePath, message],
  );

  if (!row) throw new Error("Feedback item was not created.");
  return mapFeedbackRow(row);
}

export async function getFeedbackItems(status?: FeedbackStatus) {
  const rows = await query<FeedbackRow>(
    `
      SELECT id, page_path, message, status, created_at, updated_at
      FROM feedback_items
      WHERE ($1::TEXT IS NULL OR status = $1)
      ORDER BY
        CASE status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
        created_at DESC,
        id DESC
    `,
    [status ?? null],
  );
  return rows.map(mapFeedbackRow);
}

export async function updateFeedbackStatus(id: number, status: FeedbackStatus) {
  const row = await queryOne<FeedbackRow>(
    `
      UPDATE feedback_items
      SET status = $2, updated_at = NOW()
      WHERE id = $1
      RETURNING id, page_path, message, status, created_at, updated_at
    `,
    [id, status],
  );
  return row ? mapFeedbackRow(row) : null;
}

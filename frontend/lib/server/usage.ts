import crypto from "node:crypto";

import { query } from "./db";
import { AUTH_TOKEN } from "./config";

const MAX_PAGE_PATH_LENGTH = 180;
const RECIPE_PATH = /^\/recipes\/[^/]+(?:\/.*)?$/;

export type UsagePageSummary = {
  pagePath: string;
  views: number;
  uniqueVisitors: number;
  lastSeenAt: string;
};

export type UsageReport = {
  days: number;
  totalViews: number;
  uniqueVisitors: number;
  pages: UsagePageSummary[];
};

export function normalizeUsagePath(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const path = value.split(/[?#]/, 1)[0] ?? "";
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.length === 0 ||
    path.length > MAX_PAGE_PATH_LENGTH ||
    path === "/admin" ||
    path.startsWith("/api/") ||
    path.startsWith("/_next/")
  ) {
    return null;
  }

  if (RECIPE_PATH.test(path)) {
    return "/recipes/[shareToken]";
  }

  return path;
}

export function getClientAddress(request: Request): string | null {
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim();
  if (forwardedFor) return forwardedFor;

  const cloudflareIp = request.headers.get("cf-connecting-ip")?.trim();
  return cloudflareIp || null;
}

export function hashClientAddress(address: string, salt = AUTH_TOKEN): string | null {
  if (!salt) return null;

  return crypto
    .createHmac("sha256", salt)
    .update(address)
    .digest("hex");
}

export async function recordPageView(pagePath: string, clientAddress: string) {
  const visitorHash = hashClientAddress(clientAddress);
  if (!visitorHash) return false;

  await query(
    `
      INSERT INTO page_usage_daily (page_path, visitor_hash)
      VALUES ($1, $2)
      ON CONFLICT (usage_date, page_path, visitor_hash)
      DO UPDATE SET
        view_count = page_usage_daily.view_count + 1,
        last_seen_at = NOW()
    `,
    [pagePath, visitorHash],
  );

  return true;
}

export async function getUsageReport(days = 30): Promise<UsageReport> {
  const safeDays = Math.min(Math.max(Math.round(days), 1), 365);
  const [pageRows, totalRows] = await Promise.all([
    query<{
      page_path: string;
      views: number | string;
      unique_visitors: number | string;
      last_seen_at: string;
    }>(
      `
        SELECT
          page_path,
          SUM(view_count)::BIGINT AS views,
          COUNT(DISTINCT visitor_hash)::BIGINT AS unique_visitors,
          MAX(last_seen_at) AS last_seen_at
        FROM page_usage_daily
        WHERE usage_date >= CURRENT_DATE - $1::INTEGER + 1
        GROUP BY page_path
        ORDER BY views DESC, page_path ASC
      `,
      [safeDays],
    ),
    query<{
      total_views: number | string;
      unique_visitors: number | string;
    }>(
      `
        SELECT
          COALESCE(SUM(view_count), 0)::BIGINT AS total_views,
          COUNT(DISTINCT visitor_hash)::BIGINT AS unique_visitors
        FROM page_usage_daily
        WHERE usage_date >= CURRENT_DATE - $1::INTEGER + 1
      `,
      [safeDays],
    ),
  ]);

  const totals = totalRows[0];
  return {
    days: safeDays,
    totalViews: Number(totals?.total_views ?? 0),
    uniqueVisitors: Number(totals?.unique_visitors ?? 0),
    pages: pageRows.map((row) => ({
      pagePath: row.page_path,
      views: Number(row.views),
      uniqueVisitors: Number(row.unique_visitors),
      lastSeenAt: row.last_seen_at,
    })),
  };
}

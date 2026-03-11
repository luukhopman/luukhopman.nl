import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
    return NextResponse.json({
        status: "ok",
        time: new Date().toISOString(),
        env: {
            hasDbUrl: !!process.env.DATABASE_URL,
            hasAppPassword: !!process.env.APP_PASSWORD,
        },
    });
}

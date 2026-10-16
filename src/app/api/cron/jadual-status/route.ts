import { NextResponse } from "next/server";
import { jadualLog } from "@/lib/scheduler";

// Status jadual dalaman: bila setiap job last jalan & ok tak.
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!process.env.CRON_SECRET || url.searchParams.get("secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }
  const g = globalThis as { __aazfloJadual?: boolean };
  return NextResponse.json({ ok: true, aktif: !!g.__aazfloJadual, jobs: jadualLog() });
}

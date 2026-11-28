import { NextResponse } from "next/server";
import { getFakes, upsertFakes, type FakeListing } from "@/lib/fake-hunter";

export const dynamic = "force-dynamic";

// 🕵️ FAKE HUNTER API — GET senarai (ringkasan) / POST tambah listing dari imbasan luar (skrip Claude).
// GET  /api/cron/fake-hunter?secret=XXX
// POST /api/cron/fake-hunter?secret=XXX  body: { items: [{ url, platform?, shop?, shopId?, title?, price?, sold?, location?, risk?, reason? }] }
function ok(req: Request) {
  const s = new URL(req.url).searchParams.get("secret");
  return !!process.env.CRON_SECRET && s === process.env.CRON_SECRET;
}

export async function GET(req: Request) {
  if (!ok(req)) return NextResponse.json({ ok: false }, { status: 401 });
  const list = await getFakes();
  const by = (k: FakeListing["status"]) => list.filter((l) => l.status === k).length;
  return NextResponse.json({
    ok: true,
    total: list.length,
    disyaki: by("disyaki"),
    dah_adu: by("dah_adu"),
    dibuang: by("dibuang"),
    abaikan: by("abaikan"),
  });
}

export async function POST(req: Request) {
  if (!ok(req)) return NextResponse.json({ ok: false }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { items?: Partial<FakeListing>[] } | null;
  const items = (body?.items ?? []).filter((i) => typeof i?.url === "string" && /^https?:\/\//.test(i.url));
  if (!items.length) return NextResponse.json({ ok: false, error: "tiada items sah" }, { status: 400 });
  const r = await upsertFakes(items.slice(0, 500));
  return NextResponse.json({ ok: true, ...r });
}

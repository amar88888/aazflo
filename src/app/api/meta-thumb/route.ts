import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Proxy thumbnail kreatif Meta (fbcdn) — elak masalah hotlink/cross-origin
// di mobile. SSRF-safe: hanya benarkan host *.fbcdn.net.
export async function GET(req: Request) {
  const u = new URL(req.url).searchParams.get("url");
  if (!u) return new NextResponse("Missing url", { status: 400 });

  let target: URL;
  try {
    target = new URL(u);
  } catch {
    return new NextResponse("Bad url", { status: 400 });
  }
  // Hanya fbcdn (Facebook CDN) — elak proxy jadi relay sewenang-wenangnya.
  if (target.protocol !== "https:" || !/\.fbcdn\.net$/.test(target.hostname)) {
    return new NextResponse("Forbidden host", { status: 403 });
  }

  try {
    const res = await fetch(target.toString(), { cache: "no-store" });
    if (!res.ok) return new NextResponse("Upstream error", { status: 502 });
    const buf = await res.arrayBuffer();
    return new NextResponse(buf, {
      headers: {
        "content-type": res.headers.get("content-type") || "image/jpeg",
        "cache-control": "private, max-age=600", // cache 10 min dalam browser
      },
    });
  } catch {
    return new NextResponse("Fetch failed", { status: 502 });
  }
}

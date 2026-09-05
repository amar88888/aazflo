import { NextRequest, NextResponse } from "next/server";
import { exchangeToken } from "@/lib/integrations/tiktok";
import { saveCredentials } from "@/lib/credentials";

// TikTok redirect balik ke sini dengan ?code=<auth_code> selepas seller authorize.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code") ?? req.nextUrl.searchParams.get("auth_code");
  const settingsUrl = new URL("/settings", req.nextUrl.origin);

  if (!code) {
    settingsUrl.searchParams.set("tiktok", "error");
    return NextResponse.redirect(settingsUrl);
  }

  try {
    const creds = await exchangeToken(code);
    await saveCredentials("tiktok", creds);
    settingsUrl.searchParams.set("tiktok", "connected");
  } catch {
    settingsUrl.searchParams.set("tiktok", "error");
  }
  return NextResponse.redirect(settingsUrl);
}

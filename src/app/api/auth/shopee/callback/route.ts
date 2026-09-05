import { NextRequest, NextResponse } from "next/server";
import { exchangeToken } from "@/lib/integrations/shopee";
import { saveCredentials } from "@/lib/credentials";

// Shopee redirect balik ke sini dengan ?code=<code>&shop_id=<id> selepas seller authorize.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const shopId = req.nextUrl.searchParams.get("shop_id");
  const settingsUrl = new URL("/settings", req.nextUrl.origin);

  if (!code || !shopId) {
    settingsUrl.searchParams.set("shopee", "error");
    return NextResponse.redirect(settingsUrl);
  }

  try {
    const creds = await exchangeToken(code, shopId);
    await saveCredentials("shopee", creds);
    settingsUrl.searchParams.set("shopee", "connected");
  } catch {
    settingsUrl.searchParams.set("shopee", "error");
  }
  return NextResponse.redirect(settingsUrl);
}

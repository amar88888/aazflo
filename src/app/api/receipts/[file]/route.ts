import { NextRequest, NextResponse } from "next/server";
import { readReceipt } from "@/lib/receipt";

// Hidang PDF resit (hanya untuk user yang login — dilindungi oleh middleware auth).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const buf = await readReceipt(file);
  if (!buf) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${file}"`,
    },
  });
}

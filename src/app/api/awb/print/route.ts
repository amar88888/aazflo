import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateAwbPdf } from "@/lib/awb";
import { PLATFORMS, type Platform } from "@/lib/constants";

// Bulk print AWB — SATU platform sahaja setiap fail. Ditolak kalau order bercampur platform.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const platform = body.platform as string;
  const scope = body.scope as string | undefined;
  const orderIds = body.orderIds as string[] | undefined;

  if (!PLATFORMS.includes(platform as Platform)) {
    return NextResponse.json({ error: "Platform tidak sah." }, { status: 400 });
  }

  const orders =
    scope === "pending"
      ? await db.order.findMany({ where: { platform, status: "pending" }, include: { items: true } })
      : Array.isArray(orderIds) && orderIds.length > 0
        ? await db.order.findMany({ where: { id: { in: orderIds } }, include: { items: true } })
        : [];

  if (orders.length === 0) {
    return NextResponse.json({ error: "Tiada order untuk diprint." }, { status: 400 });
  }

  // Guard keras: semua order MESTI platform yang sama — elak AWB bercampur.
  const mixed = orders.some((o) => o.platform !== platform);
  if (mixed) {
    return NextResponse.json(
      { error: "Order bercampur platform tidak dibenarkan dalam satu fail AWB." },
      { status: 400 }
    );
  }

  const pdf = await generateAwbPdf(
    orders.map((o) => ({
      platform: o.platform,
      platformOrderId: o.platformOrderId,
      buyerName: o.buyerName,
      courier: o.courier,
      trackingNo: o.trackingNo,
      items: o.items.map((it) => ({ name: it.name, quantity: it.quantity })),
    })),
    platform
  );

  // Tanda printed + rekod batch
  const batch = await db.awbBatch.create({ data: { platform, orderCount: orders.length } });
  await db.order.updateMany({
    where: { id: { in: orders.map((o) => o.id) } },
    data: { status: "printed", awbPrintedAt: new Date(), awbBatchId: batch.id },
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="AWB-${platform}-${orders.length}.pdf"`,
    },
  });
}

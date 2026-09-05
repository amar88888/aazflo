import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { PLATFORM_LABELS, type Platform } from "@/lib/constants";

export type AwbOrderData = {
  platform: string;
  platformOrderId: string;
  buyerName: string | null;
  courier: string | null;
  trackingNo: string | null;
  items: { name: string; quantity: number }[];
};

// Helvetica hanya sokong WinAnsi — buang aksara luar julat supaya tak crash.
function clean(text: string): string {
  return (text ?? "").replace(/[^\x20-\x7E]/g, "?");
}

// Jana PDF AWB (A6) — satu label per order. SEMUA order mesti platform yang sama.
// NOTA: ini label placeholder. Bila API platform lulus, ganti dengan AWB sebenar
// (Shopee download_shipping_document / TikTok Get Package Shipping Document) dan merge.
export async function generateAwbPdf(orders: AwbOrderData[], platform: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const label = PLATFORM_LABELS[platform as Platform] ?? platform;

  for (const o of orders) {
    const page = pdf.addPage([298, 420]);
    const { width, height } = page.getSize();

    // Header band platform (elak salah platform)
    page.drawRectangle({ x: 0, y: height - 44, width, height: 44, color: rgb(0.31, 0.27, 0.9) });
    page.drawText(clean(label.toUpperCase()), { x: 18, y: height - 30, size: 16, font: bold, color: rgb(1, 1, 1) });

    let y = height - 66;
    const line = (text: string, size = 10, f = font) => {
      page.drawText(clean(text), { x: 18, y, size, font: f, color: rgb(0.1, 0.1, 0.1) });
      y -= size + 6;
    };

    line(`Order: ${o.platformOrderId}`, 12, bold);
    line(`Penerima: ${o.buyerName ?? "-"}`);
    line(`Courier: ${o.courier ?? "-"}`);
    line(`Tracking: ${o.trackingNo ?? "-"}`);

    // Kotak "barcode" placeholder
    y -= 6;
    page.drawRectangle({ x: 18, y: y - 34, width: width - 36, height: 36, borderColor: rgb(0, 0, 0), borderWidth: 1 });
    page.drawText(clean(o.trackingNo ?? o.platformOrderId), { x: 24, y: y - 22, size: 11, font: bold });
    y -= 52;

    line("Item:", 10, bold);
    for (const it of o.items) {
      if (y < 46) break;
      line(`- ${it.name} x${it.quantity}`, 9);
    }

    page.drawText(clean("AWB placeholder — label sebenar auto bila API platform lulus"), {
      x: 18,
      y: 18,
      size: 7,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });
  }

  return pdf.save();
}

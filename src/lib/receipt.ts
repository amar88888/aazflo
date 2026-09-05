import { PDFDocument } from "pdf-lib";
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";

// Resit disimpan sebagai PDF dalam data/receipts (di luar public, dihidang via API route).
const DIR = path.join(process.cwd(), "data", "receipts");

// Tukar imej resit (JPG/PNG) atau PDF → simpan sebagai PDF. Pulang nama fail.
export async function saveReceiptAsPdf(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = (file.type || "").toLowerCase();
  await fs.mkdir(DIR, { recursive: true });
  const name = `${randomUUID()}.pdf`;

  if (mime === "application/pdf") {
    await fs.writeFile(path.join(DIR, name), bytes);
    return name;
  }

  const pdf = await PDFDocument.create();
  let img;
  if (mime.includes("png")) img = await pdf.embedPng(bytes);
  else if (mime.includes("jpg") || mime.includes("jpeg")) img = await pdf.embedJpg(bytes);
  else throw new Error("Format resit tidak disokong — guna JPG, PNG atau PDF.");

  const maxW = 595;
  const maxH = 842;
  const scale = Math.min(maxW / img.width, maxH / img.height, 1);
  const page = pdf.addPage([img.width * scale, img.height * scale]);
  page.drawImage(img, { x: 0, y: 0, width: img.width * scale, height: img.height * scale });

  await fs.writeFile(path.join(DIR, name), await pdf.save());
  return name;
}

export async function readReceipt(name: string): Promise<Buffer | null> {
  if (!/^[\w-]+\.pdf$/.test(name)) return null;
  try {
    return await fs.readFile(path.join(DIR, name));
  } catch {
    return null;
  }
}

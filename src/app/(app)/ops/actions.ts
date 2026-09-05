"use server";

import { db } from "@/lib/db";
import { saveReceiptAsPdf } from "@/lib/receipt";
import { revalidatePath } from "next/cache";

export async function addAttendanceAction(formData: FormData) {
  const dateRaw = String(formData.get("date") ?? "");
  const partTimers = parseInt(String(formData.get("partTimers") ?? "0"), 10);
  if (!dateRaw || isNaN(partTimers)) return;
  await db.attendance.create({
    data: {
      date: new Date(dateRaw),
      partTimers: Math.max(0, partTimers),
      names: String(formData.get("names") ?? "").trim() || null,
      wageTotal: parseFloat(String(formData.get("wageTotal") ?? "0")) || 0,
      notes: String(formData.get("notes") ?? "").trim() || null,
    },
  });
  revalidatePath("/ops");
}

export async function addSupplyAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  await db.supply.create({
    data: {
      name,
      unit: String(formData.get("unit") ?? "unit").trim() || "unit",
      currentStock: Math.max(0, parseInt(String(formData.get("currentStock") ?? "0"), 10) || 0),
      reorderLevel: Math.max(0, parseInt(String(formData.get("reorderLevel") ?? "0"), 10) || 0),
    },
  });
  revalidatePath("/ops");
}

export async function adjustStockAction(id: string, delta: number) {
  const supply = await db.supply.findUnique({ where: { id } });
  if (!supply) return;
  await db.supply.update({
    where: { id },
    data: { currentStock: Math.max(0, supply.currentStock + delta) },
  });
  revalidatePath("/ops");
}

export async function setStockAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const value = parseInt(String(formData.get("value") ?? ""), 10);
  if (!id || isNaN(value)) return;
  await db.supply.update({ where: { id }, data: { currentStock: Math.max(0, value) } });
  revalidatePath("/ops");
}

export async function deleteSupplyAction(id: string) {
  await db.supply.delete({ where: { id } });
  revalidatePath("/ops");
}

export async function addCashTxnAction(formData: FormData) {
  const type = String(formData.get("type") ?? "");
  const category = String(formData.get("category") ?? "");
  const amount = parseFloat(String(formData.get("amount") ?? ""));
  const dateRaw = String(formData.get("date") ?? "");
  if (!type || !category || isNaN(amount) || amount <= 0 || !dateRaw) return;

  let receiptPath: string | null = null;
  const file = formData.get("receipt");
  if (file instanceof File && file.size > 0) {
    try {
      receiptPath = await saveReceiptAsPdf(file);
    } catch {
      receiptPath = null;
    }
  }

  await db.cashTxn.create({
    data: {
      date: new Date(dateRaw),
      type,
      category,
      amount,
      description: String(formData.get("description") ?? "").trim() || null,
      receiptPath,
    },
  });
  revalidatePath("/ops");
}

export async function deleteCashTxnAction(id: string) {
  await db.cashTxn.delete({ where: { id } });
  revalidatePath("/ops");
}

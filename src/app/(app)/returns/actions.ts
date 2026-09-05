"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { RETURN_STATUSES } from "@/lib/constants";

// Kemaskini status return + sebab + jumlah refund untuk satu order.
export async function updateReturnAction(formData: FormData) {
  const orderId = String(formData.get("orderId") ?? "");
  const returnStatus = String(formData.get("returnStatus") ?? "none");
  const reason = String(formData.get("returnReason") ?? "").trim();
  const refundRaw = String(formData.get("refundAmount") ?? "").trim();
  const refundAmount = refundRaw === "" ? 0 : parseFloat(refundRaw);

  if (!orderId || !RETURN_STATUSES.includes(returnStatus as (typeof RETURN_STATUSES)[number])) return;

  await db.order.update({
    where: { id: orderId },
    data: {
      returnStatus,
      returnReason: reason || null,
      refundAmount: isNaN(refundAmount) ? 0 : refundAmount,
      // Bila barang dah dipulang/refund, tandakan penghantaran = returned
      deliveryStatus: returnStatus === "returned" || returnStatus === "refunded" ? "returned" : undefined,
    },
  });

  revalidatePath("/returns");
  revalidatePath("/dashboard");
}

// Tandakan order sebagai BATAL.
export async function markCancelAction(formData: FormData) {
  const orderId = String(formData.get("orderId") ?? "");
  if (!orderId) return;
  await db.order.update({ where: { id: orderId }, data: { status: "cancelled" } });
  revalidatePath("/returns");
  revalidatePath("/dashboard");
}

// Batalkan tanda return (kembali ke normal).
export async function clearReturnAction(formData: FormData) {
  const orderId = String(formData.get("orderId") ?? "");
  if (!orderId) return;
  await db.order.update({
    where: { id: orderId },
    data: { returnStatus: "none", returnReason: null, refundAmount: 0 },
  });
  revalidatePath("/returns");
  revalidatePath("/dashboard");
}

// Rekod return manual guna nombor order (untuk staff — customer pulangkan barang).
export async function recordReturnByOrderNoAction(formData: FormData): Promise<{ ok: boolean; message: string }> {
  const orderNo = String(formData.get("orderNo") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const refundRaw = String(formData.get("refund") ?? "").trim();
  const refundAmount = refundRaw === "" ? 0 : parseFloat(refundRaw);
  if (!orderNo) return { ok: false, message: "Masukkan nombor order." };

  const order = await db.order.findFirst({ where: { platformOrderId: orderNo } });
  if (!order) return { ok: false, message: `Order "${orderNo}" tak dijumpai.` };

  await db.order.update({
    where: { id: order.id },
    data: {
      returnStatus: "requested",
      returnReason: reason || null,
      refundAmount: isNaN(refundAmount) ? 0 : refundAmount,
    },
  });
  revalidatePath("/returns");
  revalidatePath("/dashboard");
  return { ok: true, message: `Return direkod untuk order ${orderNo}.` };
}

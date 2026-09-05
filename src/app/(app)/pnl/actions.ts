"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { EXPENSE_TYPES } from "@/lib/constants";

const expenseSchema = z.object({
  type: z.enum(EXPENSE_TYPES),
  label: z.string().min(1),
  amount: z.coerce.number().positive(),
  platform: z.string().optional(),
  date: z.coerce.date(),
  recurring: z.coerce.boolean().default(false),
});

export async function addExpenseAction(formData: FormData) {
  const parsed = expenseSchema.safeParse({
    type: formData.get("type"),
    label: formData.get("label"),
    amount: formData.get("amount"),
    platform: formData.get("platform") || undefined,
    date: formData.get("date"),
    recurring: formData.get("recurring") === "on",
  });

  // Borang ada `required` di client; input tak sah cuma diabaikan
  if (!parsed.success) return;

  await db.expense.create({
    data: {
      ...parsed.data,
      platform: parsed.data.platform || null,
    },
  });

  revalidatePath("/pnl");
}

export async function deleteExpenseAction(id: string) {
  await db.expense.delete({ where: { id } });
  revalidatePath("/pnl");
}

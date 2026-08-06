import { z } from "zod";

const idSchema = z.string().trim().min(1).max(80);
const safeRupiahSchema = z
  .number()
  .int("Nominal harus berupa rupiah utuh.")
  .min(0, "Nominal tidak boleh negatif.")
  .max(Number.MAX_SAFE_INTEGER, "Nominal terlalu besar.");

export const receiptItemSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1, "Nama item wajib diisi.").max(120),
  quantity: z.number().int().min(1).max(999),
  unitPrice: safeRupiahSchema,
  lineTotal: safeRupiahSchema.min(1, "Total item harus lebih dari nol."),
});

export const participantSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1, "Nama anggota wajib diisi.").max(40),
});

export const itemAssignmentSchema = z.object({
  itemId: idSchema,
  participantIds: z.array(idSchema).min(1, "Setiap item harus memiliki pemilik."),
  weights: z.record(idSchema, z.number().int().min(1).max(1_000_000)).optional(),
});

export const receiptChargesSchema = z.object({
  statedSubtotal: safeRupiahSchema,
  tax: safeRupiahSchema,
  serviceCharge: safeRupiahSchema,
  discount: safeRupiahSchema,
  rounding: z
    .number()
    .int("Pembulatan harus berupa rupiah utuh.")
    .min(-Number.MAX_SAFE_INTEGER)
    .max(Number.MAX_SAFE_INTEGER),
  receiptTotal: safeRupiahSchema,
});

export const splitInputSchema = z
  .object({
    items: z.array(receiptItemSchema).min(1, "Tambahkan setidaknya satu item."),
    participants: z
      .array(participantSchema)
      .min(2, "Tambahkan setidaknya dua anggota."),
    assignments: z.array(itemAssignmentSchema),
    charges: receiptChargesSchema,
  })
  .superRefine((input, context) => {
    const itemIds = new Set<string>();
    for (const item of input.items) {
      if (itemIds.has(item.id)) {
        context.addIssue({
          code: "custom",
          path: ["items"],
          message: "ID item harus unik.",
        });
      }
      itemIds.add(item.id);
    }

    const participantIds = new Set<string>();
    const participantNames = new Set<string>();
    for (const participant of input.participants) {
      const normalizedName = participant.name.trim().toLocaleLowerCase("id-ID");
      if (participantIds.has(participant.id)) {
        context.addIssue({
          code: "custom",
          path: ["participants"],
          message: "ID anggota harus unik.",
        });
      }
      if (participantNames.has(normalizedName)) {
        context.addIssue({
          code: "custom",
          path: ["participants"],
          message: "Nama anggota tidak boleh sama.",
        });
      }
      participantIds.add(participant.id);
      participantNames.add(normalizedName);
    }

    const assignmentItemIds = new Set<string>();
    for (const assignment of input.assignments) {
      if (!itemIds.has(assignment.itemId)) {
        context.addIssue({
          code: "custom",
          path: ["assignments"],
          message: "Penugasan merujuk ke item yang tidak dikenal.",
        });
      }
      if (assignmentItemIds.has(assignment.itemId)) {
        context.addIssue({
          code: "custom",
          path: ["assignments"],
          message: "Satu item hanya boleh memiliki satu penugasan.",
        });
      }
      assignmentItemIds.add(assignment.itemId);

      const owners = new Set<string>();
      for (const participantId of assignment.participantIds) {
        if (!participantIds.has(participantId)) {
          context.addIssue({
            code: "custom",
            path: ["assignments"],
            message: "Penugasan merujuk ke anggota yang tidak dikenal.",
          });
        }
        if (owners.has(participantId)) {
          context.addIssue({
            code: "custom",
            path: ["assignments"],
            message: "Pemilik item tidak boleh duplikat.",
          });
        }
        owners.add(participantId);
      }

      if (assignment.weights) {
        const weightIds = Object.keys(assignment.weights);
        if (
          weightIds.length !== owners.size ||
          weightIds.some((participantId) => !owners.has(participantId))
        ) {
          context.addIssue({
            code: "custom",
            path: ["assignments"],
            message: "Bobot harus tersedia tepat untuk setiap pemilik item.",
          });
        }
      }
    }

    for (const itemId of itemIds) {
      if (!assignmentItemIds.has(itemId)) {
        context.addIssue({
          code: "custom",
          path: ["assignments"],
          message: "Semua item harus dibagikan sebelum menghitung.",
        });
      }
    }
  });

export type ValidatedSplitInput = z.infer<typeof splitInputSchema>;

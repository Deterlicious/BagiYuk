import { z } from "zod";

const confidenceSchema = z.number().min(0).max(1);
const editableMoneySchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

export const editableReceiptSchema = z.object({
  merchantName: z.string().max(120),
  merchantConfidence: confidenceSchema,
  items: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().max(120),
      quantity: z.number().int().min(1).max(999),
      unitPrice: editableMoneySchema,
      lineTotal: editableMoneySchema,
      confidence: z.object({
        name: confidenceSchema,
        quantity: confidenceSchema,
        unitPrice: confidenceSchema,
        lineTotal: confidenceSchema,
      }),
    }),
  ),
  charges: z.object({
    statedSubtotal: editableMoneySchema,
    tax: editableMoneySchema,
    serviceCharge: editableMoneySchema,
    discount: editableMoneySchema,
    rounding: z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
    receiptTotal: editableMoneySchema,
  }),
  chargeConfidence: z.object({
    statedSubtotal: confidenceSchema,
    tax: confidenceSchema,
    serviceCharge: confidenceSchema,
    discount: confidenceSchema,
    rounding: confidenceSchema,
    receiptTotal: confidenceSchema,
  }),
  source: z.enum(["manual", "sample", "ai"]),
});

const nullableStringField = z.object({
  value: z.string().trim().min(1).max(120).nullable(),
  confidence: confidenceSchema,
});

const nullableMoneyField = z.object({
  value: editableMoneySchema.nullable(),
  confidence: confidenceSchema,
});

const nullableSignedMoneyField = z.object({
  value: z
    .number()
    .int()
    .min(-Number.MAX_SAFE_INTEGER)
    .max(Number.MAX_SAFE_INTEGER)
    .nullable(),
  confidence: confidenceSchema,
});

const nullableQuantityField = z.object({
  value: z.number().int().min(1).max(999).nullable(),
  confidence: confidenceSchema,
});

export const aiReceiptOutputSchema = z.object({
  merchantName: nullableStringField,
  items: z
    .array(
      z.object({
        name: nullableStringField,
        quantity: nullableQuantityField,
        unitPrice: nullableMoneyField,
        lineTotal: nullableMoneyField,
      }),
    )
    .min(1)
    .max(100),
  summary: z.object({
    subtotal: nullableMoneyField,
    tax: nullableMoneyField,
    serviceCharge: nullableMoneyField,
    discount: nullableMoneyField,
    rounding: nullableSignedMoneyField,
    total: nullableMoneyField,
  }),
});

export type AiReceiptOutput = z.infer<typeof aiReceiptOutputSchema>;

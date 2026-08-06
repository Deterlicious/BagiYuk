import type { EditableReceipt } from "./types";
import { aiReceiptOutputSchema, type AiReceiptOutput } from "./schemas";

export function normalizeAiReceipt(value: AiReceiptOutput | unknown): EditableReceipt {
  const receipt = aiReceiptOutputSchema.parse(value);

  return {
    merchantName: receipt.merchantName.value ?? "Nama tempat belum terbaca",
    merchantConfidence: receipt.merchantName.confidence,
    source: "ai",
    items: receipt.items.map((item, index) => {
      const quantity = item.quantity.value ?? 1;
      const unitPrice = item.unitPrice.value ?? 0;
      return {
        id: `scan-item-${index + 1}`,
        name: item.name.value ?? "Item belum terbaca",
        quantity,
        unitPrice,
        lineTotal: item.lineTotal.value ?? quantity * unitPrice,
        confidence: {
          name: item.name.confidence,
          quantity: item.quantity.confidence,
          unitPrice: item.unitPrice.confidence,
          lineTotal: item.lineTotal.confidence,
        },
      };
    }),
    charges: {
      statedSubtotal: receipt.summary.subtotal.value ?? 0,
      tax: receipt.summary.tax.value ?? 0,
      serviceCharge: receipt.summary.serviceCharge.value ?? 0,
      discount: receipt.summary.discount.value ?? 0,
      rounding: receipt.summary.rounding.value ?? 0,
      receiptTotal: receipt.summary.total.value ?? 0,
    },
    chargeConfidence: {
      statedSubtotal: receipt.summary.subtotal.confidence,
      tax: receipt.summary.tax.confidence,
      serviceCharge: receipt.summary.serviceCharge.confidence,
      discount: receipt.summary.discount.confidence,
      rounding: receipt.summary.rounding.confidence,
      receiptTotal: receipt.summary.total.confidence,
    },
  };
}

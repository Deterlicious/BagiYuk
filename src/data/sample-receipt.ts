import type { EditableReceipt } from "@/domain/receipt/types";

export const sampleReceipt: EditableReceipt = {
  merchantName: "Warung Sedap Sore",
  merchantConfidence: 1,
  source: "sample",
  items: [
    {
      id: "sample-item-1",
      name: "Nasi Goreng Kampung",
      quantity: 1,
      unitPrice: 28_000,
      lineTotal: 28_000,
      confidence: { name: 1, quantity: 1, unitPrice: 1, lineTotal: 1 },
    },
    {
      id: "sample-item-2",
      name: "Ayam Bakar Madu",
      quantity: 1,
      unitPrice: 36_000,
      lineTotal: 36_000,
      confidence: { name: 1, quantity: 1, unitPrice: 1, lineTotal: 1 },
    },
    {
      id: "sample-item-3",
      name: "Es Teh Manis",
      quantity: 2,
      unitPrice: 8_000,
      lineTotal: 16_000,
      confidence: { name: 1, quantity: 1, unitPrice: 1, lineTotal: 1 },
    },
    {
      id: "sample-item-4",
      name: "Tahu Crispy",
      quantity: 1,
      unitPrice: 21_000,
      lineTotal: 21_000,
      confidence: { name: 1, quantity: 1, unitPrice: 1, lineTotal: 1 },
    },
  ],
  charges: {
    statedSubtotal: 101_000,
    tax: 10_100,
    serviceCharge: 5_050,
    discount: 5_000,
    rounding: -150,
    receiptTotal: 111_000,
  },
  chargeConfidence: {
    statedSubtotal: 1,
    tax: 1,
    serviceCharge: 1,
    discount: 1,
    rounding: 1,
    receiptTotal: 1,
  },
};

import type { ReceiptCharges, ReceiptItem } from "@/domain/billing/types";

export type ReceiptItemConfidence = {
  name: number;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type ReceiptChargeConfidence = {
  statedSubtotal: number;
  tax: number;
  serviceCharge: number;
  discount: number;
  rounding: number;
  receiptTotal: number;
};

export type EditableReceiptItem = ReceiptItem & {
  confidence: ReceiptItemConfidence;
};

export type EditableReceipt = {
  merchantName: string;
  merchantConfidence: number;
  items: EditableReceiptItem[];
  charges: ReceiptCharges;
  chargeConfidence: ReceiptChargeConfidence;
  source: "manual" | "sample" | "ai";
};

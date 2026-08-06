import type { AiReceiptOutput } from "@/domain/receipt/schemas";
import type { ReceiptImage, ReceiptParserProvider } from "./provider";

export class MockReceiptParserProvider implements ReceiptParserProvider {
  readonly name = "mock" as const;

  async parse(image: ReceiptImage): Promise<AiReceiptOutput> {
    void image;
    return {
      merchantName: { value: "Warung Sedap Sore", confidence: 0.94 },
      items: [
        {
          name: { value: "Nasi Goreng Kampung", confidence: 0.96 },
          quantity: { value: 1, confidence: 0.98 },
          unitPrice: { value: 28_000, confidence: 0.92 },
          lineTotal: { value: 28_000, confidence: 0.93 },
        },
        {
          name: { value: "Ayam Bakar Madu", confidence: 0.82 },
          quantity: { value: 1, confidence: 0.96 },
          unitPrice: { value: 36_000, confidence: 0.71 },
          lineTotal: { value: 36_000, confidence: 0.69 },
        },
        {
          name: { value: "Es Teh Manis", confidence: 0.93 },
          quantity: { value: 2, confidence: 0.88 },
          unitPrice: { value: 8_000, confidence: 0.9 },
          lineTotal: { value: 16_000, confidence: 0.9 },
        },
        {
          name: { value: "Tahu Crispy", confidence: 0.65 },
          quantity: { value: 1, confidence: 0.92 },
          unitPrice: { value: 21_000, confidence: 0.78 },
          lineTotal: { value: 21_000, confidence: 0.78 },
        },
      ],
      summary: {
        subtotal: { value: 101_000, confidence: 0.91 },
        tax: { value: 10_100, confidence: 0.86 },
        serviceCharge: { value: 5_050, confidence: 0.72 },
        discount: { value: 5_000, confidence: 0.83 },
        rounding: { value: -150, confidence: 0.7 },
        total: { value: 111_000, confidence: 0.95 },
      },
    };
  }
}

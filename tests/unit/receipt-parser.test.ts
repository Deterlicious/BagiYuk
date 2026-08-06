import { describe, expect, it } from "vitest";
import { normalizeAiReceipt } from "@/domain/receipt/normalize";
import { MockReceiptParserProvider } from "@/features/receipt-parser/mock-provider";
import { getImageDimensions } from "@/lib/image";

describe("receipt parser boundary", () => {
  it("normalizes deterministic mock output into editable integer rupiah", async () => {
    const raw = await new MockReceiptParserProvider().parse({
      mimeType: "image/png",
      base64: "ignored-by-mock",
    });
    const receipt = normalizeAiReceipt(raw);

    expect(receipt.source).toBe("ai");
    expect(receipt.items).toHaveLength(4);
    expect(receipt.items.every((item) => Number.isSafeInteger(item.lineTotal))).toBe(true);
    expect(receipt.items.some((item) => item.confidence.name < 0.75)).toBe(true);
    expect(receipt.charges.receiptTotal).toBe(111_000);
  });

  it("preserves uncertainty instead of inventing unreadable values", () => {
    const receipt = normalizeAiReceipt({
      merchantName: { value: null, confidence: 0.1 },
      items: [
        {
          name: { value: null, confidence: 0.2 },
          quantity: { value: null, confidence: 0.2 },
          unitPrice: { value: null, confidence: 0.2 },
          lineTotal: { value: null, confidence: 0.2 },
        },
      ],
      summary: {
        subtotal: { value: null, confidence: 0 },
        tax: { value: null, confidence: 0 },
        serviceCharge: { value: null, confidence: 0 },
        discount: { value: null, confidence: 0 },
        rounding: { value: null, confidence: 0 },
        total: { value: null, confidence: 0 },
      },
    });

    expect(receipt.merchantName).toMatch(/belum terbaca/i);
    expect(receipt.items[0]).toMatchObject({ quantity: 1, unitPrice: 0, lineTotal: 0 });
    expect(receipt.chargeConfidence.receiptTotal).toBe(0);
  });

  it("reads and validates PNG dimensions from the file header", () => {
    const bytes = new Uint8Array(24);
    bytes.set([0x89, 0x50, 0x4e, 0x47], 0);
    const view = new DataView(bytes.buffer);
    view.setUint32(16, 1080);
    view.setUint32(20, 1920);
    expect(getImageDimensions(bytes, "image/png")).toEqual({ width: 1080, height: 1920 });
  });
});

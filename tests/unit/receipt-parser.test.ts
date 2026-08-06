import { describe, expect, it, vi } from "vitest";
import { normalizeAiReceipt } from "@/domain/receipt/normalize";
import { CloudflareReceiptParserProvider } from "@/features/receipt-parser/cloudflare-provider";
import { MockReceiptParserProvider } from "@/features/receipt-parser/mock-provider";
import { findReceiptBounds } from "@/lib/image-client";
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

  it("accepts structured document-model output and derives arithmetic confidence", async () => {
    const run = vi.fn().mockResolvedValue({
      response: {
        merchantName: "Sushi Ippachi",
        items: [
          { name: "CHIRASHI SPECIAL SUSHI", quantity: 1, unitPrice: 580_000, lineTotal: 580_000 },
          { name: "OCHA REFILL", quantity: 1, unitPrice: 10_000, lineTotal: 10_000 },
        ],
        summary: {
          subtotal: 590_000,
          tax: 63_130,
          serviceCharge: 41_300,
          discount: 0,
          rounding: null,
          total: 694_500,
        },
      },
    });
    const parsed = await new CloudflareReceiptParserProvider({ run }).parse({
      mimeType: "image/jpeg",
      base64: "receipt",
    });

    expect(parsed.items).toHaveLength(2);
    expect(parsed.summary.rounding.value).toBe(70);
    expect(parsed.summary.total).toEqual({ value: 694_500, confidence: 0.96 });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("falls back to Moondream and safely normalizes formatted rupiah strings", async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({ response: "not json" })
      .mockResolvedValueOnce({
        answer: JSON.stringify({
          merchantName: "Checking",
          items: [{ name: "6 BUAH SUNKIST", quantity: "6", unitPrice: "33.000", lineTotal: "198,000" }],
          summary: {
            subtotal: "198.000",
            tax: "19.800",
            serviceCharge: 0,
            discount: 0,
            rounding: 0,
            total: "217.800",
          },
        }),
      });
    const parsed = await new CloudflareReceiptParserProvider({ run }).parse({
      mimeType: "image/jpeg",
      base64: "receipt",
    });

    expect(parsed.items[0]!.lineTotal.value).toBe(198_000);
    expect(parsed.summary.total.value).toBe(217_800);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("tries the faster OCR model first for a tall receipt", async () => {
    const run = vi.fn().mockResolvedValue({
      answer: JSON.stringify({
        merchantName: "Checking",
        items: [{ name: "NASI PUTIH", quantity: 40, unitPrice: 13_000, lineTotal: 520_000 }],
        summary: {
          subtotal: 520_000,
          tax: 52_000,
          serviceCharge: 0,
          discount: 0,
          rounding: 0,
          total: 572_000,
        },
      }),
    });
    await new CloudflareReceiptParserProvider({ run }).parse({
      mimeType: "image/jpeg",
      base64: "receipt",
      width: 900,
      height: 2_800,
    });

    expect(run.mock.calls[0]?.[0]).toBe("@cf/moondream/moondream3.1-9B-A2B");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("finds a bright receipt region against a dark background", () => {
    const width = 100;
    const height = 140;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        const paper = x >= 28 && x < 72 && y >= 5 && y < 135;
        pixels[offset] = paper ? 235 : 45;
        pixels[offset + 1] = paper ? 232 : 35;
        pixels[offset + 2] = paper ? 220 : 25;
        pixels[offset + 3] = 255;
      }
    }

    const bounds = findReceiptBounds(pixels, width, height);
    expect(bounds).not.toBeNull();
    expect(bounds?.x).toBeLessThanOrEqual(28);
    expect(bounds?.width).toBeGreaterThanOrEqual(44);
  });
});

import { describe, expect, it, vi } from "vitest";
import { normalizeAiReceipt } from "@/domain/receipt/normalize";
import { CloudflareReceiptParserProvider } from "@/features/receipt-parser/cloudflare-provider";
import { MockReceiptParserProvider } from "@/features/receipt-parser/mock-provider";
import {
  groupOcrLinesIntoRows,
  receiptFromOcrLines,
  type OcrLine,
} from "@/features/receipt-parser/paddle-receipt-parser";
import { scanErrorMessage, validateReceiptFile } from "@/features/receipt-parser/receipt-scan";
import { findReceiptBounds } from "@/lib/image-client";
import { getImageDimensions } from "@/lib/image";

describe("receipt parser boundary", () => {
  const ocrLine = (
    text: string,
    top: number,
    left = 20,
    right = 800,
    score = 0.96,
  ): OcrLine => ({
    text,
    score,
    poly: [
      { x: left, y: top },
      { x: right, y: top },
      { x: right, y: top + 24 },
      { x: left, y: top + 24 },
    ],
  });

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

  it("groups split OCR fragments and parses the simple sushi receipt exactly", () => {
    const lines = [
      ocrLine("SUSHI IPPACHI RESTAURANT", 10),
      ocrLine("1", 70, 20, 45),
      ocrLine("CHIRASHI SPECIAL SUSHI", 70, 70, 520),
      ocrLine("580,000", 70, 650, 800),
      ocrLine("1 OCHA REFILL 10,000", 110),
      ocrLine("Subtotal 590,000", 180),
      ocrLine("Service charge 41,300", 220),
      ocrLine("Tax1 63,130", 260),
      ocrLine("Tota1", 300, 20, 180),
      ocrLine("694,500", 326, 650, 800),
    ];

    expect(groupOcrLinesIntoRows(lines)[1]?.text).toBe("1 CHIRASHI SPECIAL SUSHI 580,000");
    const receipt = receiptFromOcrLines(lines);

    expect(receipt.source).toBe("ocr");
    expect(receipt.merchantName).toBe("SUSHI IPPACHI RESTAURANT");
    expect(receipt.items).toMatchObject([
      { name: "CHIRASHI SPECIAL SUSHI", quantity: 1, unitPrice: 580_000, lineTotal: 580_000 },
      { name: "OCHA REFILL", quantity: 1, unitPrice: 10_000, lineTotal: 10_000 },
    ]);
    expect(receipt.charges).toEqual({
      statedSubtotal: 590_000,
      tax: 63_130,
      serviceCharge: 41_300,
      discount: 0,
      rounding: 70,
      receiptTotal: 694_500,
    });
  });

  it("parses Indonesian long-receipt item rows and OCR digit confusions", () => {
    const receipt = receiptFromOcrLines([
      ocrLine("=CHECKING=", 10, 20, 220),
      ocrLine("RESTO PAGI SORE BSD", 35, 20, 700, 0.92),
      ocrLine("6 BUAH SUNKIST", 80, 20, 400),
      ocrLine("198,OOO", 86, 650, 800),
      ocrLine("27 SRIKAYA", 120, 20, 400),
      ocrLine("297.OOO", 126, 650, 800),
      ocrLine("40 NASI PUTIH", 160, 20, 400),
      ocrLine("SPECIAL", 178, 65, 230),
      ocrLine("520,000", 166, 650, 800),
      ocrLine("Subtotal", 240, 20, 250),
      ocrLine("1,015,000", 246, 650, 800),
      ocrLine("Tax", 280, 20, 250),
      ocrLine("101,500", 286, 650, 800),
      ocrLine("Total", 320, 20, 250),
      ocrLine("1,116,500", 326, 650, 800),
    ]);

    expect(receipt.items).toMatchObject([
      { name: "BUAH SUNKIST", quantity: 6, unitPrice: 33_000, lineTotal: 198_000 },
      { name: "SRIKAYA", quantity: 27, unitPrice: 11_000, lineTotal: 297_000 },
      { name: "NASI PUTIH SPECIAL", quantity: 40, unitPrice: 13_000, lineTotal: 520_000 },
    ]);
    expect(receipt.merchantName).toBe("RESTO PAGI SORE BSD");
    expect(receipt.charges).toMatchObject({
      statedSubtotal: 1_015_000,
      tax: 101_500,
      receiptTotal: 1_116_500,
    });
  });

  it("rejects OCR output that contains no editable item rows", () => {
    expect(() =>
      receiptFromOcrLines([
        ocrLine("THANK YOU", 10),
        ocrLine("Total 123,000", 50),
      ]),
    ).toThrow("ocr_no_items");
  });
});

describe("receipt scan UX boundary", () => {
  const fileLike = (overrides: Partial<File> = {}) =>
    ({ name: "receipt.jpeg", type: "image/jpeg", size: 1_024, ...overrides }) as File;

  it("accepts receipt images when a browser omits MIME metadata", () => {
    expect(validateReceiptFile(fileLike({ type: "" }), 8 * 1024 * 1024)).toBeNull();
  });

  it("returns actionable validation errors for unsupported, empty, and large files", () => {
    expect(validateReceiptFile(fileLike({ name: "receipt.pdf", type: "application/pdf" }), 10_000)).toMatch(
      /JPG, PNG, atau WebP/,
    );
    expect(validateReceiptFile(fileLike({ size: 0 }), 10_000)).toMatch(/kosong/);
    expect(validateReceiptFile(fileLike({ size: 10_001 }), 10_000)).toMatch(/maksimal 8 MB/);
  });

  it("explains offline, model-loading, and unreadable-receipt failures", () => {
    expect(scanErrorMessage(new Error("Failed to fetch"), false)).toMatch(/Koneksi internet/);
    expect(scanErrorMessage(new Error("Failed to download model"), true)).toMatch(/mesin pemindai/i);
    expect(scanErrorMessage(new Error("ocr_no_items"), true)).toMatch(/item dan harganya/);
  });
});

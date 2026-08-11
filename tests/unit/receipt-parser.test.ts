import { describe, expect, it, vi } from "vitest";
import { normalizeAiReceipt } from "@/domain/receipt/normalize";
import { CloudflareReceiptParserProvider } from "@/features/receipt-parser/cloudflare-provider";
import { MockReceiptParserProvider } from "@/features/receipt-parser/mock-provider";
import {
  assessReceiptScan,
  groupOcrLinesIntoRows,
  receiptFromOcrLines,
  selectBestReceiptCandidate,
  shouldCrossCheckServerReceipt,
  type OcrLine,
} from "@/features/receipt-parser/paddle-receipt-parser";
import {
  scanErrorDetail,
  scanErrorMessage,
  validateReceiptFile,
} from "@/features/receipt-parser/receipt-scan";
import { findReceiptBounds, serverReceiptOutputSize } from "@/lib/image-client";
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

  const shiftedPagiSoreTail = (includeParu: boolean) => {
    const lines: OcrLine[] = [
      ocrLine("Item", 40, 20, 300),
      ocrLine("1 ITEM SEBELUMNYA", 72, 20, 340),
      ocrLine("7,095,000", 72, 650, 800),
      ocrLine("81,000", 105, 650, 800),
    ];
    const tail = [
      ["3 SYR UBI TUMBUK", "19,000"],
      ["1 TELOR GULAI", "63,000"],
      ["3 PERKEDEL", "30,000"],
      ["1 LIMPA", "31,000"],
      ["1 AYAM RENDANG", "35,000"],
      ["1 SAMBAL UDANG", "47,000"],
      ["1 NILA BKR DABU2", "44,000"],
      ["2 SYR NANGKA", "31,000"],
    ] as const;
    tail.forEach(([name, shiftedAmount], index) => {
      const top = 128 + index * 32;
      lines.push(ocrLine(name, top, 20, 420), ocrLine(shiftedAmount, top, 650, 800));
    });
    if (includeParu) lines.push(ocrLine("1 PARU", 128 + tail.length * 32, 20, 420));
    lines.push(
      ocrLine("Subtotal", 440, 20, 250),
      ocrLine("7,476,000", 440, 650, 800),
      ocrLine("Total", 480, 20, 250),
      ocrLine("7,476,000", 480, 650, 800),
    );
    return lines;
  };

  it("normalizes deterministic mock output into editable integer rupiah", async () => {
    const raw = await new MockReceiptParserProvider().parse({
      mimeType: "image/png",
      bytes: new Uint8Array(),
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
      bytes: new Uint8Array([1]),
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
      bytes: new Uint8Array([1]),
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
      bytes: new Uint8Array([1]),
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

  it("parses x-suffixed quantities from the supplied Meatsmith layout", () => {
    const receipt = receiptFromOcrLines([
      ocrLine("Meatsmith Steakhouse", 10),
      ocrLine("2x T-Bone 500gr 1,000,000", 80),
      ocrLine("1x Sirloin Steak 550,000", 120),
      ocrLine("1x Ribeye Steak 450,000", 160),
      ocrLine("3x Ice Tea 150,000", 200),
      ocrLine("5x Tonic Water 155,000", 240),
      ocrLine("5x Orange Juice 240,000", 280),
      ocrLine("3x Kale Salad 300,000", 320),
      ocrLine("Subtotal 2,845,000", 380),
      ocrLine("Tax 11% 312,950", 420),
      ocrLine("Total 3,157,950", 460),
    ]);

    expect(receipt.items).toHaveLength(7);
    expect(receipt.items[0]).toMatchObject({
      name: "T-Bone 500gr",
      quantity: 2,
      unitPrice: 500_000,
      lineTotal: 1_000_000,
    });
    expect(receipt.charges).toMatchObject({
      statedSubtotal: 2_845_000,
      tax: 312_950,
      receiptTotal: 3_157_950,
    });
  });

  it("matches separated prices by row instead of shifting from address numbers", () => {
    const receipt = receiptFromOcrLines([
      ocrLine("Meatsmith Steakhouse", 10),
      ocrLine("112", 40, 650, 800),
      ocrLine("2x T-Bone 500gr", 80, 20, 420),
      ocrLine("1,000,000", 84, 650, 800),
      ocrLine("1x Sirloin Steak", 120, 20, 420),
      ocrLine("550,000", 124, 650, 800),
      ocrLine("Jx Kale Salad", 160, 20, 420),
      ocrLine("300,000", 164, 650, 800),
      ocrLine("Subtotal", 220, 20, 250),
      ocrLine("1,850,000", 224, 650, 800),
    ]);

    expect(receipt.items).toMatchObject([
      { name: "T-Bone 500gr", quantity: 2, lineTotal: 1_000_000 },
      { name: "Sirloin Steak", quantity: 1, lineTotal: 550_000 },
      { name: "Kale Salad", quantity: 3, lineTotal: 300_000 },
    ]);
  });

  it("repairs a last item that was accidentally paired with the printed subtotal", () => {
    const receipt = receiptFromOcrLines([
      ocrLine("1 Food A 40,000", 80),
      ocrLine("1 Food B 30,000", 120),
      ocrLine("1 Food C 100,000", 160),
      ocrLine("Subtotal 100,000", 200),
    ]);

    expect(receipt.items.map((item) => item.lineTotal)).toEqual([40_000, 30_000, 30_000]);
    expect(receipt.items[2]?.confidence.lineTotal).toBeLessThan(0.75);
  });

  it("parses POS @ pricing and excludes cash tendered from the CW Coffee total", () => {
    const receipt = receiptFromOcrLines([
      ocrLine("CW COFFEE Pal 5", 10),
      ocrLine("Item Total", 50),
      ocrLine("Drink Water Original @ 1 x 7,272 7,272", 90),
      ocrLine("Nominal Belanja 7,272", 150),
      ocrLine("Subtotal 7,272", 190),
      ocrLine("PB1 727", 230),
      ocrLine("Pembulatan 1", 270),
      ocrLine("Total Belanja 8,000", 310),
      ocrLine("Total Tagihan 8,000", 350),
      ocrLine("Total Bayar 10,000", 390),
      ocrLine("Kembalian 2,000", 430),
    ]);

    expect(receipt.items).toMatchObject([
      { name: "Drink Water Original", quantity: 1, unitPrice: 7_272, lineTotal: 7_272 },
    ]);
    expect(receipt.charges).toMatchObject({
      statedSubtotal: 7_272,
      tax: 727,
      rounding: 1,
      receiptTotal: 8_000,
    });
  });

  it("parses a single POS item when its total is detected in a separate column", () => {
    const receipt = receiptFromOcrLines([
      ocrLine("CW COFFEE Pal 5", 10),
      ocrLine("31 HUSEIN HAMZAH PAL", 30, 20, 500),
      ocrLine("5", 34, 650, 800),
      ocrLine("Item", 60, 20, 200),
      ocrLine("Total", 64, 650, 800),
      ocrLine("Drink Water Original @ 1 x 7,272", 90, 20, 560),
      ocrLine("7,272", 94, 650, 800),
      ocrLine("Subtotal", 150, 20, 250),
      ocrLine("7,272", 154, 650, 800),
      ocrLine("PBI", 190, 20, 250),
      ocrLine("727", 194, 650, 800),
      ocrLine("Pembulatan", 212, 20, 250),
      ocrLine("Total Tagihan", 230, 20, 250),
      ocrLine("8,000", 234, 650, 800),
    ]);

    expect(receipt.items).toMatchObject([
      { name: "Drink Water Original", quantity: 1, unitPrice: 7_272, lineTotal: 7_272 },
    ]);
    expect(receipt.charges).toMatchObject({
      statedSubtotal: 7_272,
      tax: 727,
      rounding: 1,
      receiptTotal: 8_000,
    });
  });

  it("parses a Senandika-style item, quantity, unit-price, and total table", () => {
    const receipt = receiptFromOcrLines([
      ocrLine("WARUNG KOPI & RESTO SENANDIKA", 10),
      ocrLine("Item", 60, 20, 260),
      ocrLine("Qty", 62, 340, 390),
      ocrLine("Harga", 61, 450, 550),
      ocrLine("Total", 63, 650, 800),
      ocrLine("Nasi Goreng", 100, 20, 260),
      ocrLine("2", 102, 350, 375),
      ocrLine("Rp 25.000", 101, 450, 560),
      ocrLine("Rp 50.000", 103, 650, 800),
      ocrLine("Ayam Sambal Matah", 140, 20, 300),
      ocrLine("1", 142, 350, 375),
      ocrLine("Rp 45.000", 141, 450, 560),
      ocrLine("Rp 45.000", 143, 650, 800),
      ocrLine("Es Teh", 180, 20, 240),
      ocrLine("3", 182, 350, 375),
      ocrLine("Rp 8.000", 181, 450, 560),
      ocrLine("Rp 24.000", 183, 650, 800),
      ocrLine("Subtotal", 240, 20, 260),
      ocrLine("Rp 119.000", 242, 650, 800),
      ocrLine("PB1", 280, 20, 260),
      ocrLine("Rp 11.900", 282, 650, 800),
      ocrLine("Total", 320, 20, 260),
      ocrLine("Rp 130.900", 322, 650, 800),
    ]);

    expect(receipt.items).toMatchObject([
      { name: "Nasi Goreng", quantity: 2, unitPrice: 25_000, lineTotal: 50_000 },
      { name: "Ayam Sambal Matah", quantity: 1, unitPrice: 45_000, lineTotal: 45_000 },
      { name: "Es Teh", quantity: 3, unitPrice: 8_000, lineTotal: 24_000 },
    ]);
    expect(receipt.items.every((item) => !/^(?:rp|idr|[\d.,]+)$/i.test(item.name))).toBe(true);
    expect(receipt.charges).toMatchObject({
      statedSubtotal: 119_000,
      tax: 11_900,
      receiptTotal: 130_900,
    });
  });

  it("pairs Nakoja-style item names with following quantity and IDR detail rows", () => {
    const receipt = receiptFromOcrLines([
      ocrLine("NAKOJA", 10),
      ocrLine("Beranda Matcha - Ice Large", 80, 20, 520),
      ocrLine("1 x IDR 29.091", 108, 40, 390),
      ocrLine("IDR 29.091", 110, 650, 800),
      ocrLine("Caramel Macchiato - Ice Regular", 145, 20, 560),
      ocrLine("1 x IDR 23.636", 173, 40, 390),
      ocrLine("IDR 23.636", 175, 650, 800),
      ocrLine("Korean Salt Bread", 210, 20, 430),
      ocrLine("1 x IDR 10.909", 238, 40, 390),
      ocrLine("IDR 10.909", 240, 650, 800),
      ocrLine("Subtotal", 290, 20, 250),
      ocrLine("IDR 63.636", 292, 650, 800),
      ocrLine("Pajak Daerah PB 1 (10%)", 330, 20, 450),
      ocrLine("IDR 6.364", 332, 650, 800),
      ocrLine("TOTAL", 380, 20, 250),
      ocrLine("IDR 70.000", 382, 650, 800),
    ]);

    expect(receipt.items).toMatchObject([
      { name: "Beranda Matcha - Ice Large", quantity: 1, lineTotal: 29_091 },
      { name: "Caramel Macchiato - Ice Regular", quantity: 1, lineTotal: 23_636 },
      { name: "Korean Salt Bread", quantity: 1, lineTotal: 10_909 },
    ]);
    expect(receipt.charges).toMatchObject({
      statedSubtotal: 63_636,
      tax: 6_364,
      receiptTotal: 70_000,
    });
  });

  it("pairs CORD bakery names with following unit-price x quantity rows", () => {
    const receipt = receiptFromOcrLines([
      ocrLine("4005-Maple glazed", 40),
      ocrLine("25.000 x1 25.000", 70),
      ocrLine("6001-Plastic Bag Small", 100),
      ocrLine("0 x1 0", 130),
      ocrLine("Total Item: 2", 170),
      ocrLine("Total. 25.000", 200),
      ocrLine("Tendered: 50.000", 230),
      ocrLine("Change: 25.000", 260),
    ]);

    expect(receipt.items).toMatchObject([
      { name: "4005-Maple glazed", quantity: 1, lineTotal: 25_000 },
      { name: "6001-Plastic Bag Small", quantity: 1, lineTotal: 0 },
    ]);
    expect(receipt.charges.receiptTotal).toBe(25_000);
  });

  it("parses a CORD item name followed by quantity x unit and total", () => {
    const receipt = receiptFromOcrLines([
      ocrLine("THAI ICED TEA (L)", 40),
      ocrLine("1 X 16,363 16,363", 70),
      ocrLine("Jumlah Item : 1", 110),
      ocrLine("Sub Total : 16,363", 140),
      ocrLine("Pajak Resto : 1,636", 170),
      ocrLine("Grand Total : 17,999", 200),
    ]);

    expect(receipt.items).toMatchObject([
      { name: "THAI ICED TEA (L)", quantity: 1, lineTotal: 16_363 },
    ]);
    expect(receipt.charges).toMatchObject({
      statedSubtotal: 16_363,
      tax: 1_636,
      receiptTotal: 17_999,
    });
  });

  it("normalizes CORD decimal-formatted rupiah without multiplying by one hundred", () => {
    const receipt = receiptFromOcrLines([
      ocrLine("1 Berry Many-Low (P) 37,500.00", 40),
      ocrLine("1 500 days of summer (P) 37,500.00", 70),
      ocrLine("1 sun kissed (P) 37,500.00", 100),
      ocrLine("1 PLASTIC BAG 500.00", 130),
      ocrLine("SubTotal 113,000.00", 170),
      ocrLine("Total 113,000.00", 200),
    ]);

    expect(receipt.items.map((item) => item.lineTotal)).toEqual([
      37_500,
      37_500,
      37_500,
      500,
    ]);
    expect(receipt.charges).toMatchObject({
      statedSubtotal: 113_000,
      receiptTotal: 113_000,
    });
  });

  it("requests an enhanced pass for incomplete rows and chooses the reconciled candidate", () => {
    const incomplete = receiptFromOcrLines([
      ocrLine("1 Menu A 20,000", 80),
      ocrLine("Subtotal 100,000", 180),
      ocrLine("Total 100,000", 220),
    ]);
    const complete = receiptFromOcrLines([
      ocrLine("1 Menu A 20,000", 80),
      ocrLine("1 Menu B 30,000", 120),
      ocrLine("1 Menu C 50,000", 160),
      ocrLine("Subtotal 100,000", 220),
      ocrLine("Total 100,000", 260),
    ]);

    expect(assessReceiptScan(incomplete).shouldEnhance).toBe(true);
    expect(assessReceiptScan(complete).shouldEnhance).toBe(false);
    expect(selectBestReceiptCandidate([incomplete, complete]).items).toHaveLength(3);
  });

  it("cross-checks long server receipts and prefers the complete reconciled candidate", () => {
    const candidate = (itemCount: number, score: number) => {
      const lines = Array.from({ length: itemCount }, (_, index) =>
        ocrLine(`1 Menu ${index + 1} 1,000`, 60 + index * 30, 20, 800, score),
      );
      const subtotal = itemCount * 1_000;
      lines.push(ocrLine(`Subtotal ${subtotal.toLocaleString("en-US")}`, 80 + itemCount * 30));
      lines.push(ocrLine(`Total ${subtotal.toLocaleString("en-US")}`, 110 + itemCount * 30));
      return receiptFromOcrLines(lines);
    };
    const server = candidate(44, 0.99);
    const local = candidate(45, 0.86);

    expect(shouldCrossCheckServerReceipt(server)).toBe(true);
    expect(selectBestReceiptCandidate([server, local]).items).toHaveLength(45);
  });

  it("keeps column labels when one price is missing and infers only the subtotal gap", () => {
    const receipt = receiptFromOcrLines([
      ocrLine("Item", 40, 20, 300),
      ocrLine("1 Menu A", 100, 20, 300),
      ocrLine("10,000", 100, 650, 800),
      ocrLine("1 Menu B", 140, 20, 300),
      ocrLine("1 Menu C", 180, 20, 300),
      ocrLine("30,000", 180, 650, 800),
      ocrLine("Subtotal", 240, 20, 300),
      ocrLine("60,000", 240, 650, 800),
      ocrLine("Total", 280, 20, 300),
      ocrLine("60,000", 280, 650, 800),
    ]);

    expect(receipt.items.map((item) => [item.name, item.lineTotal])).toEqual([
      ["Menu A", 10_000],
      ["Menu B", 20_000],
      ["Menu C", 30_000],
    ]);
    expect(receipt.items[1]?.confidence.lineTotal).toBeLessThan(0.3);
  });

  it("repairs the shifted Pagi Sore tail using quantities and the printed subtotal", () => {
    const receipt = receiptFromOcrLines(shiftedPagiSoreTail(true));
    expect(receipt.items.slice(-9).map((item) => [item.name, item.quantity, item.lineTotal])).toEqual([
      ["SYR UBI TUMBUK", 3, 81_000],
      ["TELOR GULAI", 1, 19_000],
      ["PERKEDEL", 3, 63_000],
      ["LIMPA", 1, 30_000],
      ["AYAM RENDANG", 1, 31_000],
      ["SAMBAL UDANG", 1, 35_000],
      ["NILA BKR DABU2", 1, 47_000],
      ["SYR NANGKA", 2, 44_000],
      ["PARU", 1, 31_000],
    ]);
    expect(receipt.items.some((item) => item.name === "Item belum terbaca")).toBe(false);
    expect(receipt.items.reduce((sum, item) => sum + item.lineTotal, 0)).toBe(7_476_000);
    expect(receipt.items.at(-9)?.confidence.lineTotal).toBeLessThan(0.4);
  });

  it("keeps the displaced PARU amount as a low-confidence placeholder when its label is absent", () => {
    const receipt = receiptFromOcrLines(shiftedPagiSoreTail(false));

    expect(receipt.items.slice(-9).map((item) => [item.name, item.lineTotal])).toEqual([
      ["SYR UBI TUMBUK", 81_000],
      ["TELOR GULAI", 19_000],
      ["PERKEDEL", 63_000],
      ["LIMPA", 30_000],
      ["AYAM RENDANG", 31_000],
      ["SAMBAL UDANG", 35_000],
      ["NILA BKR DABU2", 47_000],
      ["SYR NANGKA", 44_000],
      ["Item belum terbaca", 31_000],
    ]);
    expect(receipt.items.at(-1)?.confidence.name).toBeLessThan(0.2);
    expect(receipt.items.reduce((sum, item) => sum + item.lineTotal, 0)).toBe(7_476_000);
    expect(shouldCrossCheckServerReceipt(receipt)).toBe(true);

    const incompleteServer = structuredClone(receipt);
    incompleteServer.items = incompleteServer.items.slice(0, -1);
    incompleteServer.charges.statedSubtotal = 7_445_000;
    incompleteServer.charges.receiptTotal = 0;
    incompleteServer.chargeConfidence.receiptTotal = 0.2;
    expect(selectBestReceiptCandidate([incompleteServer, receipt])).toBe(receipt);

    const completeServer = structuredClone(incompleteServer);
    completeServer.charges.receiptTotal = 7_445_000;
    completeServer.chargeConfidence.receiptTotal = 0.95;
    expect(selectBestReceiptCandidate([completeServer, receipt])).toBe(completeServer);
  });

  it("repairs a printed total misclassified as an impossible service charge", () => {
    const receipt = receiptFromOcrLines([
      ocrLine("1 Menu A 100,000", 80),
      ocrLine("Subtotal 100,000", 140),
      ocrLine("Charge 110,000", 180),
      ocrLine("Total 1", 220),
    ]);

    expect(receipt.charges).toMatchObject({
      statedSubtotal: 100_000,
      tax: 10_000,
      serviceCharge: 0,
      receiptTotal: 110_000,
    });
    expect(receipt.chargeConfidence.tax).toBeLessThan(0.5);
  });

  it("surfaces one low-confidence placeholder instead of hiding a small subtotal gap", () => {
    const receipt = receiptFromOcrLines([
      ocrLine("1 Menu A 10,000", 80),
      ocrLine("1 Menu C 40,000", 120),
      ocrLine("Subtotal 60,000", 180),
      ocrLine("Total 60,000", 220),
    ]);

    expect(receipt.items).toHaveLength(3);
    expect(receipt.items.at(-1)).toMatchObject({
      name: "Item belum terbaca",
      quantity: 1,
      lineTotal: 10_000,
    });
    expect(receipt.items.at(-1)?.confidence.name).toBeLessThan(0.2);
    expect(receipt.items.reduce((sum, item) => sum + item.lineTotal, 0)).toBe(60_000);
  });

  it("upscales a narrow server crop without exceeding the upload dimension cap", () => {
    const output = serverReceiptOutputSize(420, 1_300);
    expect(output.width).toBeGreaterThan(420);
    expect(Math.max(output.width, output.height)).toBeLessThanOrEqual(2_500);
  });

  it("reconciles a common tax amount when OCR attaches it to the rounding label", () => {
    const receipt = receiptFromOcrLines([
      ocrLine("1 Drink Water Original 7,272", 90),
      ocrLine("Subtotal 7,272", 150),
      ocrLine("Pembulatan 727", 190),
      ocrLine("Total 8,000", 230),
    ]);

    expect(receipt.charges).toMatchObject({
      statedSubtotal: 7_272,
      tax: 727,
      rounding: 1,
      receiptTotal: 8_000,
    });
    expect(receipt.chargeConfidence.tax).toBeLessThan(0.75);
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

  it("keeps technical scan details short and removes resource URLs", () => {
    const detail = scanErrorDetail(
      new Error("Failed to load https://cdn.example.test/private-runtime-file.wasm"),
    );
    expect(detail).toContain("resource eksternal");
    expect(detail).not.toContain("https://");
    expect(detail.length).toBeLessThanOrEqual(180);
  });
});

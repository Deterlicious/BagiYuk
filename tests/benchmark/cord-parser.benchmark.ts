import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  groupOcrLinesIntoRows,
  receiptFromOcrLines,
  type OcrLine,
} from "@/features/receipt-parser/paddle-receipt-parser";

type CordDetection = {
  label: string;
  text: string;
  bounding_box: [number, number, number, number];
  group_id?: number;
};

type CordSample = {
  filepath: string;
  num_items: number;
  subtotal_price: string | null;
  service_price: string | null;
  tax_price: string | null;
  etc: string | null;
  total_price: string | null;
  metadata: { width: number; height: number };
  detections: { detections: CordDetection[] };
};

type CordDataset = { samples: CordSample[] };

function integerMoney(value: string | number | null | undefined) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  if (normalized === "") return null;
  const withoutZeroDecimals = /[.,]00$/.test(normalized)
    ? normalized.slice(0, -3)
    : normalized;
  const parsed = Number(withoutZeroDecimals.replace(/[^\d-]/g, ""));
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function toOcrLines(sample: CordSample): OcrLine[] {
  return sample.detections.detections
    .filter((detection) => detection.text.trim().length > 0)
    .map((detection) => {
      const [normalizedX, normalizedY, normalizedWidth, normalizedHeight] =
        detection.bounding_box;
      const left = normalizedX * sample.metadata.width;
      const top = normalizedY * sample.metadata.height;
      const right = left + normalizedWidth * sample.metadata.width;
      const bottom = top + normalizedHeight * sample.metadata.height;
      return {
        text: detection.text,
        score: 1,
        poly: [
          { x: left, y: top },
          { x: right, y: top },
          { x: right, y: bottom },
          { x: left, y: bottom },
        ],
      };
    });
}

function percentage(numerator: number, denominator: number) {
  return denominator === 0 ? 0 : Math.round((numerator / denominator) * 10_000) / 100;
}

function expectedItemGroups(sample: CordSample) {
  const groups = new Map<number, CordDetection[]>();
  for (const detection of sample.detections.detections) {
    if (!detection.label.startsWith("menu.") || detection.group_id === undefined) continue;
    groups.set(detection.group_id, [...(groups.get(detection.group_id) ?? []), detection]);
  }
  return [...groups.entries()].map(([groupId, detections]) => ({
    groupId,
    name: detections
      .filter((detection) => detection.label === "menu.nm")
      .sort(
        (a, b) =>
          a.bounding_box[0] - b.bounding_box[0] ||
          a.bounding_box[1] - b.bounding_box[1],
      )
      .map((detection) => detection.text)
      .join(" "),
  }));
}

describe("CORD post-OCR parser benchmark", () => {
  it("evaluates all cached annotated Indonesian receipts", () => {
    const samplesPath = resolve(
      process.env.CORD_SAMPLES_PATH ?? join(".cache", "cord", "samples.json"),
    );
    expect(
      existsSync(samplesPath),
      `Download samples.json to ${samplesPath} before running pnpm benchmark:cord`,
    ).toBe(true);

    const dataset = JSON.parse(readFileSync(samplesPath, "utf8")) as CordDataset;
    expect(dataset.samples).toHaveLength(800);

    let parsed = 0;
    let exactItemCount = 0;
    let exactQuantityTotal = 0;
    let totalItemError = 0;
    let exactSubtotal = 0;
    let subtotalCases = 0;
    let exactTax = 0;
    let taxCases = 0;
    let exactService = 0;
    let serviceCases = 0;
    let exactTotal = 0;
    let totalCases = 0;
    let exactCoreReceipt = 0;
    const failures: Array<Record<string, unknown>> = [];

    for (const sample of dataset.samples) {
      const expectedSubtotal = integerMoney(sample.subtotal_price);
      const expectedTax = integerMoney(sample.tax_price);
      const expectedService = integerMoney(sample.service_price);
      const expectedTotal = integerMoney(sample.total_price);
      const expectedGroups = expectedItemGroups(sample);
      const expectedItemCount = expectedGroups.length;
      try {
        const receipt = receiptFromOcrLines(toOcrLines(sample));
        parsed += 1;
        const itemError = Math.abs(receipt.items.length - expectedItemCount);
        totalItemError += itemError;
        if (itemError === 0) exactItemCount += 1;
        const quantityTotal = receipt.items.reduce((sum, item) => sum + item.quantity, 0);
        if (quantityTotal === sample.num_items) exactQuantityTotal += 1;

        const subtotalMatches = expectedSubtotal === null || receipt.charges.statedSubtotal === expectedSubtotal;
        const taxMatches = expectedTax === null || receipt.charges.tax === expectedTax;
        const serviceMatches = expectedService === null || receipt.charges.serviceCharge === expectedService;
        const totalMatches = expectedTotal === null || receipt.charges.receiptTotal === expectedTotal;
        if (expectedSubtotal !== null) {
          subtotalCases += 1;
          if (subtotalMatches) exactSubtotal += 1;
        }
        if (expectedTax !== null) {
          taxCases += 1;
          if (taxMatches) exactTax += 1;
        }
        if (expectedService !== null) {
          serviceCases += 1;
          if (serviceMatches) exactService += 1;
        }
        if (expectedTotal !== null) {
          totalCases += 1;
          if (totalMatches) exactTotal += 1;
        }
        if (itemError === 0 && subtotalMatches && taxMatches && serviceMatches && totalMatches) {
          exactCoreReceipt += 1;
        } else if (failures.length < 40) {
          failures.push({
            filepath: sample.filepath,
            expectedItems: expectedItemCount,
            actualItems: receipt.items.length,
            expectedQuantityTotal: sample.num_items,
            actualQuantityTotal: quantityTotal,
            expectedItemNames: expectedGroups.map((group) => group.name),
            actualItemNames: receipt.items.map((item) => item.name),
            expectedSubtotal,
            actualSubtotal: receipt.charges.statedSubtotal,
            expectedTax,
            actualTax: receipt.charges.tax,
            expectedService,
            actualService: receipt.charges.serviceCharge,
            expectedTotal,
            actualTotal: receipt.charges.receiptTotal,
            groupedRows: groupOcrLinesIntoRows(toOcrLines(sample)).map((row) => row.text),
          });
        }
      } catch (error) {
        totalItemError += expectedItemCount;
        if (failures.length < 40) {
          const lines = toOcrLines(sample);
          failures.push({
            filepath: sample.filepath,
            expectedItems: expectedItemCount,
            expectedQuantityTotal: sample.num_items,
            error: error instanceof Error ? error.message : String(error),
            groupedRows: groupOcrLinesIntoRows(lines).map((row) => row.text),
          });
        }
      }
    }

    const report = {
      dataset: "Voxel51/consolidated_receipt_dataset",
      revision: "a468aad0427a88453151d968c2f175299d9e0ba6",
      evaluatedSamples: dataset.samples.length,
      parsedSamples: parsed,
      metrics: {
        parseSuccessPercent: percentage(parsed, dataset.samples.length),
        exactItemCountPercent: percentage(exactItemCount, dataset.samples.length),
        exactQuantityTotalPercent: percentage(exactQuantityTotal, dataset.samples.length),
        meanAbsoluteItemCountError:
          Math.round((totalItemError / dataset.samples.length) * 100) / 100,
        exactSubtotalPercent: percentage(exactSubtotal, subtotalCases),
        exactTaxPercent: percentage(exactTax, taxCases),
        exactServicePercent: percentage(exactService, serviceCases),
        exactTotalPercent: percentage(exactTotal, totalCases),
        exactCoreReceiptPercent: percentage(exactCoreReceipt, dataset.samples.length),
      },
      denominators: { subtotalCases, taxCases, serviceCases, totalCases },
      representativeFailures: failures,
    };
    const reportPath = resolve(join(".cache", "cord", "parser-report.json"));
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    process.stdout.write(`\nCORD parser benchmark\n${JSON.stringify(report.metrics, null, 2)}\n`);

    expect(parsed).toBeGreaterThan(0);
  });
});

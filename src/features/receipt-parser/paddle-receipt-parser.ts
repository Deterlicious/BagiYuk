import type { EditableReceipt } from "@/domain/receipt/types";

export type OcrPoint = { x: number; y: number } | readonly [number, number];
export type OcrLine = {
  poly: OcrPoint[];
  text: string;
  score: number;
};

type PositionedLine = OcrLine & {
  left: number;
  right: number;
  top: number;
  bottom: number;
  centerY: number;
  height: number;
};

type OcrRow = {
  text: string;
  score: number;
  top: number;
  bottom: number;
  centerY: number;
  parts: PositionedLine[];
};

const SUMMARY_PATTERNS = {
  subtotal: /\b(?:sub\s*tota[l1]|subtota[l1])\b/i,
  tax: /\b(?:tax\s*\d*%?|pajak|ppn|pb\s*[1il|!])\b/i,
  serviceCharge: /\b(?:service\s*charge|service|svc|charge)\b/i,
  discount: /\b(?:discount|diskon|disc)\b/i,
  rounding: /\b(?:rounding|pembulatan|round)\b/i,
  total: /^(?:grand\s*)?tota[l1]\b|^balance\b/i,
} as const;

const NON_MERCHANT = /^[^A-Za-z]*(?:checking|dine\s*in|take\s*away|pos\b|cashier\b|server\b|print\b|table\b|tbl\b|cover\b|date\b|thank\s*you)/i;

function clampConfidence(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.min(1, Math.max(0, value)) * 100) / 100;
}

function positionLine(line: OcrLine): PositionedLine | null {
  if (!line.text.trim() || line.poly.length === 0) return null;
  const xs = line.poly.map((point) => ("x" in point ? point.x : point[0]));
  const ys = line.poly.map((point) => ("y" in point ? point.y : point[1]));
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  const height = Math.max(1, bottom - top);
  return { ...line, left, right, top, bottom, height, centerY: (top + bottom) / 2 };
}

export function groupOcrLinesIntoRows(lines: OcrLine[]): OcrRow[] {
  const positioned = lines
    .map(positionLine)
    .filter((line): line is PositionedLine => line !== null)
    .sort((a, b) => a.centerY - b.centerY || a.left - b.left);
  const rows: OcrRow[] = [];

  for (const line of positioned) {
    let bestRow: OcrRow | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const row of rows) {
      const rowHeight = Math.max(1, row.bottom - row.top);
      const maxPartHeight = Math.max(...row.parts.map((part) => part.height), line.height);
      const projectedSpan = Math.max(row.bottom, line.bottom) - Math.min(row.top, line.top);
      const overlap = Math.min(row.bottom, line.bottom) - Math.max(row.top, line.top);
      const overlapRatio = overlap / Math.min(rowHeight, line.height);
      const distance = Math.abs(row.centerY - line.centerY);
      if (
        row.parts.length < 4 &&
        projectedSpan <= maxPartHeight * 1.65 &&
        (overlapRatio >= 0.45 || distance <= maxPartHeight * 0.42) &&
        distance < bestDistance
      ) {
        bestRow = row;
        bestDistance = distance;
      }
    }

    if (!bestRow) {
      rows.push({
        text: line.text.trim(),
        score: clampConfidence(line.score),
        top: line.top,
        bottom: line.bottom,
        centerY: line.centerY,
        parts: [line],
      });
      continue;
    }

    bestRow.parts.push(line);
    bestRow.parts.sort((a, b) => a.left - b.left);
    bestRow.text = bestRow.parts.map((part) => part.text.trim()).join(" ");
    bestRow.score = clampConfidence(
      bestRow.parts.reduce((sum, part) => sum + part.score, 0) / bestRow.parts.length,
    );
    bestRow.top = Math.min(bestRow.top, line.top);
    bestRow.bottom = Math.max(bestRow.bottom, line.bottom);
    bestRow.centerY = (bestRow.top + bestRow.bottom) / 2;
  }

  return rows.sort((a, b) => a.centerY - b.centerY);
}

function parseIntegerToken(token: string) {
  const normalized = token
    .replace(/[oO]/g, "0")
    .replace(/[iIlL|!]/g, "1")
    .replace(/[^\d-]/g, "");
  if (!normalized || normalized === "-") return null;
  const value = Number(normalized);
  return Number.isSafeInteger(value) ? value : null;
}

function parseQuantityToken(token: string) {
  const normalized = token.replace(/[iIlL]/g, "1").replace(/[jJ]/g, "3");
  return parseIntegerToken(normalized);
}

function trailingMoney(text: string) {
  const match = text.match(/(?:^|\s)(-?[\dOoIiLl|!][\dOoIiLl|!.,]*(?:\s[\dOoIiLl|!]{3})*)\s*$/);
  const token = match?.[1];
  return token ? parseIntegerToken(token) : null;
}

function summaryAmount(rows: OcrRow[], rowIndex: number) {
  const row = rows[rowIndex];
  if (!row) return null;
  const direct = trailingMoney(row.text);
  if (direct !== null) return direct;

  const rowHeight = Math.max(1, row.bottom - row.top);
  const labelLeft = row.parts[0]?.left ?? 0;
  const candidates = rows
    .map((candidate, candidateIndex) => ({ candidate, candidateIndex }))
    .filter(({ candidate, candidateIndex }) => {
      if (candidateIndex === rowIndex) return false;
      if (!/^-?[\dOoIiLl|!][\dOoIiLl|!.,]*(?:\s[\dOoIiLl|!]{3})*$/.test(candidate.text.trim())) {
        return false;
      }
      const candidateHeight = Math.max(1, candidate.bottom - candidate.top);
      const maxDistance = Math.max(rowHeight, candidateHeight) * 1.25;
      return (
        Math.abs(candidate.centerY - row.centerY) <= maxDistance &&
        (candidate.parts[0]?.left ?? 0) > labelLeft
      );
    })
    .sort(
      (a, b) =>
        Math.abs(a.candidate.centerY - row.centerY) -
        Math.abs(b.candidate.centerY - row.centerY),
    );

  return candidates[0] ? trailingMoney(candidates[0].candidate.text) : null;
}

function summaryKind(text: string) {
  if (/\b(?:total\s*(?:item|qty|quantity)|item\s*total)\b/i.test(text)) return null;
  if (/\b(?:total\s*bayar|payment|paid|kembalian|change)\b/i.test(text)) return null;
  for (const [kind, pattern] of Object.entries(SUMMARY_PATTERNS)) {
    if (pattern.test(text)) return kind as keyof typeof SUMMARY_PATTERNS;
  }
  return null;
}

function parseItemRow(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  const prefixedMatch = normalized.match(
    /^([\dIiLlJj]{1,3})\s*(?:[xX×]\s*)?(.+?)\s+(-?[\dOoIiLl|!][\dOoIiLl|!.,]*(?:\s[\dOoIiLl|!]{3})*)$/,
  );
  const atPriceMatch = normalized.match(
    /^(.+?)\s+@\s*([\dIiLlJj]{1,3})\s*[xX×]\s+[\dOoIiLl|!.,\s]+?\s+(-?[\dOoIiLl|!][\dOoIiLl|!.,]*(?:\s[\dOoIiLl|!]{3})*)$/,
  );
  const quantityToken = prefixedMatch?.[1] ?? atPriceMatch?.[2];
  const name = (prefixedMatch?.[2] ?? atPriceMatch?.[1])?.trim() ?? "";
  const totalToken = prefixedMatch?.[3] ?? atPriceMatch?.[3];
  if (!quantityToken || !totalToken) return null;
  const quantity = parseQuantityToken(quantityToken);
  const lineTotal = parseIntegerToken(totalToken);
  if (!quantity || quantity > 999 || lineTotal === null || lineTotal < 0 || name.length < 2) return null;
  if (/^(?:total|subtotal|tax|service|charge|balance|item|qty)\b/i.test(name)) return null;
  return { quantity, name, lineTotal };
}

function parseItemLabel(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  const atPriceMatch = normalized.match(
    /^(.+?)\s+@\s*([\dIiLlJj]{1,3})\s*[xX×]\s+[\dOoIiLl|!.,\s]+$/,
  );
  if (atPriceMatch) {
    const quantity = parseQuantityToken(atPriceMatch[2] ?? "");
    const name = atPriceMatch[1]?.trim() ?? "";
    if (quantity && quantity <= 999 && name.length >= 2) return { quantity, name };
  }

  const match = normalized.match(
    /^(?:([\dIiLlJj]{1,3})\s*[xX×]\s*(.+)|([\dIiLlJj]{1,3})\s+(.+))$/,
  );
  const quantityToken = match?.[1] ?? match?.[3];
  const name = (match?.[2] ?? match?.[4])?.trim() ?? "";
  if (!quantityToken || name.length < 2 || trailingMoney(name) !== null) return null;
  const quantity = parseQuantityToken(quantityToken);
  if (!quantity || quantity > 999) return null;
  return { quantity, name };
}

function moneyOnly(text: string) {
  const normalized = text.trim();
  if (!/^-?[\dOoIiLl|!][\dOoIiLl|!.,]*(?:\s[\dOoIiLl|!]{3})*$/.test(normalized)) {
    return null;
  }
  return parseIntegerToken(normalized);
}

function extractColumnItems(lines: OcrLine[]) {
  const positioned = lines
    .map(positionLine)
    .filter((line): line is PositionedLine => line !== null)
    .sort((a, b) => a.centerY - b.centerY || a.left - b.left);
  const summaryStart =
    groupOcrLinesIntoRows(lines).find((row) => summaryKind(row.text) !== null)?.centerY ?? Infinity;
  const itemHeader = positioned
    .filter(
      (line) =>
        line.centerY < summaryStart &&
        /^(?:item|items|menu|description|pesanan)\b/i.test(line.text.trim()),
    )
    .at(-1);
  const itemRegion = positioned.filter(
    (line) =>
      line.centerY < summaryStart &&
      (!itemHeader || line.centerY > itemHeader.centerY + itemHeader.height * 0.45),
  );
  const labels = itemRegion
    .map((line) => ({ line, parsed: parseItemLabel(line.text) }))
    .filter(
      (entry): entry is { line: PositionedLine; parsed: { quantity: number; name: string } } =>
        entry.parsed !== null,
    );
  const amounts = itemRegion
    .map((line) => ({ line, amount: moneyOnly(line.text) }))
    .filter(
      (entry): entry is { line: PositionedLine; amount: number } =>
        entry.amount !== null && entry.amount >= 0,
    );

  if (labels.length === 0 || amounts.length === 0) return [];

  const unusedAmounts = new Set(amounts.map((_, index) => index));
  const matchedAmounts = labels.map(({ line }) => {
    const candidates = [...unusedAmounts]
      .map((amountIndex) => ({ amountIndex, amount: amounts[amountIndex]! }))
      .filter(({ amount }) => {
        const maxHeight = Math.max(line.height, amount.line.height);
        return (
          Math.abs(amount.line.centerY - line.centerY) <= maxHeight * 1.45 &&
          amount.line.left > line.left + line.height
        );
      })
      .sort((a, b) => {
        const vertical =
          Math.abs(a.amount.line.centerY - line.centerY) -
          Math.abs(b.amount.line.centerY - line.centerY);
        return vertical || b.amount.line.left - a.amount.line.left;
      });
    const match = candidates[0];
    if (!match) return null;
    unusedAmounts.delete(match.amountIndex);
    return match.amount;
  });

  if (matchedAmounts.some((amount) => amount === null)) return [];

  return labels.map(({ line, parsed }, index) => {
    const nextCenterY = labels[index + 1]?.line.centerY ?? summaryStart;
    const continuation = itemRegion.filter((candidate) => {
      if (candidate === line || parseItemLabel(candidate.text) || moneyOnly(candidate.text) !== null) {
        return false;
      }
      const text = candidate.text.trim();
      return (
        candidate.centerY > line.centerY + line.height * 0.35 &&
        candidate.centerY < nextCenterY - line.height * 0.25 &&
        candidate.left >= line.left - line.height &&
        candidate.left <= line.left + line.height * 3.5 &&
        /^[A-Za-z][A-Za-z0-9 .&/'-]{1,40}$/.test(text) &&
        !NON_MERCHANT.test(text) &&
        summaryKind(text) === null &&
        !/^(?:nominal\s+belanja|pembulatan|pb\s*[1il|!])\b/i.test(text)
      );
    });
    const amount = matchedAmounts[index]!;
    const score = clampConfidence(
      [line.score, amount.line.score, ...continuation.map((part) => part.score)].reduce(
        (sum, value) => sum + value,
        0,
      ) /
        (2 + continuation.length),
    );
    return {
      quantity: parsed.quantity,
      name: [parsed.name, ...continuation.map((part) => part.text.trim())].join(" "),
      lineTotal: amount.amount,
      score,
    };
  });
}

function findMerchant(rows: OcrRow[], firstItemIndex: number) {
  const candidates = rows.slice(0, Math.max(1, firstItemIndex));
  return (
    candidates.find((row) => {
      const text = row.text.trim();
      return (
        text.length >= 3 &&
        text.length <= 80 &&
        /[A-Za-z]/.test(text) &&
        !NON_MERCHANT.test(text) &&
        !/^\d/.test(text) &&
        trailingMoney(text) === null
      );
    }) ?? null
  );
}

export function receiptFromOcrLines(lines: OcrLine[]): EditableReceipt {
  const rows = groupOcrLinesIntoRows(lines);
  const columnItems = extractColumnItems(lines);
  const firstItemIndex = rows.findIndex((row) => parseItemRow(row.text) !== null);
  const merchant = findMerchant(rows, firstItemIndex < 0 ? rows.length : firstItemIndex);
  const items: EditableReceipt["items"] = [];
  const charges = {
    statedSubtotal: 0,
    tax: 0,
    serviceCharge: 0,
    discount: 0,
    rounding: 0,
    receiptTotal: 0,
  };
  const chargeConfidence = {
    statedSubtotal: 0,
    tax: 0,
    serviceCharge: 0,
    discount: 0,
    rounding: 0,
    receiptTotal: 0,
  };

  for (const [rowIndex, row] of rows.entries()) {
    const kind = summaryKind(row.text);
    const amount = kind ? summaryAmount(rows, rowIndex) : null;
    if (kind && amount !== null) {
      if (kind === "subtotal") {
        charges.statedSubtotal = amount;
        chargeConfidence.statedSubtotal = row.score;
      } else if (kind === "total") {
        if (amount >= charges.receiptTotal) {
          charges.receiptTotal = amount;
          chargeConfidence.receiptTotal = row.score;
        }
      } else {
        charges[kind] = Math.abs(amount);
        chargeConfidence[kind] = row.score;
      }
      continue;
    }

    if (columnItems.length > 0) continue;
    const parsed = parseItemRow(row.text);
    if (!parsed) continue;
    const itemName = parsed.name.slice(0, 120);
    const nameConfidence = parsed.name.length > 120 ? Math.min(row.score, 0.4) : row.score;
    const unitPrice =
      parsed.lineTotal % parsed.quantity === 0
        ? parsed.lineTotal / parsed.quantity
        : parsed.lineTotal;
    items.push({
      id: `ocr-item-${items.length + 1}`,
      name: itemName,
      quantity: parsed.quantity,
      unitPrice,
      lineTotal: parsed.lineTotal,
      confidence: {
        name: nameConfidence,
        quantity: row.score,
        unitPrice: clampConfidence(row.score * 0.88),
        lineTotal: row.score,
      },
    });
  }

  if (columnItems.length > 0) {
    for (const parsed of columnItems) {
      const itemName = parsed.name.slice(0, 120);
      const nameConfidence = parsed.name.length > 120 ? Math.min(parsed.score, 0.4) : parsed.score;
      const unitPrice =
        parsed.lineTotal % parsed.quantity === 0
          ? parsed.lineTotal / parsed.quantity
          : parsed.lineTotal;
      items.push({
        id: `ocr-item-${items.length + 1}`,
        name: itemName,
        quantity: parsed.quantity,
        unitPrice,
        lineTotal: parsed.lineTotal,
        confidence: {
          name: nameConfidence,
          quantity: parsed.score,
          unitPrice: clampConfidence(parsed.score * 0.88),
          lineTotal: parsed.score,
        },
      });
    }
  }

  if (items.length === 0) {
    throw new Error("ocr_no_items");
  }

  let calculatedSubtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  if (charges.statedSubtotal > 0 && calculatedSubtotal !== charges.statedSubtotal) {
    const subtotalAsItem = items.find((item) => item.lineTotal === charges.statedSubtotal);
    if (subtotalAsItem) {
      const otherItemsTotal = calculatedSubtotal - subtotalAsItem.lineTotal;
      const expectedLineTotal = charges.statedSubtotal - otherItemsTotal;
      if (expectedLineTotal > 0 && expectedLineTotal < subtotalAsItem.lineTotal) {
        subtotalAsItem.lineTotal = expectedLineTotal;
        subtotalAsItem.unitPrice =
          expectedLineTotal % subtotalAsItem.quantity === 0
            ? expectedLineTotal / subtotalAsItem.quantity
            : expectedLineTotal;
        subtotalAsItem.confidence.unitPrice = Math.min(
          subtotalAsItem.confidence.unitPrice,
          0.38,
        );
        subtotalAsItem.confidence.lineTotal = Math.min(
          subtotalAsItem.confidence.lineTotal,
          0.38,
        );
        calculatedSubtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
      }
    }
  }
  if (charges.statedSubtotal === 0) {
    charges.statedSubtotal = calculatedSubtotal;
    chargeConfidence.statedSubtotal = 0.45;
  }
  if (charges.receiptTotal > 0) {
    if (charges.tax === 0 && charges.rounding > 0 && charges.statedSubtotal > 0) {
      const possibleTaxRate = charges.rounding / charges.statedSubtotal;
      const possibleRounding =
        charges.receiptTotal -
        (charges.statedSubtotal +
          charges.rounding +
          charges.serviceCharge -
          charges.discount);
      if (
        possibleTaxRate >= 0.03 &&
        possibleTaxRate <= 0.2 &&
        Math.abs(possibleRounding) <= 1_000
      ) {
        charges.tax = charges.rounding;
        chargeConfidence.tax = Math.min(chargeConfidence.rounding, 0.62);
        charges.rounding = possibleRounding;
        chargeConfidence.rounding = 0.5;
      }
    }
    const inferredRounding =
      charges.receiptTotal -
      (charges.statedSubtotal + charges.tax + charges.serviceCharge - charges.discount);
    if (charges.rounding === 0 && inferredRounding !== 0 && Math.abs(inferredRounding) <= 1_000) {
      charges.rounding = inferredRounding;
      chargeConfidence.rounding = 0.68;
    }
  } else {
    charges.receiptTotal =
      charges.statedSubtotal +
      charges.tax +
      charges.serviceCharge -
      charges.discount +
      charges.rounding;
    chargeConfidence.receiptTotal = 0.35;
  }

  return {
    merchantName: merchant?.text ?? "Nama tempat belum terbaca",
    merchantConfidence: merchant?.score ?? 0,
    items,
    charges,
    chargeConfidence,
    source: "ocr",
  };
}

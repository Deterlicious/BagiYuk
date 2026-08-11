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
  subtotal: /\b(?:sub[\s-]*tota[l1]|subtota[l1]|nominal\s+belanja)\b/i,
  tax: /\b(?:tax\s*\d*%?|pajak|ppn|pb\s*[1il|!])\b/i,
  serviceCharge: /\b(?:service\s*charge|service|svc|charge)\b/i,
  discount: /\b(?:discount|diskon|disc)\b/i,
  rounding: /\b(?:rounding|pembulatan|round)\b/i,
  total: /^(?:grand\s*)?tota[l1]\b|^balance\b/i,
} as const;

const NON_MERCHANT = /^[^A-Za-z]*(?:checking|dine\s*in|take\s*away|pos\b|cashier\b|server\b|print\b|table\b|tbl\b|cover\b|date\b|thank\s*you)/i;
const NON_ITEM_LABEL = /^(?:cash|tendered|change|kembalian|payment|paid|debet\s*card|debit\s*card|credit\s*card|emoney)$/i;

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
        row.parts.length < 12 &&
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
  const withoutCurrency = token
    .replace(/(?:rp\.?|idr)\s*/gi, "")
    .replace(/[oO]/g, "0")
    .replace(/[iIlL|!]/g, "1")
    .trim();
  const withoutZeroDecimals = /[.,]00$/.test(withoutCurrency)
    ? withoutCurrency.slice(0, -3)
    : withoutCurrency;
  const normalized = withoutZeroDecimals
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
  const match = text.match(
    /(?:^|\s)((?:(?:rp\.?|idr)\s*)?-?[\dOoIiLl|!][\dOoIiLl|!.,]*(?:\s[\dOoIiLl|!]{3})*)\s*$/i,
  );
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
      if (!/^(?:(?:rp\.?|idr)\s*)?-?[\dOoIiLl|!][\dOoIiLl|!.,]*(?:\s[\dOoIiLl|!]{3})*$/i.test(candidate.text.trim())) {
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
  const prefixedWithUnitMatch = normalized.match(
    /^([\dIiLlJj]{1,3})\s*(?:[xX×]\s*)?(.+?)\s+((?:(?:rp\.?|idr)\s*)?[\dOoIiLl|!][\dOoIiLl|!.,]*)\s+((?:(?:rp\.?|idr)\s*)?[\dOoIiLl|!][\dOoIiLl|!.,]*)$/i,
  );
  const nameFirstWithUnitMatch = normalized.match(
    /^(.+?)\s+([\dIiLlJj]{1,3})\s+((?:(?:rp\.?|idr)\s*)?[\dOoIiLl|!][\dOoIiLl|!.,]*)\s+((?:(?:rp\.?|idr)\s*)?[\dOoIiLl|!][\dOoIiLl|!.,]*)$/i,
  );
  const nameFirstMatch = normalized.match(
    /^(.+?)\s+([\dIiLlJj]{1,3})\s+((?:(?:rp\.?|idr)\s*)?-?[\dOoIiLl|!][\dOoIiLl|!.,]*(?:\s[\dOoIiLl|!]{3})*)$/i,
  );
  const implicitQuantityMatch = normalized.match(
    /^(.+?)\s+((?:(?:rp\.?|idr)\s*)?-?[\dOoIiLl|!][\dOoIiLl|!.,]*(?:\s[\dOoIiLl|!]{3})*)$/i,
  );
  const prefixedMatch = normalized.match(
    /^([\dIiLlJj]{1,3})\s*(?:[xX×]\s*)?(.+?)\s+((?:(?:rp\.?|idr)\s*)?-?[\dOoIiLl|!][\dOoIiLl|!.,]*(?:\s[\dOoIiLl|!]{3})*)$/i,
  );
  const atPriceMatch = normalized.match(
    /^(.+?)\s+@\s*([\dIiLlJj]{1,3})\s*[xX×]\s+(?:(?:rp\.?|idr)\s*)?[\dOoIiLl|!.,\s]+?\s+((?:(?:rp\.?|idr)\s*)?-?[\dOoIiLl|!][\dOoIiLl|!.,]*(?:\s[\dOoIiLl|!]{3})*)$/i,
  );
  const quantityToken =
    prefixedWithUnitMatch?.[1] ??
    nameFirstWithUnitMatch?.[2] ??
    nameFirstMatch?.[2] ??
    prefixedMatch?.[1] ??
    atPriceMatch?.[2] ??
    (implicitQuantityMatch ? "1" : undefined);
  const name = (
    prefixedWithUnitMatch?.[2] ??
    nameFirstWithUnitMatch?.[1] ??
    nameFirstMatch?.[1] ??
    prefixedMatch?.[2] ??
    atPriceMatch?.[1] ??
    implicitQuantityMatch?.[1]
  )?.trim() ?? "";
  const totalToken =
    prefixedWithUnitMatch?.[4] ??
    nameFirstWithUnitMatch?.[4] ??
    nameFirstMatch?.[3] ??
    prefixedMatch?.[3] ??
    atPriceMatch?.[3] ??
    implicitQuantityMatch?.[2];
  if (!quantityToken || !totalToken) return null;
  const quantity = parseQuantityToken(quantityToken);
  const lineTotal = parseIntegerToken(totalToken);
  if (!quantity || quantity > 999 || lineTotal === null || lineTotal < 0 || name.length < 2) return null;
  if (/^(?:total|subtotal|tax|service|charge|balance|item|qty|rp\.?|idr)\b/i.test(name)) return null;
  if (/^(?:food|beverages?|drinks?|others?)$/i.test(name)) return null;
  if (NON_ITEM_LABEL.test(name.replace(/:$/, "").trim())) return null;
  if (implicitQuantityMatch && !/[.,]|\b(?:rp\.?|idr)\b/i.test(totalToken) && lineTotal < 1_000) {
    return null;
  }
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
  if (!/^(?:(?:rp\.?|idr)\s*)?-?[\dOoIiLl|!][\dOoIiLl|!.,]*(?:\s[\dOoIiLl|!]{3})*$/i.test(normalized)) {
    return null;
  }
  return parseIntegerToken(normalized);
}

type ParsedLayoutItem = {
  quantity: number;
  name: string;
  lineTotal: number;
  score: number;
};

function isTableHeader(row: OcrRow) {
  if (/\b(?:(?:total|jumlah)\s+items?|items?\s*(?:count|closed))\b/i.test(row.text)) {
    return false;
  }
  const matches = row.text.match(/\b(?:item|items|menu|nama|description|qty|jml|jumlah|harga|price|amount|total)\b/gi);
  return (matches?.length ?? 0) >= 2 && summaryKind(row.text) === null;
}

function meaningfulItemName(name: string) {
  const normalized = name.replace(/\s+/g, " ").trim();
  return (
    normalized.length >= 2 &&
    /[A-Za-z]/.test(normalized) &&
    !/^(?:rp\.?|idr|total|subtotal|tax|pajak|ppn|pb\s*[1il|!]|service|charge|qty|harga)\b/i.test(normalized) &&
    !/^(?:food|beverages?|drinks?|others?)$/i.test(normalized) &&
    !NON_ITEM_LABEL.test(normalized.replace(/:$/, "").trim()) &&
    moneyOnly(normalized) === null
  );
}

function parseCurrencyDetailRow(row: OcrRow): ParsedLayoutItem | null {
  const normalized = row.text.replace(/\s+/g, " ").trim();
  const match = normalized.match(
    /^([\dIiLlJj]{1,3})\s*[xX×]\s+((?:(?:(?:rp\.?|idr)\s*)?[\dOoIiLl|!][\dOoIiLl|!.,]*)(?:\s+(?:(?:rp\.?|idr)\s*)?[\dOoIiLl|!][\dOoIiLl|!.,]*)*)$/i,
  );
  if (!match) return null;
  const quantity = parseQuantityToken(match[1] ?? "");
  const moneyTokens = [...(match[2] ?? "").matchAll(/(?:(?:rp\.?|idr)\s*)?[\dOoIiLl|!][\dOoIiLl|!.,]*/gi)]
    .map((candidate) => parseIntegerToken(candidate[0]))
    .filter((value): value is number => value !== null);
  const lineTotal = moneyTokens.at(-1);
  if (!quantity || quantity > 999 || lineTotal === undefined || lineTotal < 0) return null;
  return { quantity, name: "", lineTotal, score: row.score };
}

function parsePriceQuantityDetailRow(row: OcrRow): ParsedLayoutItem | null {
  const normalized = row.text.replace(/\s+/g, " ").trim();
  const match = normalized.match(
    /^(?:(?:rp\.?|idr)\s*)?[\dOoIiLl|!][\dOoIiLl|!.,]*\s*[xX×]\s*([\dIiLlJj]{1,3})\s+((?:(?:rp\.?|idr)\s*)?[\dOoIiLl|!][\dOoIiLl|!.,]*)$/i,
  );
  if (!match) return null;
  const quantity = parseQuantityToken(match[1] ?? "");
  const lineTotal = parseIntegerToken(match[2] ?? "");
  if (!quantity || quantity > 999 || lineTotal === null || lineTotal < 0) return null;
  return { quantity, name: "", lineTotal, score: row.score };
}

function parseStandalonePriceRow(row: OcrRow): ParsedLayoutItem | null {
  const normalized = row.text.trim();
  const lineTotal = moneyOnly(normalized);
  if (lineTotal === null || lineTotal < 0) return null;
  const visiblyFormatted = /[.,]|\b(?:rp\.?|idr)\b/i.test(normalized);
  if (!visiblyFormatted && lineTotal !== 0 && lineTotal < 1_000) return null;
  if (!visiblyFormatted && lineTotal >= 100_000_000) return null;
  return { quantity: 1, name: "", lineTotal, score: row.score };
}

function pendingItemIdentity(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  const quantityMatch = normalized.match(/^([\dIiLlJj]{1,3})\s+(.+)$/);
  if (!quantityMatch || !meaningfulItemName(quantityMatch[2] ?? "")) {
    return { quantity: 1, name: normalized };
  }
  const quantity = parseQuantityToken(quantityMatch[1] ?? "");
  return {
    quantity: quantity && quantity <= 999 ? quantity : 1,
    name: quantityMatch[2]?.trim() ?? normalized,
  };
}

function parseLayoutRow(row: OcrRow, quantityColumnX?: number): ParsedLayoutItem | null {
  const currencyDetail = parseCurrencyDetailRow(row);
  if (currencyDetail) return currencyDetail;
  const priceQuantityDetail = parsePriceQuantityDetailRow(row);
  if (priceQuantityDetail) return priceQuantityDetail;

  const direct = parseItemRow(row.text);
  if (direct && meaningfulItemName(direct.name)) return { ...direct, score: row.score };

  const standalonePrice = parseStandalonePriceRow(row);
  if (standalonePrice) return standalonePrice;

  const parts = row.parts.slice().sort((a, b) => a.left - b.left);
  const amounts = parts
    .map((part) => ({ part, amount: moneyOnly(part.text) }))
    .filter(
      (entry): entry is { part: PositionedLine; amount: number } =>
        entry.amount !== null && entry.amount >= 0,
    );
  if (amounts.length === 0) return null;

  const quantityCandidates = amounts.filter(({ part, amount }) => {
    const normalized = part.text.trim();
    return amount >= 1 && amount <= 999 && /^[\dIiLlJj]{1,3}\s*[xX×]?$/.test(normalized);
  });
  const quantityEntry = quantityCandidates.sort((a, b) => {
    if (quantityColumnX !== undefined) {
      const aCenter = (a.part.left + a.part.right) / 2;
      const bCenter = (b.part.left + b.part.right) / 2;
      return Math.abs(aCenter - quantityColumnX) - Math.abs(bCenter - quantityColumnX);
    }
    return a.part.left - b.part.left;
  })[0];
  const priceEntries = amounts.filter((entry) => entry !== quantityEntry);
  const totalEntry = priceEntries.sort((a, b) => b.part.left - a.part.left)[0];
  if (!totalEntry) return null;

  const embeddedLabel = parts
    .map((part) => ({ part, label: parseItemLabel(part.text) }))
    .find((entry) => entry.label !== null);
  const nameWithTrailingQuantity = parts
    .filter((part) => !amounts.some((entry) => entry.part === part))
    .map((part) => ({
      part,
      match: part.text.trim().match(/^(.+?)\s+([\dIiLlJj]{1,3})\s*[xX×]?$/),
    }))
    .find((entry) => entry.match && meaningfulItemName(entry.match[1] ?? ""));
  const quantity =
    embeddedLabel?.label?.quantity ??
    (nameWithTrailingQuantity?.match
      ? parseQuantityToken(nameWithTrailingQuantity.match[2] ?? "")
      : null) ??
    quantityEntry?.amount ??
    1;
  const explicitName =
    embeddedLabel?.label?.name ?? nameWithTrailingQuantity?.match?.[1]?.trim() ?? "";
  const nameParts = parts.filter((part) => {
    if (amounts.some((entry) => entry.part === part)) return false;
    if (embeddedLabel?.part === part || nameWithTrailingQuantity?.part === part) return false;
    const text = part.text.trim();
    return (
      meaningfulItemName(text) &&
      !/^\d+\s*[xX×]\s*(?:rp\.?|idr)\b/i.test(text) &&
      !isTableHeader({ ...row, text })
    );
  });
  const name = [explicitName, ...nameParts.map((part) => part.text.trim())]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const usedScores = [
    totalEntry.part.score,
    ...(quantityEntry ? [quantityEntry.part.score] : []),
    ...nameParts.map((part) => part.score),
    ...(embeddedLabel ? [embeddedLabel.part.score] : []),
  ];
  return {
    quantity,
    name,
    lineTotal: totalEntry.amount,
    score: clampConfidence(usedScores.reduce((sum, value) => sum + value, 0) / usedScores.length),
  };
}

function extractLayoutItems(lines: OcrLine[]) {
  const rows = groupOcrLinesIntoRows(lines);
  const summaryIndex = rows.findIndex((row) => summaryKind(row.text) !== null);
  const endIndex = summaryIndex < 0 ? rows.length : summaryIndex;
  const headerIndex = rows.slice(0, endIndex).findLastIndex(isTableHeader);
  const quantityHeader = headerIndex >= 0
    ? rows[headerIndex]?.parts.find((part) => /^(?:qty|jml|jumlah|quantity)$/i.test(part.text.trim()))
    : undefined;
  const quantityColumnX = quantityHeader
    ? (quantityHeader.left + quantityHeader.right) / 2
    : undefined;
  const firstDataIndex = rows.slice(0, endIndex).findIndex((row, index) => {
    if (
      parseItemRow(row.text) !== null ||
      parseCurrencyDetailRow(row) !== null ||
      parsePriceQuantityDetailRow(row) !== null
    ) {
      return true;
    }
    if (!parseStandalonePriceRow(row)) return false;
    return rows.slice(Math.max(0, index - 2), index).some((candidate) => {
      const text = candidate.text.trim();
      return meaningfulItemName(text) && !NON_MERCHANT.test(text) && trailingMoney(text) === null;
    });
  });
  if (firstDataIndex < 0) return [];
  const startIndex = headerIndex >= 0 ? headerIndex + 1 : Math.max(0, firstDataIndex - 2);
  const items: ParsedLayoutItem[] = [];
  let pendingNames: OcrRow[] = [];

  for (let index = startIndex; index < endIndex; index += 1) {
    const row = rows[index]!;
    if (isTableHeader(row)) {
      pendingNames = [];
      continue;
    }
    const parsed = parseLayoutRow(row, quantityColumnX);
    if (parsed) {
      const pendingName = pendingNames.at(-1);
      const pendingIdentity = pendingName ? pendingItemIdentity(pendingName.text) : null;
      const name = meaningfulItemName(parsed.name) ? parsed.name : pendingIdentity?.name ?? "";
      if (meaningfulItemName(name)) {
        items.push({
          ...parsed,
          name,
          quantity:
            parsed.name || !pendingIdentity || parsed.quantity !== 1
              ? parsed.quantity
              : pendingIdentity.quantity,
          score: clampConfidence(
            pendingName ? (parsed.score + pendingName.score) / 2 : parsed.score,
          ),
        });
      }
      pendingNames = [];
      continue;
    }

    const text = row.text.replace(/\s+/g, " ").trim();
    const plausibleNameOnly =
      meaningfulItemName(text) &&
      trailingMoney(text) === null &&
      !NON_MERCHANT.test(text) &&
      !NON_ITEM_LABEL.test(text.replace(/:$/, "").trim()) &&
      !/^(?:nominal\s+belanja|thank\s+you|date|tanggal|waktu|kasir|customer|server|meja)\b/i.test(text);
    if (plausibleNameOnly) pendingNames = [...pendingNames.slice(-1), row];
  }

  return items;
}

function extractColumnItems(lines: OcrLine[]) {
  const positioned = lines
    .map(positionLine)
    .filter((line): line is PositionedLine => line !== null)
    .sort((a, b) => a.centerY - b.centerY || a.left - b.left);
  const summaryRow = groupOcrLinesIntoRows(lines).find((row) => summaryKind(row.text) !== null);
  const summaryStart = summaryRow
    ? summaryRow.top - Math.max(1, summaryRow.bottom - summaryRow.top) * 0.35
    : Infinity;
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

  if (matchedAmounts.every((amount) => amount === null)) return [];

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
    const amount = matchedAmounts[index];
    const score = clampConfidence(
      [line.score, ...(amount ? [amount.line.score] : []), ...continuation.map((part) => part.score)].reduce(
        (sum, value) => sum + value,
        0,
      ) /
        (1 + (amount ? 1 : 0) + continuation.length),
    );
    return {
      quantity: parsed.quantity,
      name: [parsed.name, ...continuation.map((part) => part.text.trim())].join(" "),
      lineTotal: amount?.amount ?? 0,
      score: amount ? score : Math.min(score, 0.3),
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

function divisibilityViolations(
  items: EditableReceipt["items"],
  totals: number[],
  startIndex: number,
) {
  return items.slice(startIndex).reduce((count, item, offset) => {
    const total = totals[startIndex + offset] ?? 0;
    return count + (item.quantity > 1 && total > 0 && total % item.quantity !== 0 ? 1 : 0);
  }, 0);
}

function normalizedUnitPriceDispersion(
  items: EditableReceipt["items"],
  totals: number[],
  startIndex: number,
) {
  const unitPrices = items
    .slice(startIndex)
    .map((item, offset) => (totals[startIndex + offset] ?? 0) / item.quantity)
    .filter((value) => value > 0)
    .sort((a, b) => a - b);
  const median = unitPrices[Math.floor(unitPrices.length / 2)] ?? 0;
  if (median <= 0) return Number.POSITIVE_INFINITY;
  return unitPrices.reduce((sum, value) => sum + Math.abs(value - median) / median, 0);
}

/**
 * Repairs a characteristic long-receipt failure where the price column drifts by
 * one row near the bottom. The printed subtotal supplies the one unassigned
 * amount, while quantity divisibility must make the shifted alignment strictly
 * more plausible. Ambiguous gaps keep the normal editable placeholder behavior.
 */
function repairShiftedTailAmounts(
  items: EditableReceipt["items"],
  statedSubtotal: number,
) {
  if (items.length < 5 || statedSubtotal <= 0) return false;
  const calculatedSubtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const missingAmount = statedSubtotal - calculatedSubtotal;
  if (missingAmount <= 0 || missingAmount > statedSubtotal * 0.2) return false;

  const zeroIndexes = items.flatMap((item, index) => (item.lineTotal === 0 ? [index] : []));
  if (zeroIndexes.length > 1) return false;
  const lastIndex = items.length - 1;
  const hasTrailingUnpricedLabel = zeroIndexes[0] === lastIndex;
  if (zeroIndexes.length === 1 && !hasTrailingUnpricedLabel) return false;

  const originalTotals = items.map((item) => item.lineTotal);
  const baselineTotals = originalTotals.slice();
  if (hasTrailingUnpricedLabel) baselineTotals[lastIndex] = missingAmount;
  const earliestStart = Math.max(0, lastIndex - 11);
  let best:
    | { startIndex: number; totals: number[]; improvement: number; displacedAmount: number }
    | undefined;

  for (let startIndex = earliestStart; startIndex <= lastIndex - 3; startIndex += 1) {
    const firstItem = items[startIndex]!;
    const currentAmount = originalTotals[startIndex] ?? 0;
    if (
      firstItem.quantity <= 1 ||
      currentAmount <= 0 ||
      currentAmount % firstItem.quantity === 0 ||
      missingAmount % firstItem.quantity !== 0
    ) {
      continue;
    }

    const shiftedTotals = baselineTotals.slice();
    shiftedTotals[startIndex] = missingAmount;
    for (let index = startIndex + 1; index <= lastIndex; index += 1) {
      shiftedTotals[index] = originalTotals[index - 1] ?? 0;
    }
    const improvement =
      divisibilityViolations(items, baselineTotals, startIndex) -
      divisibilityViolations(items, shiftedTotals, startIndex);
    const baselineDispersion = normalizedUnitPriceDispersion(items, baselineTotals, startIndex);
    const shiftedDispersion = normalizedUnitPriceDispersion(items, shiftedTotals, startIndex);
    if (improvement < 1 || shiftedDispersion > baselineDispersion * 0.75) continue;
    if (!best || improvement > best.improvement || (improvement === best.improvement && startIndex < best.startIndex)) {
      best = {
        startIndex,
        totals: shiftedTotals,
        improvement,
        displacedAmount: originalTotals[lastIndex] ?? 0,
      };
    }
  }

  if (!best) return false;
  for (let index = best.startIndex; index <= lastIndex; index += 1) {
    const item = items[index]!;
    const lineTotal = best.totals[index] ?? 0;
    item.lineTotal = lineTotal;
    item.unitPrice = lineTotal % item.quantity === 0 ? lineTotal / item.quantity : lineTotal;
    item.confidence.unitPrice = Math.min(item.confidence.unitPrice, 0.32);
    item.confidence.lineTotal = Math.min(item.confidence.lineTotal, 0.32);
  }

  if (!hasTrailingUnpricedLabel && best.displacedAmount > 0) {
    items.push({
      id: `ocr-item-${items.length + 1}`,
      name: "Item belum terbaca",
      quantity: 1,
      unitPrice: best.displacedAmount,
      lineTotal: best.displacedAmount,
      confidence: {
        name: 0.12,
        quantity: 0.2,
        unitPrice: 0.18,
        lineTotal: 0.18,
      },
    });
  }
  return true;
}

export function receiptFromOcrLines(lines: OcrLine[]): EditableReceipt {
  const rows = groupOcrLinesIntoRows(lines);
  const layoutItems = extractLayoutItems(lines);
  const columnItems = extractColumnItems(lines);
  const structuredItems =
    layoutItems.length > columnItems.length
      ? layoutItems
      : columnItems.length > 0
        ? columnItems
        : layoutItems;
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

    if (structuredItems.length > 0) continue;
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

  if (structuredItems.length > 0) {
    for (const parsed of structuredItems) {
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

  repairShiftedTailAmounts(items, charges.statedSubtotal);
  let calculatedSubtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  if (charges.statedSubtotal > calculatedSubtotal) {
    const missingAmounts = items.filter((item) => item.lineTotal === 0);
    const missingAmount = charges.statedSubtotal - calculatedSubtotal;
    if (
      missingAmounts.length === 1 &&
      missingAmount > 0 &&
      missingAmount <= charges.statedSubtotal * 0.5
    ) {
      const item = missingAmounts[0]!;
      item.lineTotal = missingAmount;
      item.unitPrice =
        missingAmount % item.quantity === 0 ? missingAmount / item.quantity : missingAmount;
      item.confidence.unitPrice = Math.min(item.confidence.unitPrice, 0.28);
      item.confidence.lineTotal = Math.min(item.confidence.lineTotal, 0.28);
      calculatedSubtotal += missingAmount;
    } else if (
      missingAmounts.length === 0 &&
      missingAmount > 0 &&
      missingAmount <= charges.statedSubtotal * 0.2
    ) {
      for (const item of items.slice(-10)) {
        item.confidence.name = Math.min(item.confidence.name, 0.42);
        item.confidence.unitPrice = Math.min(item.confidence.unitPrice, 0.36);
        item.confidence.lineTotal = Math.min(item.confidence.lineTotal, 0.36);
      }
      items.push({
        id: `ocr-item-${items.length + 1}`,
        name: "Item belum terbaca",
        quantity: 1,
        unitPrice: missingAmount,
        lineTotal: missingAmount,
        confidence: {
          name: 0.12,
          quantity: 0.2,
          unitPrice: 0.18,
          lineTotal: 0.18,
        },
      });
      calculatedSubtotal += missingAmount;
    }
  }
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
  if (
    charges.statedSubtotal > 0 &&
    charges.serviceCharge > charges.statedSubtotal &&
    charges.receiptTotal < charges.statedSubtotal
  ) {
    const probableTotal = charges.serviceCharge;
    const unallocatedCharge =
      probableTotal -
      (charges.statedSubtotal + charges.tax - charges.discount + charges.rounding);
    if (unallocatedCharge >= 0 && unallocatedCharge <= charges.statedSubtotal * 0.3) {
      charges.receiptTotal = probableTotal;
      chargeConfidence.receiptTotal = Math.min(chargeConfidence.serviceCharge, 0.55);
      charges.serviceCharge = 0;
      chargeConfidence.serviceCharge = 0.28;
      if (charges.tax === 0 && unallocatedCharge > 0) {
        charges.tax = unallocatedCharge;
        chargeConfidence.tax = 0.38;
      }
    }
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

  if (charges.statedSubtotal > 0) {
    const itemGap = Math.abs(calculatedSubtotal - charges.statedSubtotal);
    const mismatchRatio = itemGap / charges.statedSubtotal;
    if (mismatchRatio > 0.05) {
      for (const item of items) {
        item.confidence.name = Math.min(item.confidence.name, 0.62);
        item.confidence.unitPrice = Math.min(item.confidence.unitPrice, 0.55);
        item.confidence.lineTotal = Math.min(item.confidence.lineTotal, 0.55);
      }
    }
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

export type ReceiptScanAssessment = {
  score: number;
  itemSubtotal: number;
  coverage: number | null;
  mismatchRatio: number | null;
  summaryMismatchRatio: number | null;
  suspiciousNames: number;
  hasPlaceholder: boolean;
  hasTrustedSubtotal: boolean;
  hasTrustedTotal: boolean;
  trustedSummaryFields: number;
  shouldEnhance: boolean;
};

/** Scores structure quality, not bill correctness. OCR remains editable input. */
export function assessReceiptScan(receipt: EditableReceipt): ReceiptScanAssessment {
  const itemSubtotal = receipt.items.reduce((sum, item) => sum + item.lineTotal, 0);
  const statedSubtotal = receipt.charges.statedSubtotal;
  const hasTrustedSubtotal =
    statedSubtotal > 0 && receipt.chargeConfidence.statedSubtotal >= 0.68;
  const hasTrustedTotal =
    receipt.charges.receiptTotal > 0 && receipt.chargeConfidence.receiptTotal >= 0.68;
  const coverage = hasTrustedSubtotal ? itemSubtotal / statedSubtotal : null;
  const mismatchRatio = coverage === null ? null : Math.abs(1 - coverage);
  const suspiciousNames = receipt.items.filter(
    (item) =>
      !meaningfulItemName(item.name) ||
      /^(?:rp\.?|idr)?\s*[\d.,]+$/i.test(item.name.trim()),
  ).length;
  const hasPlaceholder = receipt.items.some((item) =>
    /^item belum terbaca$/i.test(item.name.trim()),
  );
  const expectedReceiptTotal =
    statedSubtotal +
    receipt.charges.tax +
    receipt.charges.serviceCharge -
    receipt.charges.discount +
    receipt.charges.rounding;
  const summaryMismatchRatio = hasTrustedTotal
    ? Math.abs(expectedReceiptTotal - receipt.charges.receiptTotal) /
      receipt.charges.receiptTotal
    : null;
  const trustedSummaryFields = Object.values(receipt.chargeConfidence).filter(
    (confidence) => confidence >= 0.68,
  ).length;
  const confidenceValues = receipt.items.flatMap((item) => Object.values(item.confidence));
  const averageConfidence = confidenceValues.length
    ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length
    : 0;
  const reconciliationScore = mismatchRatio === null
    ? 2
    : Math.max(0, 48 - Math.min(1, mismatchRatio) * 60);
  const score =
    Math.min(24, receipt.items.length * 2.5) +
    averageConfidence * 28 +
    reconciliationScore -
    suspiciousNames * 12 +
    (hasTrustedTotal ? 6 : 0);
  return {
    score,
    itemSubtotal,
    coverage,
    mismatchRatio,
    summaryMismatchRatio,
    suspiciousNames,
    hasPlaceholder,
    hasTrustedSubtotal,
    hasTrustedTotal,
    trustedSummaryFields,
    shouldEnhance:
      hasPlaceholder ||
      suspiciousNames > 0 ||
      !hasTrustedSubtotal ||
      !hasTrustedTotal ||
      (mismatchRatio !== null && mismatchRatio > 0.005) ||
      (receipt.items.length <= 2 && statedSubtotal > itemSubtotal * 1.5),
  };
}

export function shouldCrossCheckServerReceipt(receipt: EditableReceipt) {
  const assessment = assessReceiptScan(receipt);
  const charges = receipt.charges;
  const summaryTotal =
    charges.statedSubtotal +
    charges.tax +
    charges.serviceCharge -
    charges.discount +
    charges.rounding;
  const summaryMismatch = Math.abs(summaryTotal - charges.receiptTotal);
  const summaryTolerance = Math.max(100, Math.round(charges.receiptTotal * 0.01));
  return (
    assessment.shouldEnhance ||
    receipt.items.length >= 20 ||
    (charges.receiptTotal > 0 && summaryMismatch > summaryTolerance)
  );
}

export function selectBestReceiptCandidate(candidates: EditableReceipt[]) {
  if (candidates.length === 0) throw new Error("ocr_no_items");
  return candidates
    .map((receipt, index) => ({ receipt, index, assessment: assessReceiptScan(receipt) }))
    .sort((a, b) => {
      const tier = (assessment: ReceiptScanAssessment) => {
        if (assessment.suspiciousNames > 0) return 0;
        const exactItems =
          assessment.mismatchRatio !== null && assessment.mismatchRatio <= 0.02;
        const coherentSummary =
          assessment.hasTrustedSubtotal &&
          assessment.hasTrustedTotal &&
          assessment.summaryMismatchRatio !== null &&
          assessment.summaryMismatchRatio <= 0.01;
        if (exactItems && coherentSummary) return assessment.hasPlaceholder ? 4 : 5;
        if (exactItems) return assessment.hasPlaceholder ? 2 : 3;
        if (assessment.mismatchRatio !== null && assessment.mismatchRatio <= 0.08) return 2;
        return assessment.coverage === null ? 1 : 0;
      };
      const tierDifference = tier(b.assessment) - tier(a.assessment);
      if (tierDifference !== 0) return tierDifference;
      const trustedSummaryDifference =
        b.assessment.trustedSummaryFields - a.assessment.trustedSummaryFields;
      if (trustedSummaryDifference !== 0) return trustedSummaryDifference;
      if (
        tier(a.assessment) >= 2 &&
        a.receipt.items.length !== b.receipt.items.length
      ) {
        return b.receipt.items.length - a.receipt.items.length;
      }
      const bothUnanchored = a.assessment.coverage === null && b.assessment.coverage === null;
      if (bothUnanchored && a.receipt.items.length !== b.receipt.items.length) {
        return b.receipt.items.length - a.receipt.items.length;
      }
      return (
        b.assessment.score - a.assessment.score ||
        b.receipt.items.length - a.receipt.items.length ||
        a.index - b.index
      );
    })[0]!.receipt;
}

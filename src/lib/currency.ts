const rupiahFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

const integerFormatter = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 0,
});

export function formatRupiah(value: number) {
  return rupiahFormatter.format(value);
}

export function formatInteger(value: number) {
  return integerFormatter.format(value);
}

export function parseIntegerInput(value: string, allowNegative = false) {
  const negative = allowNegative && value.trim().startsWith("-");
  const digits = value.replace(/\D/g, "");
  if (!digits) return 0;
  const parsed = Number(digits);
  if (!Number.isSafeInteger(parsed)) return Number.MAX_SAFE_INTEGER;
  return negative ? -parsed : parsed;
}

export type WeightedRecipient = {
  id: string;
  weight: number;
};

function assertSafeInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} harus berupa integer aman.`);
  }
}

function toSafeNumber(value: bigint, label: string) {
  const result = Number(value);
  assertSafeInteger(result, label);
  return result;
}

/**
 * Allocates non-negative integer money by largest remainder. Ties are resolved
 * by the recipient order supplied by the caller, making every rupiah stable.
 */
export function allocateMoney(
  amount: number,
  recipients: WeightedRecipient[],
): Record<string, number> {
  assertSafeInteger(amount, "Nominal");
  if (amount < 0) {
    throw new RangeError("Nominal alokasi tidak boleh negatif.");
  }
  if (recipients.length === 0) {
    if (amount === 0) return {};
    throw new RangeError("Alokasi membutuhkan setidaknya satu penerima.");
  }

  const seen = new Set<string>();
  for (const recipient of recipients) {
    if (!recipient.id || seen.has(recipient.id)) {
      throw new RangeError("ID penerima alokasi harus unik dan tidak kosong.");
    }
    seen.add(recipient.id);
    assertSafeInteger(recipient.weight, "Bobot");
    if (recipient.weight < 0) {
      throw new RangeError("Bobot alokasi tidak boleh negatif.");
    }
  }

  const totalWeight = recipients.reduce(
    (sum, recipient) => sum + BigInt(recipient.weight),
    0n,
  );
  if (totalWeight === 0n) {
    if (amount === 0) {
      return Object.fromEntries(recipients.map(({ id }) => [id, 0]));
    }
    throw new RangeError("Total bobot harus lebih dari nol.");
  }

  const amountBigInt = BigInt(amount);
  const ranked = recipients.map((recipient, index) => {
    const product = amountBigInt * BigInt(recipient.weight);
    return {
      id: recipient.id,
      index,
      allocation: product / totalWeight,
      remainder: product % totalWeight,
    };
  });

  const baseTotal = ranked.reduce((sum, recipient) => sum + recipient.allocation, 0n);
  let leftover = amountBigInt - baseTotal;

  const remainderOrder = [...ranked].sort((left, right) => {
    if (left.remainder === right.remainder) return left.index - right.index;
    return left.remainder > right.remainder ? -1 : 1;
  });

  for (const recipient of remainderOrder) {
    if (leftover === 0n) break;
    recipient.allocation += 1n;
    leftover -= 1n;
  }

  return Object.fromEntries(
    ranked.map(({ id, allocation }) => [id, toSafeNumber(allocation, "Hasil alokasi")]),
  );
}

export function allocateSignedMoney(
  amount: number,
  recipients: WeightedRecipient[],
): Record<string, number> {
  assertSafeInteger(amount, "Nominal bertanda");
  const sign = amount < 0 ? -1 : 1;
  const allocations = allocateMoney(Math.abs(amount), recipients);
  return Object.fromEntries(
    Object.entries(allocations).map(([id, value]) => [
      id,
      value === 0 ? 0 : value * sign,
    ]),
  );
}

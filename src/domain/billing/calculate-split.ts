import { allocateMoney, allocateSignedMoney } from "./allocate-money";
import { splitInputSchema, type ValidatedSplitInput } from "./schemas";
import type {
  ParticipantAllocation,
  ParticipantItemShare,
  SplitInput,
  SplitResult,
} from "./types";

function safeNumber(value: bigint, message: string) {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) {
    throw new RangeError(message);
  }
  return number;
}

function safeSum(values: number[], message: string) {
  return safeNumber(
    values.reduce((sum, value) => sum + BigInt(value), 0n),
    message,
  );
}

function allocationRecipients(
  input: ValidatedSplitInput,
  participantSubtotals: Map<string, number>,
) {
  return input.participants.map((participant) => ({
    id: participant.id,
    weight: participantSubtotals.get(participant.id) ?? 0,
  }));
}

export function calculateSplit(inputValue: SplitInput | unknown): SplitResult {
  const input = splitInputSchema.parse(inputValue);
  const itemShares = new Map<string, ParticipantItemShare[]>();
  const participantSubtotals = new Map<string, number>();

  for (const participant of input.participants) {
    itemShares.set(participant.id, []);
    participantSubtotals.set(participant.id, 0);
  }

  for (const item of input.items) {
    const assignment = input.assignments.find((entry) => entry.itemId === item.id);
    if (!assignment) {
      throw new Error(`Item ${item.id} belum memiliki pemilik.`);
    }

    const ownerSet = new Set(assignment.participantIds);
    const recipients = input.participants
      .filter((participant) => ownerSet.has(participant.id))
      .map((participant) => ({
        id: participant.id,
        weight: assignment.weights?.[participant.id] ?? 1,
      }));
    const allocations = allocateMoney(item.lineTotal, recipients);

    for (const recipient of recipients) {
      const amount = allocations[recipient.id] ?? 0;
      itemShares.get(recipient.id)?.push({ itemId: item.id, name: item.name, amount });
      participantSubtotals.set(
        recipient.id,
        safeSum(
          [participantSubtotals.get(recipient.id) ?? 0, amount],
          "Subtotal anggota terlalu besar.",
        ),
      );
    }
  }

  const calculatedSubtotal = safeSum(
    input.items.map((item) => item.lineTotal),
    "Subtotal struk terlalu besar.",
  );
  const calculatedTotal = safeNumber(
    BigInt(calculatedSubtotal) +
      BigInt(input.charges.tax) +
      BigInt(input.charges.serviceCharge) -
      BigInt(input.charges.discount) +
      BigInt(input.charges.rounding),
    "Total struk berada di luar rentang aman.",
  );
  if (calculatedTotal < 0) {
    throw new RangeError("Diskon atau pembulatan membuat total menjadi negatif.");
  }

  const recipients = allocationRecipients(input, participantSubtotals);
  const taxShares = allocateMoney(input.charges.tax, recipients);
  const serviceShares = allocateMoney(input.charges.serviceCharge, recipients);
  const discountShares = allocateMoney(input.charges.discount, recipients);
  const roundingShares = allocateSignedMoney(input.charges.rounding, recipients);

  const participantResults: ParticipantAllocation[] = input.participants.map(
    (participant) => {
      const itemSubtotal = participantSubtotals.get(participant.id) ?? 0;
      const taxShare = taxShares[participant.id] ?? 0;
      const serviceShare = serviceShares[participant.id] ?? 0;
      const discountShare = discountShares[participant.id] ?? 0;
      const roundingShare = roundingShares[participant.id] ?? 0;
      const total = safeNumber(
        BigInt(itemSubtotal) +
          BigInt(taxShare) +
          BigInt(serviceShare) -
          BigInt(discountShare) +
          BigInt(roundingShare),
        "Total anggota berada di luar rentang aman.",
      );

      return {
        participant,
        items: itemShares.get(participant.id) ?? [],
        itemSubtotal,
        taxShare,
        serviceShare,
        discountShare,
        roundingShare,
        total,
      };
    },
  );

  const allocatedTotal = safeSum(
    participantResults.map((participant) => participant.total),
    "Total alokasi terlalu besar.",
  );
  if (allocatedTotal !== calculatedTotal) {
    throw new Error("Invariant gagal: jumlah anggota tidak sama dengan total alokasi.");
  }

  const difference = safeNumber(
    BigInt(input.charges.receiptTotal) - BigInt(allocatedTotal),
    "Selisih rekonsiliasi terlalu besar.",
  );
  const subtotalDifference = safeNumber(
    BigInt(input.charges.statedSubtotal) - BigInt(calculatedSubtotal),
    "Selisih subtotal terlalu besar.",
  );

  return {
    participants: participantResults,
    reconciliation: {
      calculatedSubtotal,
      statedSubtotal: input.charges.statedSubtotal,
      subtotalDifference,
      allocatedTotal,
      receiptTotal: input.charges.receiptTotal,
      difference,
      isMatched: difference === 0 && subtotalDifference === 0,
    },
  };
}

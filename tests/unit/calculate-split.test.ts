import { describe, expect, it } from "vitest";
import { allocateMoney } from "@/domain/billing/allocate-money";
import { calculateSplit } from "@/domain/billing/calculate-split";
import type { SplitInput } from "@/domain/billing/types";

function makeInput(overrides: Partial<SplitInput> = {}): SplitInput {
  return {
    items: [{ id: "item-1", name: "Nasi", quantity: 1, unitPrice: 10_000, lineTotal: 10_000 }],
    participants: [
      { id: "person-1", name: "Ayu" },
      { id: "person-2", name: "Bima" },
    ],
    assignments: [{ itemId: "item-1", participantIds: ["person-1"] }],
    charges: {
      statedSubtotal: 10_000,
      tax: 0,
      serviceCharge: 0,
      discount: 0,
      rounding: 0,
      receiptTotal: 10_000,
    },
    ...overrides,
  };
}

describe("allocateMoney", () => {
  it("uses stable recipient order for an odd equal-share remainder", () => {
    expect(
      allocateMoney(1_001, [
        { id: "a", weight: 1 },
        { id: "b", weight: 1 },
      ]),
    ).toEqual({ a: 501, b: 500 });
  });

  it("allocates a weighted remainder to the largest fractional share", () => {
    expect(
      allocateMoney(10, [
        { id: "a", weight: 1 },
        { id: "b", weight: 2 },
      ]),
    ).toEqual({ a: 3, b: 7 });
  });
});

describe("calculateSplit", () => {
  it("calculates one owned item", () => {
    const result = calculateSplit(makeInput());
    expect(result.participants.map(({ total }) => total)).toEqual([10_000, 0]);
    expect(result.reconciliation.isMatched).toBe(true);
  });

  it("keeps two different owned items separate", () => {
    const result = calculateSplit(
      makeInput({
        items: [
          { id: "item-1", name: "Nasi", quantity: 1, unitPrice: 12_000, lineTotal: 12_000 },
          { id: "item-2", name: "Soto", quantity: 1, unitPrice: 18_000, lineTotal: 18_000 },
        ],
        assignments: [
          { itemId: "item-1", participantIds: ["person-1"] },
          { itemId: "item-2", participantIds: ["person-2"] },
        ],
        charges: {
          statedSubtotal: 30_000,
          tax: 0,
          serviceCharge: 0,
          discount: 0,
          rounding: 0,
          receiptTotal: 30_000,
        },
      }),
    );
    expect(result.participants.map(({ total }) => total)).toEqual([12_000, 18_000]);
  });

  it("splits a shared item equally", () => {
    const result = calculateSplit(
      makeInput({
        items: [{ id: "item-1", name: "Tahu", quantity: 1, unitPrice: 20_000, lineTotal: 20_000 }],
        assignments: [{ itemId: "item-1", participantIds: ["person-1", "person-2"] }],
        charges: {
          statedSubtotal: 20_000,
          tax: 0,
          serviceCharge: 0,
          discount: 0,
          rounding: 0,
          receiptTotal: 20_000,
        },
      }),
    );
    expect(result.participants.map(({ total }) => total)).toEqual([10_000, 10_000]);
  });

  it("splits an item by explicit portions and keeps the odd rupiah deterministic", () => {
    const result = calculateSplit(
      makeInput({
        items: [{ id: "item-1", name: "Pizza", quantity: 1, unitPrice: 10_001, lineTotal: 10_001 }],
        assignments: [{
          itemId: "item-1",
          participantIds: ["person-1", "person-2"],
          weights: { "person-1": 2, "person-2": 1 },
        }],
        charges: {
          statedSubtotal: 10_001,
          tax: 0,
          serviceCharge: 0,
          discount: 0,
          rounding: 0,
          receiptTotal: 10_001,
        },
      }),
    );
    expect(result.participants.map(({ itemSubtotal }) => itemSubtotal)).toEqual([6_667, 3_334]);
    expect(result.participants.reduce((sum, participant) => sum + participant.total, 0)).toBe(10_001);
  });

  it("assigns an odd shared-item rupiah deterministically", () => {
    const result = calculateSplit(
      makeInput({
        items: [{ id: "item-1", name: "Air", quantity: 1, unitPrice: 1_001, lineTotal: 1_001 }],
        assignments: [{ itemId: "item-1", participantIds: ["person-2", "person-1"] }],
        charges: {
          statedSubtotal: 1_001,
          tax: 0,
          serviceCharge: 0,
          discount: 0,
          rounding: 0,
          receiptTotal: 1_001,
        },
      }),
    );
    expect(result.participants.map(({ total }) => total)).toEqual([501, 500]);
  });

  it("conserves multiple shared items", () => {
    const result = calculateSplit(
      makeInput({
        items: [
          { id: "item-1", name: "A", quantity: 1, unitPrice: 101, lineTotal: 101 },
          { id: "item-2", name: "B", quantity: 1, unitPrice: 202, lineTotal: 202 },
        ],
        assignments: [
          { itemId: "item-1", participantIds: ["person-1", "person-2"] },
          { itemId: "item-2", participantIds: ["person-1", "person-2"] },
        ],
        charges: {
          statedSubtotal: 303,
          tax: 0,
          serviceCharge: 0,
          discount: 0,
          rounding: 0,
          receiptTotal: 303,
        },
      }),
    );
    expect(result.participants.map(({ total }) => total)).toEqual([152, 151]);
  });

  it("allocates tax and service proportionally to item subtotal", () => {
    const result = calculateSplit(
      makeInput({
        items: [
          { id: "item-1", name: "A", quantity: 1, unitPrice: 100, lineTotal: 100 },
          { id: "item-2", name: "B", quantity: 1, unitPrice: 300, lineTotal: 300 },
        ],
        assignments: [
          { itemId: "item-1", participantIds: ["person-1"] },
          { itemId: "item-2", participantIds: ["person-2"] },
        ],
        charges: {
          statedSubtotal: 400,
          tax: 40,
          serviceCharge: 20,
          discount: 0,
          rounding: 0,
          receiptTotal: 460,
        },
      }),
    );
    expect(result.participants[0]).toMatchObject({ taxShare: 10, serviceShare: 5, total: 115 });
    expect(result.participants[1]).toMatchObject({ taxShare: 30, serviceShare: 15, total: 345 });
  });

  it("allocates discount and signed rounding deterministically", () => {
    const result = calculateSplit(
      makeInput({
        items: [
          { id: "item-1", name: "A", quantity: 1, unitPrice: 100, lineTotal: 100 },
          { id: "item-2", name: "B", quantity: 1, unitPrice: 300, lineTotal: 300 },
        ],
        assignments: [
          { itemId: "item-1", participantIds: ["person-1"] },
          { itemId: "item-2", participantIds: ["person-2"] },
        ],
        charges: {
          statedSubtotal: 400,
          tax: 0,
          serviceCharge: 0,
          discount: 40,
          rounding: -1,
          receiptTotal: 359,
        },
      }),
    );
    expect(result.participants[0]).toMatchObject({ discountShare: 10, roundingShare: 0, total: 90 });
    expect(result.participants[1]).toMatchObject({ discountShare: 30, roundingShare: -1, total: 269 });
  });

  it("rejects duplicate participant names case-insensitively", () => {
    expect(() =>
      calculateSplit(
        makeInput({
          participants: [
            { id: "person-1", name: "Ayu" },
            { id: "person-2", name: " ayu " },
          ],
        }),
      ),
    ).toThrow(/Nama anggota tidak boleh sama/);
  });

  it.each([
    ["zero line total", 0],
    ["negative line total", -1],
    ["unsafe line total", Number.MAX_SAFE_INTEGER + 1],
  ])("rejects %s", (_label, lineTotal) => {
    expect(() =>
      calculateSplit(
        makeInput({
          items: [{ id: "item-1", name: "Nasi", quantity: 1, unitPrice: 10, lineTotal }],
        }),
      ),
    ).toThrow();
  });

  it("rejects missing values", () => {
    const invalid = makeInput() as unknown as Record<string, unknown>;
    invalid.charges = { tax: 0 };
    expect(() => calculateSplit(invalid)).toThrow();
  });

  it("exposes, rather than hides, reconciliation mismatch", () => {
    const result = calculateSplit(
      makeInput({
        charges: {
          statedSubtotal: 9_900,
          tax: 0,
          serviceCharge: 0,
          discount: 0,
          rounding: 0,
          receiptTotal: 10_500,
        },
      }),
    );
    expect(result.reconciliation).toMatchObject({
      subtotalDifference: -100,
      difference: 500,
      isMatched: false,
    });
  });

  it("always conserves the final allocated total for varied odd values", () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const first = seed * 97 + 1;
      const second = seed * 53 + 3;
      const tax = seed % 17;
      const service = seed % 11;
      const discount = seed % 7;
      const rounding = (seed % 5) - 2;
      const total = first + second + tax + service - discount + rounding;
      const result = calculateSplit(
        makeInput({
          items: [
            { id: "item-1", name: "A", quantity: 1, unitPrice: first, lineTotal: first },
            { id: "item-2", name: "B", quantity: 1, unitPrice: second, lineTotal: second },
          ],
          assignments: [
            { itemId: "item-1", participantIds: ["person-1", "person-2"] },
            { itemId: "item-2", participantIds: ["person-2"] },
          ],
          charges: {
            statedSubtotal: first + second,
            tax,
            serviceCharge: service,
            discount,
            rounding,
            receiptTotal: total,
          },
        }),
      );
      expect(result.participants.reduce((sum, participant) => sum + participant.total, 0)).toBe(
        result.reconciliation.allocatedTotal,
      );
    }
  });
});

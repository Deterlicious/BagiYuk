import { describe, expect, it } from "vitest";
import { buildParticipantShareText, buildSettlementText, whatsappShareUrl } from "@/lib/share";

describe("participant share messages", () => {
  it("includes the participant's item allocation and proportional charges", () => {
    const text = buildParticipantShareText({
      merchantName: "Warung Test",
      allocation: {
        participant: { id: "ayu", name: "Ayu" },
        items: [{ itemId: "nasi", name: "Nasi goreng", amount: 35_001 }],
        itemSubtotal: 35_001,
        taxShare: 3_500,
        serviceShare: 1_750,
        discountShare: 250,
        roundingShare: -1,
        total: 40_000,
      },
    });

    expect(text).toContain("Hai Ayu");
    expect(text).toMatch(/Nasi goreng: Rp\s*35\.001/);
    expect(text).toMatch(/Pajak: Rp\s*3\.500/);
    expect(text).toMatch(/Total: Rp\s*40\.000/);
  });

  it("encodes messages for WhatsApp without exposing them in the path", () => {
    const url = whatsappShareUrl("Hai Ayu, total Rp10.000");
    expect(url).toBe("https://wa.me/?text=Hai%20Ayu%2C%20total%20Rp10.000");
  });

  it("creates transfer instructions without changing calculated totals", () => {
    const text = buildSettlementText({
      merchantName: "Warung Test",
      payerName: "Bima",
      result: {
        participants: [
          { participant: { id: "ayu", name: "Ayu" }, items: [], itemSubtotal: 40_000, taxShare: 0, serviceShare: 0, discountShare: 0, roundingShare: 0, total: 40_000 },
          { participant: { id: "bima", name: "Bima" }, items: [], itemSubtotal: 60_000, taxShare: 0, serviceShare: 0, discountShare: 0, roundingShare: 0, total: 60_000 },
        ],
        reconciliation: { calculatedSubtotal: 100_000, statedSubtotal: 100_000, subtotalDifference: 0, allocatedTotal: 100_000, receiptTotal: 100_000, difference: 0, isMatched: true },
      },
    });
    expect(text).toContain("Dibayar dulu oleh Bima");
    expect(text).toMatch(/Ayu → Bima: Rp\s*40\.000/);
    expect(text).not.toContain("Bima → Bima");
  });
});

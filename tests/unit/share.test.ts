import { describe, expect, it } from "vitest";
import { buildParticipantShareText, whatsappShareUrl } from "@/lib/share";

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
});

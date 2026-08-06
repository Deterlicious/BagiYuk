import type { SplitResult } from "@/domain/billing/types";
import { formatRupiah } from "./currency";

export function buildShareText({
  merchantName,
  result,
  hasFees,
}: {
  merchantName: string;
  result: SplitResult;
  hasFees: boolean;
}) {
  const title = merchantName.trim() || "Makan Bareng";
  const lines = result.participants.map(
    ({ participant, total }) => `${participant.name}: ${formatRupiah(total)}`,
  );
  return [
    `BagiYuk — ${title}`,
    "",
    ...lines,
    "",
    `Total: ${formatRupiah(result.reconciliation.allocatedTotal)}`,
    hasFees ? "Pajak dan layanan sudah termasuk." : "Sudah dibagi per pesanan.",
  ].join("\n");
}

export async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("clipboard_unavailable");
}

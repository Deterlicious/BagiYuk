import type { ParticipantAllocation, SplitResult } from "@/domain/billing/types";
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

export function buildParticipantShareText({
  merchantName,
  allocation,
}: {
  merchantName: string;
  allocation: ParticipantAllocation;
}) {
  const title = merchantName.trim() || "makan bareng";
  const itemLines = allocation.items.map(
    (item) => `- ${item.name}: ${formatRupiah(item.amount)}`,
  );
  const feeLines = [
    allocation.taxShare > 0 ? `Pajak: ${formatRupiah(allocation.taxShare)}` : "",
    allocation.serviceShare > 0 ? `Layanan: ${formatRupiah(allocation.serviceShare)}` : "",
    allocation.discountShare > 0 ? `Diskon: -${formatRupiah(allocation.discountShare)}` : "",
    allocation.roundingShare !== 0 ? `Pembulatan: ${formatRupiah(allocation.roundingShare)}` : "",
  ].filter(Boolean);

  return [
    `Hai ${allocation.participant.name}, total kamu untuk ${title}:`,
    "",
    ...itemLines,
    ...(feeLines.length ? ["", ...feeLines] : []),
    "",
    `Total: ${formatRupiah(allocation.total)}`,
    "Dihitung dengan BagiYuk.",
  ].join("\n");
}

export function whatsappShareUrl(text: string) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
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

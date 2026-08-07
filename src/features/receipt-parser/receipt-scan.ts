import type { ReceiptScanStage } from "./paddle-client";

const acceptedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const acceptedExtensions = new Set(["jpg", "jpeg", "png", "webp"]);

export const receiptScanStages: Array<{
  id: ReceiptScanStage;
  label: string;
  detail: string;
}> = [
  { id: "preparing", label: "Menyiapkan foto", detail: "Memotong dan memperjelas struk" },
  { id: "loading-model", label: "Menyalakan pemindai", detail: "Unduhan pertama bisa memerlukan waktu" },
  { id: "reading", label: "Membaca tulisan", detail: "Mendeteksi item, jumlah, dan harga" },
  { id: "finishing", label: "Menyusun hasil", detail: "Menyiapkan data untuk kamu periksa" },
];

export function validateReceiptFile(file: File, maxBytes: number) {
  if (file.size === 0) return "Foto yang dipilih kosong. Pilih foto lain.";
  const extension = file.name.split(".").pop()?.toLocaleLowerCase("en-US") ?? "";
  const hasAcceptedMime = acceptedMimeTypes.has(file.type.toLocaleLowerCase("en-US"));
  const hasFallbackExtension =
    (!file.type || file.type === "application/octet-stream") && acceptedExtensions.has(extension);
  if (!hasAcceptedMime && !hasFallbackExtension) {
    return "Gunakan foto JPG, PNG, atau WebP.";
  }
  if (file.size > maxBytes) {
    return "Ukuran foto maksimal 8 MB. Coba perkecil atau ambil foto baru.";
  }
  return null;
}

export function scanStageIndex(stage: ReceiptScanStage) {
  return receiptScanStages.findIndex((candidate) => candidate.id === stage);
}

export function scanErrorMessage(error: unknown, online: boolean) {
  if (!online) {
    return "Koneksi internet terputus. Pemindaian pertama perlu mengunduh mesin OCR—sambungkan internet lalu coba lagi, atau isi manual.";
  }
  const message = error instanceof Error ? error.message : "";
  if (/ocr_no_items|ocr_empty_result/i.test(message)) {
    return "Tulisan pada foto terdeteksi, tetapi item dan harganya belum bisa disusun. Coba foto yang lebih lurus atau lanjutkan manual.";
  }
  if (/download|fetch|network|http|model|session|wasm/i.test(message)) {
    return "Mesin pemindai belum berhasil dimuat. Periksa koneksi, lalu coba lagi. Foto tetap aman di perangkat ini.";
  }
  return "Struk belum berhasil dibaca. Coba lagi dengan foto yang lebih jelas atau lanjutkan manual.";
}

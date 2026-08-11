import type { ReceiptScanStage } from "./paddle-client";

const acceptedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const acceptedExtensions = new Set(["jpg", "jpeg", "png", "webp"]);

export const receiptScanStages: Array<{
  id: ReceiptScanStage;
  label: string;
  detail: string;
}> = [
  { id: "preparing", label: "Menyiapkan foto", detail: "Memotong dan memperjelas struk" },
  { id: "server-reading", label: "Membaca lebih teliti", detail: "Pemindai pintar memeriksa teks dan posisi" },
  { id: "local-fallback", label: "Beralih ke perangkat", detail: "Pemindai lokal mengecek ulang atau mengambil alih tanpa kuota tambahan" },
  { id: "loading-model", label: "Menyalakan pemindai", detail: "Unduhan pertama bisa memerlukan waktu" },
  { id: "reading", label: "Membaca tulisan", detail: "Mendeteksi item, jumlah, dan harga" },
  { id: "enhancing", label: "Memperjelas hasil", detail: "Mencoba ulang bagian yang belum cocok" },
  { id: "finishing", label: "Menyusun hasil", detail: "Menyiapkan data untuk kamu periksa" },
];

export type ReceiptScanPath = "local" | "server" | "fallback";

export function receiptScanStagesFor(path: ReceiptScanPath) {
  if (path === "server") {
    return receiptScanStages.filter((stage) =>
      ["preparing", "server-reading", "finishing"].includes(stage.id),
    );
  }
  if (path === "local") {
    return receiptScanStages.filter(
      (stage) => stage.id !== "server-reading" && stage.id !== "local-fallback",
    );
  }
  return receiptScanStages;
}

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

export function scanStageIndex(
  stage: ReceiptScanStage,
  stages = receiptScanStages,
) {
  return stages.findIndex((candidate) => candidate.id === stage);
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

export function scanErrorDetail(error: unknown) {
  if (!(error instanceof Error)) return "Kesalahan pemindai tidak dikenal";
  const detail = `${error.name}: ${error.message}`
    .replace(/https?:\/\/\S+/g, "resource eksternal")
    .replace(/\s+/g, " ")
    .trim();
  return detail.slice(0, 180);
}

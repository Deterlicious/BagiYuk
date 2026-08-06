"use client";

import { Camera, FileImage, ImagePlus, Info, LoaderCircle, RotateCw, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { editableReceiptSchema } from "@/domain/receipt/schemas";
import type { EditableReceipt } from "@/domain/receipt/types";
import { parseReceiptInBrowser } from "@/features/receipt-parser/paddle-client";

const MAX_FILE_SIZE = 8 * 1024 * 1024;
const acceptedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export function ReceiptInputStep({
  onManual,
  onSample,
  onParsed,
}: {
  onManual: () => void;
  onSample: () => void;
  onParsed: (receipt: EditableReceipt) => void;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<
    "idle" | "preparing" | "loading-model" | "reading" | "finishing"
  >("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function chooseFile(selectedFile?: File) {
    if (!selectedFile) return;
    setError("");
    if (!acceptedTypes.has(selectedFile.type)) {
      setError("Gunakan foto JPG, PNG, atau WebP.");
      return;
    }
    if (selectedFile.size > MAX_FILE_SIZE) {
      setError("Ukuran foto maksimal 8 MB. Coba perkecil atau ambil foto baru.");
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(selectedFile);
    setPreviewUrl(URL.createObjectURL(selectedFile));
  }

  function removeFile() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    setError("");
    if (cameraRef.current) cameraRef.current.value = "";
    if (galleryRef.current) galleryRef.current.value = "";
  }

  async function parseReceipt() {
    if (!file || status !== "idle") return;
    setError("");
    setStatus("preparing");

    try {
      const parsed = await parseReceiptInBrowser(file, setStatus);
      setStatus("finishing");
      const receipt = editableReceiptSchema.parse(parsed);
      onParsed(receipt);
    } catch {
      setStatus("idle");
      setError("Struk belum berhasil dibaca. Foto tetap tersimpan di layar—coba lagi atau lanjut manual.");
    }
  }

  const isParsing = status !== "idle";
  const statusLabel =
    status === "preparing"
      ? "Menyiapkan foto…"
      : status === "loading-model"
        ? "Menyiapkan model OCR di perangkat…"
      : status === "reading"
        ? "Membaca item dan harga…"
        : status === "finishing"
          ? "Merapikan hasil…"
          : "";

  return (
    <section className="mx-auto max-w-[820px]">
      <div className="max-w-[660px]">
        <p className="text-sm font-extrabold tracking-[0.1em] text-brand uppercase">Masukkan struk</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.045em] sm:text-4xl">
          Mulai dari foto atau isi sendiri.
        </h1>
        <p className="mt-3 text-base leading-7 text-muted">
          OCR berjalan langsung di perangkat untuk membantu mengetik ulang. Kamu tetap memeriksa semua angka sebelum dibagikan.
        </p>
      </div>

      <div className="mt-8 rounded-[20px] border border-line bg-surface p-4 shadow-[0_10px_35px_rgba(49,43,31,0.08)] sm:p-6">
        {previewUrl ? (
          <div>
            <div className="relative overflow-hidden rounded-2xl border border-line bg-[#eee9df]">
              {/* A user-selected blob URL stays in memory and is never persisted. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt="Pratinjau foto struk" className="max-h-[460px] w-full object-contain" />
              {!isParsing && (
                <button
                  type="button"
                  className="absolute top-3 right-3 grid size-12 place-items-center rounded-xl border border-line bg-white/95 text-ink shadow-md transition hover:bg-white focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/25"
                  onClick={removeFile}
                  aria-label="Hapus foto struk"
                >
                  <X aria-hidden="true" size={20} />
                </button>
              )}
            </div>

            <div aria-live="polite" className="mt-5">
              {isParsing ? (
                <div className="flex min-h-14 items-center gap-3 rounded-xl border border-brand/20 bg-brand/5 px-4 text-sm font-bold text-brand-strong">
                  <LoaderCircle className="animate-spin" aria-hidden="true" size={20} />
                  {statusLabel}
                </div>
              ) : (
                <Button className="w-full" onClick={parseReceipt}>
                  <Sparkles aria-hidden="true" size={19} />
                  Baca struk
                </Button>
              )}
            </div>

            {error && (
              <div className="mt-4 rounded-xl border border-danger/25 bg-red-50 p-4" role="alert">
                <p className="text-sm leading-6 font-bold text-danger">{error}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="secondary" size="small" onClick={parseReceipt}>
                    <RotateCw aria-hidden="true" size={16} />
                    Coba scan lagi
                  </Button>
                  <Button variant="ghost" size="small" onClick={onManual}>
                    Masukkan manual
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              ref={cameraRef}
              className="sr-only"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(event) => chooseFile(event.target.files?.[0])}
              aria-label="Ambil foto struk"
            />
            <input
              ref={galleryRef}
              className="sr-only"
              type="file"
              accept="image/*"
              onChange={(event) => chooseFile(event.target.files?.[0])}
              aria-label="Pilih foto struk dari galeri"
            />

            <button
              type="button"
              className="group flex min-h-44 flex-col items-center justify-center rounded-2xl border-2 border-brand bg-brand px-5 text-center text-white shadow-[0_3px_0_var(--brand-strong)] transition hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/25 sm:min-h-56"
              onClick={() => cameraRef.current?.click()}
            >
              <span className="grid size-14 place-items-center rounded-2xl bg-white/12 transition group-hover:scale-105">
                <Camera aria-hidden="true" size={28} />
              </span>
              <span className="mt-4 text-lg font-extrabold">Ambil foto struk</span>
              <span className="mt-1 text-sm text-white/75">Buka kamera belakang</span>
            </button>

            <button
              type="button"
              className="group flex min-h-36 flex-col items-center justify-center rounded-2xl border border-line bg-white px-5 text-center text-ink shadow-sm transition hover:border-brand hover:text-brand-strong focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/25 sm:min-h-56"
              onClick={() => galleryRef.current?.click()}
            >
              <span className="grid size-14 place-items-center rounded-2xl bg-canvas transition group-hover:scale-105">
                <ImagePlus aria-hidden="true" size={27} />
              </span>
              <span className="mt-4 text-lg font-extrabold">Pilih dari galeri</span>
              <span className="mt-1 text-sm text-muted">JPG, PNG, atau WebP · maks. 8 MB</span>
            </button>
          </div>
        )}

        {!previewUrl && (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Button variant="ghost" className="w-full" onClick={onManual}>
              <FileImage aria-hidden="true" size={18} />
              Masukkan manual
            </Button>
            <Button variant="ghost" className="w-full" onClick={onSample}>
              <Sparkles aria-hidden="true" size={18} />
              Pakai data contoh
            </Button>
          </div>
        )}
      </div>

      <aside className="mt-5 flex gap-3 rounded-2xl border border-line bg-[#f1ecdf] p-4 text-sm leading-6 text-muted">
        <Info className="mt-0.5 shrink-0 text-brand" aria-hidden="true" size={19} />
        <p>
          <strong className="text-ink">Supaya mudah dibaca:</strong> ratakan struk, cari cahaya terang, dan pastikan total tidak terpotong. Pemindaian pertama mengunduh model OCR sekitar 31 MB.
        </p>
      </aside>
    </section>
  );
}

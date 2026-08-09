"use client";

import {
  Camera,
  Check,
  Circle,
  Clock3,
  FileImage,
  ImagePlus,
  Info,
  LoaderCircle,
  RotateCw,
  ScanLine,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { editableReceiptSchema } from "@/domain/receipt/schemas";
import type { EditableReceipt } from "@/domain/receipt/types";
import { trackProductEvent } from "@/lib/analytics";
import { rotateReceiptImage } from "@/lib/image-client";
import {
  cancelReceiptParsing,
  parseReceiptInBrowser,
  type ReceiptScanStage,
} from "@/features/receipt-parser/paddle-client";
import {
  receiptScanStages,
  scanErrorDetail,
  scanErrorMessage,
  scanStageIndex,
  validateReceiptFile,
} from "@/features/receipt-parser/receipt-scan";

const MAX_FILE_SIZE = 8 * 1024 * 1024;
const SCAN_TIMEOUT_MS = 120_000;

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
  const scanControllerRef = useRef<AbortController | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | ReceiptScanStage>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState("");
  const [errorDetail, setErrorDetail] = useState("");
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (status === "idle") return;
    const timer = window.setInterval(() => setElapsedSeconds((value) => value + 1), 1_000);
    return () => window.clearInterval(timer);
  }, [status]);

  useEffect(() => {
    return () => {
      if (!scanControllerRef.current) return;
      scanControllerRef.current.abort("unmount");
      scanControllerRef.current = null;
      void cancelReceiptParsing();
    };
  }, []);

  function chooseFile(selectedFile?: File) {
    if (!selectedFile) return;
    setError("");
    setErrorDetail("");
    const validationError = validateReceiptFile(selectedFile, MAX_FILE_SIZE);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(selectedFile);
    setImageSize(null);
    setPreviewUrl(URL.createObjectURL(selectedFile));
    void parseReceipt(selectedFile);
  }

  function removeFile() {
    if (scanControllerRef.current) {
      scanControllerRef.current.abort("removed");
      scanControllerRef.current = null;
      void cancelReceiptParsing();
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    setStatus("idle");
    setElapsedSeconds(0);
    setError("");
    setErrorDetail("");
    setImageSize(null);
    if (cameraRef.current) cameraRef.current.value = "";
    if (galleryRef.current) galleryRef.current.value = "";
  }

  async function rotatePhoto() {
    if (!file || isParsing) return;
    const rotated = await rotateReceiptImage(file);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(rotated);
    setPreviewUrl(URL.createObjectURL(rotated));
    setImageSize(null);
    setError("");
    setErrorDetail("");
    void parseReceipt(rotated);
  }

  async function parseReceipt(selectedFile = file) {
    if (!selectedFile || scanControllerRef.current) return;
    const controller = new AbortController();
    scanControllerRef.current = controller;
    setError("");
    setErrorDetail("");
    setElapsedSeconds(0);
    setStatus("preparing");
    trackProductEvent("scan_started");
    let timeout = 0;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = window.setTimeout(() => {
        controller.abort("timeout");
        reject(new DOMException("Receipt scan timed out", "AbortError"));
      }, SCAN_TIMEOUT_MS);
    });

    try {
      const parsed = await Promise.race([
        parseReceiptInBrowser(
          selectedFile,
          (nextStatus) => {
            if (!controller.signal.aborted) setStatus(nextStatus);
          },
          controller.signal,
        ),
        timeoutPromise,
      ]);
      const receipt = editableReceiptSchema.parse(parsed);
      controller.signal.throwIfAborted();
      scanControllerRef.current = null;
      trackProductEvent("scan_succeeded");
      onParsed(receipt);
    } catch (scanError) {
      if (scanControllerRef.current === controller) scanControllerRef.current = null;
      setStatus("idle");
      if (["removed", "unmount", "user"].includes(String(controller.signal.reason))) return;
      if (controller.signal.reason === "timeout") {
        trackProductEvent("scan_failed");
        void cancelReceiptParsing();
        setError("Pemindaian melewati 2 menit dan dihentikan. Coba lagi dengan foto lebih kecil atau lanjutkan manual.");
        return;
      }
      setError(scanErrorMessage(scanError, navigator.onLine));
      setErrorDetail(scanErrorDetail(scanError));
      trackProductEvent("scan_failed");
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function cancelScan(reason: "user" | "manual" = "user") {
    scanControllerRef.current?.abort(reason);
    scanControllerRef.current = null;
    setStatus("idle");
    setElapsedSeconds(0);
    if (reason === "user") {
      setError("Pemindaian dibatalkan. Foto masih tersedia untuk dicoba lagi atau diganti.");
    }
    void cancelReceiptParsing();
  }

  function continueManually() {
    cancelScan("manual");
    onManual();
  }

  const isParsing = status !== "idle";
  const activeStageIndex = status === "idle" ? -1 : scanStageIndex(status);
  const activeStage = activeStageIndex >= 0 ? receiptScanStages[activeStageIndex] : null;

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
              <img
                src={previewUrl}
                alt="Pratinjau foto struk"
                className="max-h-[460px] w-full object-contain"
                onLoad={(event) => setImageSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
              />
              {isParsing && <span className="scan-line" aria-hidden="true" />}
              {!isParsing && (
                <div className="absolute top-3 right-3 flex gap-2">
                  <button
                    type="button"
                    className="grid size-12 place-items-center rounded-xl border border-line bg-white/95 text-ink shadow-md transition hover:bg-white focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/25"
                    onClick={() => void rotatePhoto()}
                    aria-label="Putar foto 90 derajat"
                  >
                    <RotateCw aria-hidden="true" size={20} />
                  </button>
                  <button
                    type="button"
                    className="grid size-12 place-items-center rounded-xl border border-line bg-white/95 text-ink shadow-md transition hover:bg-white focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/25"
                    onClick={removeFile}
                    aria-label="Hapus foto struk"
                  >
                    <X aria-hidden="true" size={20} />
                  </button>
                </div>
              )}
            </div>

            <div className="mt-3 grid gap-2 rounded-xl border border-line bg-canvas/70 p-3 text-xs sm:grid-cols-3">
              <p className="flex items-center gap-2 font-bold text-success"><Check aria-hidden="true" size={15} /> Foto berhasil dimuat</p>
              <p className="flex items-center gap-2 font-bold text-brand-strong"><ScanLine aria-hidden="true" size={15} /> Fokus struk otomatis</p>
              <p className={`flex items-center gap-2 font-bold ${imageSize && Math.max(imageSize.width, imageSize.height) >= 1200 ? "text-success" : "text-warning"}`}>
                {imageSize && Math.max(imageSize.width, imageSize.height) >= 1200 ? <Check aria-hidden="true" size={15} /> : <Info aria-hidden="true" size={15} />}
                {imageSize ? `${imageSize.width} × ${imageSize.height} px` : "Memeriksa resolusi"}
              </p>
            </div>

            <div aria-live="polite" className="mt-5">
              {isParsing ? (
                <div className="overflow-hidden rounded-2xl border border-brand/20 bg-brand/5" role="status">
                  <div className="flex items-start gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand text-white">
                      <LoaderCircle className="animate-spin" aria-hidden="true" size={21} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-extrabold text-brand-strong">{activeStage?.label}…</p>
                        <span className="price inline-flex items-center gap-1.5 text-xs font-bold text-muted">
                          <Clock3 aria-hidden="true" size={14} />
                          {elapsedSeconds} detik
                        </span>
                      </div>
                      <p className="mt-1 text-sm leading-6 text-muted">{activeStage?.detail}</p>
                    </div>
                  </div>

                  <div
                    className="mx-4 mt-4 h-2 overflow-hidden rounded-full bg-brand/10 sm:mx-5"
                    role="progressbar"
                    aria-label="Tahap pemindaian struk"
                    aria-valuemin={1}
                    aria-valuemax={receiptScanStages.length}
                    aria-valuenow={activeStageIndex + 1}
                    aria-valuetext={`${activeStage?.label ?? "Memindai"}, tahap ${activeStageIndex + 1} dari ${receiptScanStages.length}`}
                  >
                    <span
                      className="block h-full rounded-full bg-brand transition-[width] duration-500"
                      style={{ width: `${((activeStageIndex + 1) / receiptScanStages.length) * 100}%` }}
                    />
                  </div>

                  <ol className="grid gap-2 px-4 py-4 sm:grid-cols-2 sm:px-5">
                    {receiptScanStages.map((scanStage, index) => {
                      const isComplete = index < activeStageIndex;
                      const isActive = index === activeStageIndex;
                      return (
                        <li
                          key={scanStage.id}
                          className={`flex items-center gap-2 text-xs font-bold ${
                            isActive ? "text-brand-strong" : isComplete ? "text-success" : "text-muted/65"
                          }`}
                        >
                          {isComplete ? (
                            <Check aria-hidden="true" size={16} />
                          ) : isActive ? (
                            <LoaderCircle className="animate-spin" aria-hidden="true" size={16} />
                          ) : (
                            <Circle aria-hidden="true" size={14} />
                          )}
                          {scanStage.label}
                        </li>
                      );
                    })}
                  </ol>

                  {elapsedSeconds >= 8 && (
                    <p className="border-t border-brand/15 px-4 py-3 text-xs leading-5 text-muted sm:px-5">
                      Aplikasi masih bekerja. Scan pertama lebih lama karena mesin OCR diunduh sekali; scan berikutnya biasanya lebih cepat.
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2 border-t border-brand/15 px-4 py-3 sm:px-5">
                    <Button variant="ghost" size="small" onClick={() => cancelScan()}>
                      Batalkan scan
                    </Button>
                    {elapsedSeconds >= 12 && (
                      <Button variant="secondary" size="small" onClick={continueManually}>
                        Isi manual saja
                      </Button>
                    )}
                  </div>
                </div>
              ) : !error ? (
                <Button className="w-full" onClick={() => void parseReceipt()}>
                  <Sparkles aria-hidden="true" size={19} />
                  Coba baca lagi
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              ref={cameraRef}
              className="sr-only"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(event) => {
                chooseFile(event.target.files?.[0]);
                event.currentTarget.value = "";
              }}
              aria-label="Ambil foto struk"
            />
            <input
              ref={galleryRef}
              className="sr-only"
              type="file"
              accept="image/*"
              onChange={(event) => {
                chooseFile(event.target.files?.[0]);
                event.currentTarget.value = "";
              }}
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

        {error && (
          <div className="mt-4 rounded-xl border border-danger/25 bg-red-50 p-4" role="alert">
            <p className="text-sm leading-6 font-bold text-danger">{error}</p>
            {errorDetail && (
              <details className="mt-2 text-xs leading-5 text-muted">
                <summary className="cursor-pointer font-bold text-ink">Lihat detail teknis</summary>
                <code className="mt-1 block break-words">{errorDetail}</code>
              </details>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {file && (
                <Button variant="secondary" size="small" onClick={() => void parseReceipt()}>
                  <RotateCw aria-hidden="true" size={16} />
                  Coba scan lagi
                </Button>
              )}
              <Button variant="ghost" size="small" onClick={file ? removeFile : () => galleryRef.current?.click()}>
                {file ? "Ganti foto" : "Pilih foto lain"}
              </Button>
              <Button variant="ghost" size="small" onClick={continueManually}>
                Masukkan manual
              </Button>
            </div>
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

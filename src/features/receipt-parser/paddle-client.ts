import { prepareReceiptImage } from "@/lib/image-client";
import { receiptFromOcrLines } from "./paddle-receipt-parser";

type PaddleModule = typeof import("@paddleocr/paddleocr-js");
type PaddleInstance = Awaited<ReturnType<PaddleModule["PaddleOCR"]["create"]>>;

export type ReceiptScanStage = "preparing" | "loading-model" | "reading" | "finishing";

let paddlePromise: Promise<PaddleInstance> | null = null;

function availableThreadCount() {
  // ONNX Runtime only enables threaded WASM inside a cross-origin isolated page.
  // Zero lets it choose a conservative count based on the device's CPU.
  return globalThis.crossOriginIsolated ? 0 : 1;
}

async function getPaddleOcr() {
  if (!paddlePromise) {
    paddlePromise = import("@paddleocr/paddleocr-js")
      .then(({ PaddleOCR }) =>
        PaddleOCR.create({
          lang: "id",
          ocrVersion: "PP-OCRv6",
          worker: true,
          textRecognitionBatchSize: 8,
          ortOptions: {
            backend: "wasm",
            wasmPaths: "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/",
            numThreads: availableThreadCount(),
            simd: true,
          },
        }),
      )
      .catch((error) => {
        paddlePromise = null;
        throw error;
      });
  }
  return paddlePromise;
}

export async function cancelReceiptParsing() {
  const activePaddle = paddlePromise;
  paddlePromise = null;
  if (!activePaddle) return;
  try {
    const paddle = await activePaddle;
    await paddle.dispose();
  } catch {
    // Cancellation is best effort; the next scan creates a fresh worker either way.
  }
}

export async function parseReceiptInBrowser(
  file: File,
  onStage?: (stage: ReceiptScanStage) => void,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  onStage?.("preparing");
  const prepared = await prepareReceiptImage(file);
  signal?.throwIfAborted();
  onStage?.("loading-model");
  const ocr = await getPaddleOcr();
  signal?.throwIfAborted();
  onStage?.("reading");
  const [result] = await ocr.predict(prepared, {
    textDetLimitSideLen: 2_400,
    textDetLimitType: "max",
    textDetMaxSideLimit: 3_200,
    textRecScoreThresh: 0.32,
  });
  signal?.throwIfAborted();
  if (!result) throw new Error("ocr_empty_result");
  onStage?.("finishing");
  return receiptFromOcrLines(result.items);
}

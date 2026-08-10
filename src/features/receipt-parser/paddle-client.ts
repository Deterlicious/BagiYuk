import { prepareReceiptImageVariants } from "@/lib/image-client";
import {
  assessReceiptScan,
  receiptFromOcrLines,
  selectBestReceiptCandidate,
} from "./paddle-receipt-parser";

type PaddleModule = typeof import("@paddleocr/paddleocr-js");
type PaddleInstance = Awaited<ReturnType<PaddleModule["PaddleOCR"]["create"]>>;

export type ReceiptScanStage =
  | "preparing"
  | "loading-model"
  | "reading"
  | "enhancing"
  | "finishing";

let paddlePromise: Promise<PaddleInstance> | null = null;

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
            numThreads: 1,
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
  const preparedVariants = await prepareReceiptImageVariants(file);
  const primaryImage = preparedVariants[0] ?? file;
  signal?.throwIfAborted();
  onStage?.("loading-model");
  const ocr = await getPaddleOcr();
  signal?.throwIfAborted();
  onStage?.("reading");
  const [result] = await ocr.predict(primaryImage, {
    textDetLimitSideLen: 2_400,
    textDetLimitType: "max",
    textDetMaxSideLimit: 3_200,
    textDetThresh: 0.25,
    textDetBoxThresh: 0.42,
    textDetUnclipRatio: 1.8,
    textRecScoreThresh: 0.27,
  });
  signal?.throwIfAborted();
  if (!result) throw new Error("ocr_empty_result");
  const candidates = [];
  let primaryError: unknown = null;
  try {
    candidates.push(receiptFromOcrLines(result.items));
  } catch (error) {
    primaryError = error;
  }

  const primaryNeedsEnhancement =
    candidates.length === 0 || assessReceiptScan(candidates[0]!).shouldEnhance;
  const enhancedImage = preparedVariants[1];
  if (primaryNeedsEnhancement && enhancedImage && enhancedImage !== primaryImage) {
    signal?.throwIfAborted();
    onStage?.("enhancing");
    const [enhancedResult] = await ocr.predict(enhancedImage, {
      textDetLimitSideLen: 2_800,
      textDetLimitType: "max",
      textDetMaxSideLimit: 3_200,
      textDetThresh: 0.2,
      textDetBoxThresh: 0.34,
      textDetUnclipRatio: 1.95,
      textRecScoreThresh: 0.22,
    });
    signal?.throwIfAborted();
    if (enhancedResult) {
      try {
        candidates.push(receiptFromOcrLines(enhancedResult.items));
      } catch {
        // Keep the primary candidate when the enhanced pass only adds noise.
      }
    }
  }
  if (candidates.length === 0) throw primaryError ?? new Error("ocr_no_items");
  onStage?.("finishing");
  return selectBestReceiptCandidate(candidates);
}

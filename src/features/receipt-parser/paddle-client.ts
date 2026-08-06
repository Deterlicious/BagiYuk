import { prepareReceiptImage } from "@/lib/image-client";
import { receiptFromOcrLines } from "./paddle-receipt-parser";

type PaddleModule = typeof import("@paddleocr/paddleocr-js");
type PaddleInstance = Awaited<ReturnType<PaddleModule["PaddleOCR"]["create"]>>;

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
            wasmPaths: "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.3/dist/",
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

export async function parseReceiptInBrowser(
  file: File,
  onStage?: (stage: "preparing" | "loading-model" | "reading") => void,
) {
  onStage?.("preparing");
  const prepared = await prepareReceiptImage(file);
  onStage?.("loading-model");
  const ocr = await getPaddleOcr();
  onStage?.("reading");
  const [result] = await ocr.predict(prepared, {
    textDetLimitSideLen: 2_400,
    textDetLimitType: "max",
    textDetMaxSideLimit: 3_200,
    textRecScoreThresh: 0.32,
  });
  if (!result) throw new Error("ocr_empty_result");
  return receiptFromOcrLines(result.items);
}

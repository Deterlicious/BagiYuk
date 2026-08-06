import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import { normalizeAiReceipt } from "@/domain/receipt/normalize";
import { CloudflareReceiptParserProvider, type WorkersAiBinding } from "@/features/receipt-parser/cloudflare-provider";
import { MockReceiptParserProvider } from "@/features/receipt-parser/mock-provider";
import { ReceiptParserError, type ReceiptParserProvider } from "@/features/receipt-parser/provider";
import { bytesToBase64, getImageDimensions } from "@/lib/image";

const MAX_FILE_SIZE = 8 * 1024 * 1024;
const MAX_DIMENSION = 12_000;
const MIN_DIMENSION = 80;
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const allowedExtensions = new Set(["jpg", "jpeg", "png", "webp"]);
const requestBuckets = new Map<string, { count: number; resetAt: number }>();

function errorResponse(message: string, code: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

function isRateLimited(request: Request) {
  const key = request.headers.get("cf-connecting-ip") ?? "local";
  const now = Date.now();
  const bucket = requestBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    requestBuckets.set(key, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  bucket.count += 1;
  return bucket.count > 8;
}

async function getProvider(): Promise<ReceiptParserProvider> {
  const providerName = process.env.RECEIPT_AI_PROVIDER ?? "mock";
  if (providerName !== "cloudflare") return new MockReceiptParserProvider();

  const { env } = await getCloudflareContext({ async: true });
  const ai = (env as CloudflareEnv & { AI?: WorkersAiBinding }).AI;
  if (!ai) {
    throw new ReceiptParserError("not_configured", "Binding Workers AI belum tersedia.");
  }
  const model =
    (env as CloudflareEnv & { RECEIPT_AI_MODEL?: string }).RECEIPT_AI_MODEL ??
    process.env.RECEIPT_AI_MODEL ??
    "@cf/moondream/moondream3.1-9B-A2B";
  return new CloudflareReceiptParserProvider(ai, model);
}

async function withTimeout<T>(promise: Promise<T>, milliseconds: number) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new ReceiptParserError("timeout", "Pemrosesan struk melewati batas waktu.")),
          milliseconds,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function POST(request: Request) {
  if (isRateLimited(request)) {
    return errorResponse(
      "Terlalu banyak percobaan dalam waktu singkat. Tunggu sebentar atau masukkan manual.",
      "rate_limited",
      429,
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse("Upload foto tidak dapat dibaca.", "invalid_form", 400);
  }

  const receipt = formData.get("receipt");
  if (!(receipt instanceof File)) {
    return errorResponse("Pilih satu foto struk terlebih dahulu.", "missing_file", 400);
  }
  if (!allowedTypes.has(receipt.type)) {
    return errorResponse("Gunakan foto JPG, PNG, atau WebP.", "invalid_type", 415);
  }
  const extension = receipt.name.split(".").pop()?.toLocaleLowerCase("en-US");
  if (!extension || !allowedExtensions.has(extension)) {
    return errorResponse("Ekstensi foto harus JPG, PNG, atau WebP.", "invalid_extension", 415);
  }
  if (receipt.size === 0 || receipt.size > MAX_FILE_SIZE) {
    return errorResponse("Ukuran foto harus antara 1 byte dan 8 MB.", "invalid_size", 413);
  }

  const bytes = new Uint8Array(await receipt.arrayBuffer());
  const dimensions = getImageDimensions(bytes, receipt.type);
  if (
    !dimensions ||
    dimensions.width < MIN_DIMENSION ||
    dimensions.height < MIN_DIMENSION ||
    dimensions.width > MAX_DIMENSION ||
    dimensions.height > MAX_DIMENSION
  ) {
    return errorResponse(
      "Dimensi foto tidak valid. Gunakan foto utuh berukuran wajar.",
      "invalid_dimensions",
      422,
    );
  }

  try {
    const provider = await getProvider();
    const parsed = await withTimeout(
      provider.parse({
        mimeType: receipt.type as "image/jpeg" | "image/png" | "image/webp",
        base64: bytesToBase64(bytes),
      }),
      25_000,
    );
    return NextResponse.json({ receipt: normalizeAiReceipt(parsed), provider: provider.name });
  } catch (error) {
    const code = error instanceof ReceiptParserError ? error.code : "provider_unavailable";
    return errorResponse(
      "Struk belum berhasil dibaca. Coba lagi atau lanjutkan dengan input manual.",
      code,
      code === "not_configured" ? 503 : 502,
    );
  }
}

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import { normalizeAiReceipt } from "@/domain/receipt/normalize";
import {
  CloudRunReceiptParserProvider,
  normalizeCloudRunProviderConfig,
  type CloudRunProviderConfig,
} from "@/features/receipt-parser/cloud-run-provider";
import {
  CloudflareReceiptParserProvider,
  type WorkersAiBinding,
} from "@/features/receipt-parser/cloudflare-provider";
import { MockReceiptParserProvider } from "@/features/receipt-parser/mock-provider";
import { ReceiptParserError, type ReceiptParserProvider } from "@/features/receipt-parser/provider";
import {
  getOrCreateAnonymousDeviceId,
  hashScanIdentity,
  reserveScanQuota,
  SERVER_SCAN_LIMITS,
  type ScanQuotaDatabase,
  verifyTurnstileToken,
} from "@/features/receipt-parser/scan-security";
import { getImageDimensions } from "@/lib/image";

const MAX_FILE_SIZE = 4 * 1024 * 1024;
const MAX_PIXELS = 20_000_000;
const MAX_DIMENSION = 8_000;
const MIN_DIMENSION = 120;
const DEVICE_COOKIE = "bagiyuk_scan_device";
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

type RuntimeEnv = CloudflareEnv & {
  AI?: WorkersAiBinding;
  OCR_QUOTA?: ScanQuotaDatabase;
  OCR_QUOTA_SECRET?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_EXPECTED_HOSTNAME?: string;
  CLOUD_RUN_OCR_URL?: string;
  GOOGLE_SERVICE_ACCOUNT_EMAIL?: string;
  GOOGLE_WIF_AUDIENCE?: string;
  GOOGLE_WIF_ISSUER?: string;
  GOOGLE_WIF_SUBJECT?: string;
  GOOGLE_WIF_PRIVATE_KEY?: string;
  GOOGLE_WIF_KEY_ID?: string;
  RECEIPT_AI_PROVIDER?: string;
  RECEIPT_AI_MODEL?: string;
  RECEIPT_AI_FALLBACK_MODEL?: string;
};

function errorResponse(message: string, code: string, status: number, headers?: HeadersInit) {
  return NextResponse.json({ error: { code, message } }, { status, headers });
}

async function readBoundedBody(request: Request, maximumBytes: number) {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel("body_too_large");
        throw new Error("body_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function cookieValue(request: Request, name: string) {
  const source = request.headers.get("cookie") ?? "";
  for (const part of source.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) {
      try {
        return decodeURIComponent(value.join("="));
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

function attachDeviceCookie(response: NextResponse, id: string, created: boolean) {
  if (!created) return response;
  response.cookies.set(DEVICE_COOKIE, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 365 * 24 * 60 * 60,
    path: "/",
  });
  return response;
}

async function getRuntimeEnv(): Promise<RuntimeEnv> {
  if (process.env.NODE_ENV !== "production") {
    return process.env as unknown as RuntimeEnv;
  }
  try {
    const { env } = await getCloudflareContext({ async: true });
    return env as RuntimeEnv;
  } catch {
    return process.env as unknown as RuntimeEnv;
  }
}

function serverOcrConfigured(env: RuntimeEnv) {
  return (
    env.RECEIPT_AI_PROVIDER === "cloudrun" &&
    Boolean(
      env.OCR_QUOTA &&
        env.OCR_QUOTA_SECRET &&
        env.TURNSTILE_SITE_KEY &&
        env.TURNSTILE_SECRET_KEY &&
        env.TURNSTILE_EXPECTED_HOSTNAME &&
        cloudRunConfig(env),
    )
  );
}

function cloudRunConfig(env: RuntimeEnv): CloudRunProviderConfig | null {
  if (
    !env.CLOUD_RUN_OCR_URL ||
    !env.GOOGLE_SERVICE_ACCOUNT_EMAIL ||
    !env.GOOGLE_WIF_AUDIENCE ||
    !env.GOOGLE_WIF_ISSUER ||
    !env.GOOGLE_WIF_SUBJECT ||
    !env.GOOGLE_WIF_PRIVATE_KEY ||
    !env.GOOGLE_WIF_KEY_ID
  ) {
    return null;
  }
  return normalizeCloudRunProviderConfig({
    url: env.CLOUD_RUN_OCR_URL,
    serviceAccountEmail: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    wifAudience: env.GOOGLE_WIF_AUDIENCE,
    wifIssuer: env.GOOGLE_WIF_ISSUER,
    wifSubject: env.GOOGLE_WIF_SUBJECT,
    wifPrivateKey: env.GOOGLE_WIF_PRIVATE_KEY,
    wifKeyId: env.GOOGLE_WIF_KEY_ID,
  });
}

async function getProvider(env: RuntimeEnv): Promise<ReceiptParserProvider> {
  const providerName = env.RECEIPT_AI_PROVIDER ?? process.env.RECEIPT_AI_PROVIDER ?? "disabled";
  if (providerName === "cloudrun") {
    const config = cloudRunConfig(env);
    if (!config) {
      throw new ReceiptParserError("not_configured", "Layanan OCR server belum dikonfigurasi.");
    }
    return new CloudRunReceiptParserProvider(config);
  }

  if (providerName === "cloudflare") {
    if (!env.AI) throw new ReceiptParserError("not_configured", "Binding Workers AI belum tersedia.");
    return new CloudflareReceiptParserProvider(
      env.AI,
      env.RECEIPT_AI_MODEL ?? "@cf/google/gemma-4-26b-a4b-it",
      env.RECEIPT_AI_FALLBACK_MODEL ?? "@cf/moondream/moondream3.1-9B-A2B",
    );
  }

  if (providerName === "mock" && process.env.NODE_ENV !== "production") {
    return new MockReceiptParserProvider();
  }
  throw new ReceiptParserError("not_configured", "OCR server belum diaktifkan.");
}

export async function GET() {
  const env = await getRuntimeEnv();
  return NextResponse.json(
    {
      enabled: serverOcrConfigured(env),
      turnstileSiteKey: serverOcrConfigured(env) ? env.TURNSTILE_SITE_KEY : null,
      limits: SERVER_SCAN_LIMITS,
      maxUploadBytes: MAX_FILE_SIZE,
    },
    { headers: { "cache-control": "private, no-store" } },
  );
}

export async function POST(request: Request) {
  const device = getOrCreateAnonymousDeviceId(cookieValue(request, DEVICE_COOKIE));
  const withDevice = (response: NextResponse) => attachDeviceCookie(response, device.id, device.created);
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isFinite(contentLength) || contentLength < 0 || contentLength > MAX_FILE_SIZE) {
    return withDevice(
      errorResponse("Ukuran foto maksimal 4 MB.", "invalid_size", contentLength > MAX_FILE_SIZE ? 413 : 400),
    );
  }

  const mimeType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (!allowedTypes.has(mimeType)) {
    return withDevice(errorResponse("Gunakan foto JPG, PNG, atau WebP.", "invalid_type", 415));
  }

  let bytes: Uint8Array;
  try {
    bytes = await readBoundedBody(request, MAX_FILE_SIZE);
  } catch {
    return withDevice(errorResponse("Ukuran foto maksimal 4 MB.", "invalid_size", 413));
  }
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_FILE_SIZE) {
    return withDevice(errorResponse("Ukuran foto maksimal 4 MB.", "invalid_size", 413));
  }
  const dimensions = getImageDimensions(bytes, mimeType);
  if (
    !dimensions ||
    dimensions.width < MIN_DIMENSION ||
    dimensions.height < MIN_DIMENSION ||
    dimensions.width > MAX_DIMENSION ||
    dimensions.height > MAX_DIMENSION ||
    dimensions.width * dimensions.height > MAX_PIXELS
  ) {
    return withDevice(
      errorResponse("Dimensi foto tidak aman atau format gambar tidak sesuai isinya.", "invalid_dimensions", 422),
    );
  }

  const env = await getRuntimeEnv();
  if (!serverOcrConfigured(env)) {
    return withDevice(
      errorResponse("Pemindai pintar belum tersedia. Gunakan pemindai lokal.", "not_configured", 503),
    );
  }

  const network = request.headers.get("cf-connecting-ip");
  if (!network && process.env.NODE_ENV === "production") {
    return withDevice(errorResponse("Identitas jaringan tidak tersedia.", "request_untrusted", 403));
  }

  const turnstileToken = request.headers.get("x-turnstile-token") ?? "";
  let challengeValid = false;
  try {
    challengeValid = await verifyTurnstileToken({
      token: turnstileToken,
      secret: env.TURNSTILE_SECRET_KEY!,
      remoteIp: network ?? "127.0.0.1",
      expectedHostname: env.TURNSTILE_EXPECTED_HOSTNAME!,
      signal: request.signal,
    });
  } catch {
    // A Turnstile outage must fail closed without consuming OCR quota.
  }
  if (!challengeValid) {
    return withDevice(
      errorResponse("Pemeriksaan keamanan belum berhasil. Coba lagi.", "challenge_failed", 403),
    );
  }

  let identity: { deviceHash: string; networkHash: string };
  try {
    identity = await hashScanIdentity(device.id, network ?? "local", env.OCR_QUOTA_SECRET!);
  } catch {
    return withDevice(errorResponse("Pengaman kuota belum tersedia.", "quota_unavailable", 503));
  }
  const quota = await reserveScanQuota(env.OCR_QUOTA!, identity);
  if (!quota.allowed) {
    const retrySeconds = Math.max(1, Math.ceil((quota.retryAt - Date.now()) / 1_000));
    const unavailable = quota.reason === "unavailable";
    return withDevice(
      errorResponse(
        unavailable
          ? "Pengaman kuota sedang tidak tersedia. Pemindai lokal tetap bisa digunakan."
          : quota.reason === "burst"
          ? "Tunggu sebentar sebelum memindai lagi."
          : "Kuota pemindai pintar sudah habis. Pemindai lokal tetap bisa digunakan.",
        `quota_${quota.reason}`,
        unavailable ? 503 : 429,
        { "retry-after": String(retrySeconds), "x-ratelimit-remaining": "0" },
      ),
    );
  }

  try {
    const provider = await getProvider(env);
    const parsed = await provider.parse(
      {
        mimeType: mimeType as "image/jpeg" | "image/png" | "image/webp",
        bytes,
        width: dimensions.width,
        height: dimensions.height,
      },
      request.signal,
    );
    return withDevice(
      NextResponse.json(
        { receipt: normalizeAiReceipt(parsed), provider: provider.name, quotaRemaining: quota.remaining },
        {
          headers: {
            "cache-control": "no-store",
            "x-ratelimit-limit": String(SERVER_SCAN_LIMITS.deviceDaily),
            "x-ratelimit-remaining": String(quota.remaining),
            "x-ratelimit-reset": String(Math.floor(quota.dailyResetAt / 1_000)),
          },
        },
      ),
    );
  } catch (error) {
    const code = error instanceof ReceiptParserError ? error.code : "provider_unavailable";
    return withDevice(
      errorResponse(
        "Pemindai pintar belum berhasil. Pemindaian lokal masih tersedia.",
        code,
        code === "not_configured" ? 503 : code === "timeout" ? 504 : 502,
        { "cache-control": "no-store", "x-ratelimit-remaining": String(quota.remaining) },
      ),
    );
  }
}

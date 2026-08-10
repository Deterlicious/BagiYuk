import { z } from "zod";
import type { AiReceiptOutput } from "@/domain/receipt/schemas";
import type { EditableReceipt } from "@/domain/receipt/types";
import { receiptFromOcrLines } from "./paddle-receipt-parser";
import {
  ReceiptParserError,
  type ReceiptImage,
  type ReceiptParserProvider,
} from "./provider";

const pointSchema = z.tuple([z.number().finite(), z.number().finite()]);
const cloudRunResponseSchema = z
  .object({
    engine: z.string().max(80),
    lines: z
      .array(
        z.object({
          text: z.string().trim().min(1).max(300),
          score: z.number().min(0).max(1),
          poly: z.array(pointSchema).min(4).max(16),
        }),
      )
      .min(1)
      .max(600),
  })
  .strict();

export type CloudRunProviderConfig = {
  url: string;
  serviceAccountEmail: string;
  serviceAccountPrivateKey: string;
  timeoutMs?: number;
};

export function canonicalCloudRunOrigin(value: string) {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.pathname !== "/" && url.pathname !== "")
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

type CachedIdentityToken = {
  audience: string;
  email: string;
  token: string;
  expiresAt: number;
};

let cachedIdentityToken: CachedIdentityToken | null = null;

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function encodeJson(value: unknown) {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function pemToPkcs8(pem: string) {
  const normalized = pem.replace(/\\n/g, "\n");
  const body = normalized
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  if (!body) throw new ReceiptParserError("not_configured", "Kunci layanan OCR belum tersedia.");
  const binary = atob(body);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0)).buffer;
}

async function createSignedAssertion(
  serviceAccountEmail: string,
  serviceAccountPrivateKey: string,
  audience: string,
) {
  const now = Math.floor(Date.now() / 1_000);
  const header = encodeJson({ alg: "RS256", typ: "JWT" });
  const payload = encodeJson({
    iss: serviceAccountEmail,
    sub: serviceAccountEmail,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3_600,
    target_audience: audience,
  });
  const unsigned = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(serviceAccountPrivateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  return `${unsigned}.${base64Url(new Uint8Array(signature))}`;
}

export async function getCloudRunIdentityToken(
  config: CloudRunProviderConfig,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const now = Date.now();
  if (
    cachedIdentityToken &&
    cachedIdentityToken.audience === config.url &&
    cachedIdentityToken.email === config.serviceAccountEmail &&
    cachedIdentityToken.expiresAt - now > 60_000
  ) {
    return cachedIdentityToken.token;
  }

  const assertion = await createSignedAssertion(
    config.serviceAccountEmail,
    config.serviceAccountPrivateKey,
    config.url,
  );
  signal?.throwIfAborted();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    signal,
  });
  if (!response.ok) {
    throw new ReceiptParserError("provider_unavailable", "Identitas layanan OCR ditolak.");
  }
  const payload = (await response.json()) as { id_token?: unknown; expires_in?: unknown };
  if (typeof payload.id_token !== "string") {
    throw new ReceiptParserError("provider_unavailable", "Token layanan OCR tidak tersedia.");
  }
  const expiresIn = typeof payload.expires_in === "number" ? payload.expires_in : 3_600;
  cachedIdentityToken = {
    audience: config.url,
    email: config.serviceAccountEmail,
    token: payload.id_token,
    expiresAt: now + Math.max(300, Math.min(expiresIn, 3_600)) * 1_000,
  };
  return payload.id_token;
}

function field<T>(value: T, confidence: number) {
  return { value, confidence };
}

function editableToAiOutput(receipt: EditableReceipt): AiReceiptOutput {
  return {
    merchantName: field(receipt.merchantName, receipt.merchantConfidence),
    items: receipt.items.map((item) => ({
      name: field(item.name, item.confidence.name),
      quantity: field(item.quantity, item.confidence.quantity),
      unitPrice: field(item.unitPrice, item.confidence.unitPrice),
      lineTotal: field(item.lineTotal, item.confidence.lineTotal),
    })),
    summary: {
      subtotal: field(receipt.charges.statedSubtotal, receipt.chargeConfidence.statedSubtotal),
      tax: field(receipt.charges.tax, receipt.chargeConfidence.tax),
      serviceCharge: field(
        receipt.charges.serviceCharge,
        receipt.chargeConfidence.serviceCharge,
      ),
      discount: field(receipt.charges.discount, receipt.chargeConfidence.discount),
      rounding: field(receipt.charges.rounding, receipt.chargeConfidence.rounding),
      total: field(receipt.charges.receiptTotal, receipt.chargeConfidence.receiptTotal),
    },
  };
}

export class CloudRunReceiptParserProvider implements ReceiptParserProvider {
  readonly name = "cloudrun" as const;
  private readonly config: CloudRunProviderConfig;

  constructor(
    config: CloudRunProviderConfig,
    private readonly identityTokenProvider = getCloudRunIdentityToken,
  ) {
    const url = canonicalCloudRunOrigin(config.url);
    if (!url) {
      throw new ReceiptParserError("not_configured", "Alamat layanan OCR tidak valid.");
    }
    this.config = { ...config, url };
  }

  async parse(image: ReceiptImage, signal?: AbortSignal): Promise<AiReceiptOutput> {
    const controller = new AbortController();
    const relayAbort = () => controller.abort(signal?.reason ?? "client_disconnected");
    if (signal?.aborted) relayAbort();
    else signal?.addEventListener("abort", relayAbort, { once: true });
    const timeout = setTimeout(
      () => controller.abort("cloud_run_timeout"),
      this.config.timeoutMs ?? 85_000,
    );
    try {
      const identityToken = await this.identityTokenProvider(this.config, controller.signal);
      controller.signal.throwIfAborted();
      const requestBody = image.bytes.buffer.slice(
        image.bytes.byteOffset,
        image.bytes.byteOffset + image.bytes.byteLength,
      ) as ArrayBuffer;
      const response = await fetch(`${this.config.url}/v1/ocr`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${identityToken}`,
          "content-type": image.mimeType,
          "x-receipt-width": String(image.width ?? ""),
          "x-receipt-height": String(image.height ?? ""),
        },
        body: requestBody,
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new ReceiptParserError(
          response.status === 413 ? "invalid_output" : "provider_unavailable",
          "Layanan OCR tidak dapat memproses foto.",
        );
      }
      const parsed = cloudRunResponseSchema.safeParse(await response.json());
      if (!parsed.success) {
        throw new ReceiptParserError("invalid_output", "Respons OCR server tidak valid.");
      }
      return editableToAiOutput(receiptFromOcrLines(parsed.data.lines));
    } catch (error) {
      if (error instanceof ReceiptParserError) throw error;
      if (controller.signal.aborted) {
        throw new ReceiptParserError("timeout", "Layanan OCR melewati batas waktu.");
      }
      throw new ReceiptParserError("provider_unavailable", "Layanan OCR tidak tersedia.");
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", relayAbort);
    }
  }
}

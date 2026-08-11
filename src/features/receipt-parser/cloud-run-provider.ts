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

const stsResponseSchema = z
  .object({
    access_token: z.string().min(20).max(16_384),
    expires_in: z.number().int().positive().max(3_600),
    token_type: z.string().transform((value) => value.toLocaleLowerCase("en-US")),
  })
  .passthrough();

const identityResponseSchema = z.object({ token: z.string().min(20).max(16_384) }).strict();
const identityTokenPayloadSchema = z
  .object({
    aud: z.string(),
    email: z.string(),
    email_verified: z.literal(true),
    exp: z.number().int().positive(),
    iss: z.literal("https://accounts.google.com"),
  })
  .passthrough();

export type CloudRunProviderConfig = {
  url: string;
  serviceAccountEmail: string;
  wifAudience: string;
  wifIssuer: string;
  wifSubject: string;
  wifPrivateKey: string;
  wifKeyId: string;
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

export function canonicalWifIssuer(value: string) {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      value.endsWith("/") ||
      url.toString() !== value
    ) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

export function normalizeCloudRunProviderConfig(config: CloudRunProviderConfig) {
  const url = canonicalCloudRunOrigin(config.url);
  const issuer = canonicalWifIssuer(config.wifIssuer);
  if (
    !url ||
    !issuer ||
    !/^\/\/iam\.googleapis\.com\/projects\/[1-9]\d*\/locations\/global\/workloadIdentityPools\/[a-z][a-z0-9-]{2,30}[a-z0-9]\/providers\/[a-z][a-z0-9-]{2,30}[a-z0-9]$/.test(
      config.wifAudience,
    ) ||
    !/^[A-Za-z0-9._:-]{3,127}$/.test(config.wifSubject) ||
    !/^[A-Za-z0-9._-]{3,128}$/.test(config.wifKeyId) ||
    !/^[^\s@]+@[^\s@]+\.iam\.gserviceaccount\.com$/.test(config.serviceAccountEmail) ||
    !config.wifPrivateKey.replace(/\\n/g, "\n").includes("-----BEGIN PRIVATE KEY-----")
  ) {
    return null;
  }
  return { ...config, url, wifIssuer: issuer };
}

type CachedIdentityToken = {
  audience: string;
  email: string;
  wifAudience: string;
  issuer: string;
  subject: string;
  keyId: string;
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

function decodeJwtPayload(token: string) {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    return null;
  }
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

async function createSignedAssertion(config: CloudRunProviderConfig) {
  const now = Math.floor(Date.now() / 1_000);
  const header = encodeJson({ alg: "RS256", typ: "JWT", kid: config.wifKeyId });
  const payload = encodeJson({
    iss: config.wifIssuer,
    sub: config.wifSubject,
    aud: `https:${config.wifAudience}`,
    iat: now - 5,
    exp: now + 300,
    jti: crypto.randomUUID(),
    environment: "production",
    workload: "receipt-ocr",
  });
  const unsigned = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(config.wifPrivateKey),
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
  const normalized = normalizeCloudRunProviderConfig(config);
  if (!normalized) {
    throw new ReceiptParserError("not_configured", "Konfigurasi identitas OCR tidak valid.");
  }
  config = normalized;
  signal?.throwIfAborted();
  const now = Date.now();
  if (
    cachedIdentityToken &&
    cachedIdentityToken.audience === config.url &&
    cachedIdentityToken.email === config.serviceAccountEmail &&
    cachedIdentityToken.wifAudience === config.wifAudience &&
    cachedIdentityToken.issuer === config.wifIssuer &&
    cachedIdentityToken.subject === config.wifSubject &&
    cachedIdentityToken.keyId === config.wifKeyId &&
    cachedIdentityToken.expiresAt - now > 60_000
  ) {
    return cachedIdentityToken.token;
  }

  const assertion = await createSignedAssertion(config);
  signal?.throwIfAborted();
  const stsResponse = await fetch("https://sts.googleapis.com/v1/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      audience: config.wifAudience,
      grantType: "urn:ietf:params:oauth:grant-type:token-exchange",
      requestedTokenType: "urn:ietf:params:oauth:token-type:access_token",
      scope: "https://www.googleapis.com/auth/iam",
      subjectTokenType: "urn:ietf:params:oauth:token-type:jwt",
      subjectToken: assertion,
    }),
    signal,
  });
  if (!stsResponse.ok) {
    throw new ReceiptParserError("provider_unavailable", "Federasi identitas OCR ditolak.");
  }
  const stsPayload = stsResponseSchema.safeParse(await stsResponse.json());
  if (!stsPayload.success || stsPayload.data.token_type !== "bearer") {
    throw new ReceiptParserError("provider_unavailable", "Token federasi OCR tidak tersedia.");
  }

  signal?.throwIfAborted();
  const identityResponse = await fetch(
    `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(
      config.serviceAccountEmail,
    )}:generateIdToken`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${stsPayload.data.access_token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ audience: config.url, includeEmail: true }),
      signal,
    },
  );
  if (!identityResponse.ok) {
    throw new ReceiptParserError("provider_unavailable", "Identitas Cloud Run ditolak.");
  }
  const identityPayload = identityResponseSchema.safeParse(await identityResponse.json());
  if (!identityPayload.success) {
    throw new ReceiptParserError("provider_unavailable", "Token layanan OCR tidak tersedia.");
  }
  const identityClaims = identityTokenPayloadSchema.safeParse(
    decodeJwtPayload(identityPayload.data.token),
  );
  if (
    !identityClaims.success ||
    identityClaims.data.aud !== config.url ||
    identityClaims.data.email !== config.serviceAccountEmail ||
    identityClaims.data.exp * 1_000 - now <= 60_000
  ) {
    throw new ReceiptParserError("provider_unavailable", "Klaim identitas OCR tidak valid.");
  }
  cachedIdentityToken = {
    audience: config.url,
    email: config.serviceAccountEmail,
    wifAudience: config.wifAudience,
    issuer: config.wifIssuer,
    subject: config.wifSubject,
    keyId: config.wifKeyId,
    token: identityPayload.data.token,
    expiresAt: identityClaims.data.exp * 1_000,
  };
  return identityPayload.data.token;
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
    const normalized = normalizeCloudRunProviderConfig(config);
    if (!normalized) {
      throw new ReceiptParserError("not_configured", "Alamat layanan OCR tidak valid.");
    }
    this.config = normalized;
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

import { editableReceiptSchema } from "@/domain/receipt/schemas";
import type { EditableReceipt } from "@/domain/receipt/types";
import { prepareServerReceiptImage } from "@/lib/image-client";

export type ServerOcrConfig = {
  enabled: boolean;
  turnstileSiteKey: string | null;
  limits: {
    deviceDaily: number;
    deviceMonthly: number;
    networkDaily: number;
    networkMonthly: number;
    globalMonthly: number;
  };
  maxUploadBytes: number;
};

export class ServerOcrError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
    public readonly retryAfter?: number,
  ) {
    super(message);
    this.name = "ServerOcrError";
  }
}

export async function getServerOcrConfig(signal?: AbortSignal): Promise<ServerOcrConfig | null> {
  try {
    const response = await fetch("/api/receipts/parse", {
      method: "GET",
      cache: "no-store",
      signal,
    });
    if (!response.ok) return null;
    return (await response.json()) as ServerOcrConfig;
  } catch {
    return null;
  }
}

export async function parseReceiptOnServer(
  file: File,
  turnstileToken: string,
  signal?: AbortSignal,
): Promise<{ receipt: EditableReceipt; quotaRemaining: number | null }> {
  const prepared = await prepareServerReceiptImage(file);
  if (!prepared) {
    throw new ServerOcrError(
      "upload_preparation_failed",
      0,
      "Salinan foto yang aman belum dapat dibuat.",
    );
  }
  signal?.throwIfAborted();
  const response = await fetch("/api/receipts/parse", {
    method: "POST",
    headers: {
      "content-type": prepared.type,
      "x-turnstile-token": turnstileToken,
    },
    body: prepared,
    cache: "no-store",
    signal,
  });
  const payload = (await response.json().catch(() => null)) as
    | { receipt?: unknown; quotaRemaining?: unknown; error?: { code?: unknown; message?: unknown } }
    | null;
  if (!response.ok) {
    const code = typeof payload?.error?.code === "string" ? payload.error.code : "server_unavailable";
    const message =
      typeof payload?.error?.message === "string"
        ? payload.error.message
        : "Pemindai pintar belum tersedia.";
    const retryAfter = Number(response.headers.get("retry-after") ?? 0);
    throw new ServerOcrError(code, response.status, message, retryAfter || undefined);
  }
  const receipt = editableReceiptSchema.parse(payload?.receipt);
  return {
    receipt,
    quotaRemaining: typeof payload?.quotaRemaining === "number" ? payload.quotaRemaining : null,
  };
}

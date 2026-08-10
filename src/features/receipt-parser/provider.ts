import type { AiReceiptOutput } from "@/domain/receipt/schemas";

export type ReceiptImage = {
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  bytes: Uint8Array;
  width?: number;
  height?: number;
};

export interface ReceiptParserProvider {
  readonly name: "mock" | "cloudflare" | "cloudrun";
  parse(image: ReceiptImage, signal?: AbortSignal): Promise<AiReceiptOutput>;
}

export class ReceiptParserError extends Error {
  constructor(
    public readonly code:
      | "not_configured"
      | "provider_unavailable"
      | "invalid_output"
      | "timeout"
      | "quota_unavailable"
      | "challenge_failed",
    message: string,
  ) {
    super(message);
    this.name = "ReceiptParserError";
  }
}

import type { AiReceiptOutput } from "@/domain/receipt/schemas";

export type ReceiptImage = {
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  base64: string;
};

export interface ReceiptParserProvider {
  readonly name: "mock" | "cloudflare";
  parse(image: ReceiptImage): Promise<AiReceiptOutput>;
}

export class ReceiptParserError extends Error {
  constructor(
    public readonly code:
      | "not_configured"
      | "provider_unavailable"
      | "invalid_output"
      | "timeout",
    message: string,
  ) {
    super(message);
    this.name = "ReceiptParserError";
  }
}

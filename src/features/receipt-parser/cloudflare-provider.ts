import { aiReceiptOutputSchema, type AiReceiptOutput } from "@/domain/receipt/schemas";
import { RECEIPT_PARSE_PROMPT } from "./prompts";
import {
  ReceiptParserError,
  type ReceiptImage,
  type ReceiptParserProvider,
} from "./provider";

export type WorkersAiBinding = {
  run: (model: string, input: Record<string, unknown>) => Promise<unknown>;
};

function extractJson(value: string) {
  const withoutFence = value.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  const firstBrace = withoutFence.indexOf("{");
  const lastBrace = withoutFence.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace <= firstBrace) {
    throw new ReceiptParserError("invalid_output", "Model tidak mengembalikan JSON.");
  }
  try {
    return JSON.parse(withoutFence.slice(firstBrace, lastBrace + 1)) as unknown;
  } catch {
    throw new ReceiptParserError("invalid_output", "JSON dari model tidak valid.");
  }
}

export class CloudflareReceiptParserProvider implements ReceiptParserProvider {
  readonly name = "cloudflare" as const;

  constructor(
    private readonly ai: WorkersAiBinding,
    private readonly model = "@cf/moondream/moondream3.1-9B-A2B",
  ) {}

  async parse(image: ReceiptImage): Promise<AiReceiptOutput> {
    let response: unknown;
    try {
      response = await this.ai.run(this.model, {
        task: "query",
        image: `data:${image.mimeType};base64,${image.base64}`,
        question: RECEIPT_PARSE_PROMPT,
        reasoning: false,
        temperature: 0.1,
        max_tokens: 6_000,
        stream: false,
      });
    } catch {
      throw new ReceiptParserError(
        "provider_unavailable",
        "Workers AI tidak dapat memproses struk saat ini.",
      );
    }

    const answer =
      typeof response === "object" && response !== null && "answer" in response
        ? (response as { answer?: unknown }).answer
        : undefined;
    if (typeof answer !== "string") {
      throw new ReceiptParserError("invalid_output", "Respons Workers AI tidak dikenali.");
    }

    const parsed = aiReceiptOutputSchema.safeParse(extractJson(answer));
    if (!parsed.success) {
      throw new ReceiptParserError("invalid_output", "Struktur hasil Workers AI tidak valid.");
    }
    return parsed.data;
  }
}

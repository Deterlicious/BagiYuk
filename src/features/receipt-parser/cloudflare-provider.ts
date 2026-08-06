import {
  aiReceiptOutputSchema,
  rawReceiptExtractionSchema,
  type AiReceiptOutput,
  type RawReceiptExtraction,
} from "@/domain/receipt/schemas";
import { RECEIPT_JSON_SCHEMA, RECEIPT_PARSE_PROMPT } from "./prompts";
import {
  ReceiptParserError,
  type ReceiptImage,
  type ReceiptParserProvider,
} from "./provider";

const DEFAULT_PRIMARY_MODEL = "@cf/google/gemma-4-26b-a4b-it";
const DEFAULT_FALLBACK_MODEL = "@cf/moondream/moondream3.1-9B-A2B";

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

function extractPayload(response: unknown) {
  if (typeof response !== "object" || response === null) {
    throw new ReceiptParserError("invalid_output", "Respons Workers AI tidak dikenali.");
  }

  if ("response" in response) {
    const value = (response as { response?: unknown }).response;
    return typeof value === "string" ? extractJson(value) : value;
  }

  if ("answer" in response) {
    const value = (response as { answer?: unknown }).answer;
    if (typeof value === "string") return extractJson(value);
  }

  if ("choices" in response && Array.isArray((response as { choices?: unknown }).choices)) {
    const choice = (response as { choices: Array<{ message?: { content?: unknown } }> }).choices[0];
    const content = choice?.message?.content;
    if (typeof content === "string") return extractJson(content);
  }

  throw new ReceiptParserError("invalid_output", "Respons Workers AI tidak dikenali.");
}

function field<T>(value: T | null, confidence: number) {
  return { value, confidence: value === null ? 0.12 : confidence };
}

function deriveValidatedOutput(
  receipt: RawReceiptExtraction,
  baseConfidence: number,
): AiReceiptOutput {
  const items = receipt.items.map((item) => {
    const quantity = item.quantity;
    const lineMatches =
      quantity !== null &&
      item.unitPrice !== null &&
      item.lineTotal !== null &&
      quantity * item.unitPrice === item.lineTotal;
    const arithmeticConfidence = lineMatches
      ? Math.min(0.94, baseConfidence + 0.08)
      : Math.max(0.42, baseConfidence - 0.24);

    return {
      name: field(item.name, baseConfidence),
      quantity: field(quantity, baseConfidence),
      unitPrice: field(item.unitPrice, arithmeticConfidence),
      lineTotal: field(item.lineTotal, arithmeticConfidence),
    };
  });

  const knownLineTotal = receipt.items.reduce(
    (sum, item) => sum + (item.lineTotal ?? 0),
    0,
  );
  const subtotalMatches =
    receipt.summary.subtotal !== null &&
    receipt.items.every((item) => item.lineTotal !== null) &&
    receipt.summary.subtotal === knownLineTotal;
  const summaryConfidence = subtotalMatches
    ? Math.min(0.95, baseConfidence + 0.1)
    : Math.max(0.45, baseConfidence - 0.18);

  const { subtotal, tax, serviceCharge, discount, rounding, total } = receipt.summary;
  const totalMatches =
    subtotal !== null &&
    tax !== null &&
    serviceCharge !== null &&
    discount !== null &&
    rounding !== null &&
    total !== null &&
    subtotal + tax + serviceCharge - discount + rounding === total;
  const totalConfidence = totalMatches
    ? Math.min(0.96, baseConfidence + 0.12)
    : Math.max(0.42, baseConfidence - 0.22);

  return aiReceiptOutputSchema.parse({
    merchantName: field(receipt.merchantName, baseConfidence),
    items,
    summary: {
      subtotal: field(subtotal, summaryConfidence),
      tax: field(tax, totalConfidence),
      serviceCharge: field(serviceCharge, totalConfidence),
      discount: field(discount, totalConfidence),
      rounding: field(rounding, totalConfidence),
      total: field(total, totalConfidence),
    },
  });
}

export class CloudflareReceiptParserProvider implements ReceiptParserProvider {
  readonly name = "cloudflare" as const;

  constructor(
    private readonly ai: WorkersAiBinding,
    private readonly primaryModel = DEFAULT_PRIMARY_MODEL,
    private readonly fallbackModel = DEFAULT_FALLBACK_MODEL,
  ) {}

  private async runDocumentModel(image: ReceiptImage) {
    return this.ai.run(this.primaryModel, {
      messages: [
        {
          role: "system",
          content:
            "You extract restaurant receipts faithfully. Return only the requested structured data; never calculate bill splits.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: RECEIPT_PARSE_PROMPT },
            {
              type: "image_url",
              image_url: { url: `data:${image.mimeType};base64,${image.base64}` },
            },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: RECEIPT_JSON_SCHEMA,
      },
      temperature: 0,
      max_tokens: 12_000,
      stream: false,
    });
  }

  private async runFallbackModel(image: ReceiptImage) {
    return this.ai.run(this.fallbackModel, {
      task: "query",
      image: `data:${image.mimeType};base64,${image.base64}`,
      question: RECEIPT_PARSE_PROMPT,
      reasoning: true,
      temperature: 0,
      max_tokens: 12_000,
      stream: false,
    });
  }

  async parse(image: ReceiptImage): Promise<AiReceiptOutput> {
    const attempts = [
      { run: () => this.runDocumentModel(image), confidence: 0.84 },
      { run: () => this.runFallbackModel(image), confidence: 0.72 },
    ];

    for (const attempt of attempts) {
      try {
        const response = await attempt.run();
        const parsed = rawReceiptExtractionSchema.safeParse(extractPayload(response));
        if (parsed.success) return deriveValidatedOutput(parsed.data, attempt.confidence);
      } catch {
        // The next provider attempt remains available without exposing model output.
      }
    }

    throw new ReceiptParserError(
      "invalid_output",
      "Workers AI tidak dapat menghasilkan struktur struk yang valid.",
    );
  }
}

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import { z } from "zod";
import { productEvents } from "@/lib/analytics";

const eventSchema = z.object({ event: z.enum(productEvents) }).strict();

type AnalyticsDataset = {
  writeDataPoint(data: { blobs?: string[]; doubles?: number[]; indexes?: string[] }): void;
};

export async function POST(request: Request) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 128) return new NextResponse(null, { status: 413 });

  let parsed: z.infer<typeof eventSchema>;
  try {
    parsed = eventSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "invalid_event" }, { status: 400 });
  }

  if (process.env.NODE_ENV !== "production") {
    return new NextResponse(null, { status: 204 });
  }

  try {
    const { env } = await getCloudflareContext({ async: true });
    const analytics = (env as CloudflareEnv & { ANALYTICS?: AnalyticsDataset }).ANALYTICS;
    analytics?.writeDataPoint({
      indexes: ["bagiyuk-product"],
      blobs: [parsed.event],
      doubles: [1],
    });
  } catch {
    // Local Next.js development has no Workers binding; keep the endpoint a no-op.
  }

  return new NextResponse(null, { status: 204 });
}

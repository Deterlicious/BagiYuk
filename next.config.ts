import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

if (
  process.env.NODE_ENV === "development" &&
  process.env.RECEIPT_AI_PROVIDER === "cloudflare"
) {
  initOpenNextCloudflareForDev();
}

const nextConfig: NextConfig = {
  devIndicators: false,
  poweredByHeader: false,
};

export default nextConfig;

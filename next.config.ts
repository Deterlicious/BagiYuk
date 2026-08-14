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
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), browsing-topics=()" },
        { key: "Content-Security-Policy", value: "base-uri 'self'; object-src 'none'; frame-ancestors 'none'" },
        { key: "Strict-Transport-Security", value: "max-age=31536000" },
      ],
    }];
  },
  turbopack: {
    resolveAlias: {
      fs: "./src/lib/browser-node-stub.ts",
      path: "./src/lib/browser-node-stub.ts",
      "ort.bundle.min.mjs": "./node_modules/onnxruntime-web/dist/ort.wasm.bundle.min.mjs",
    },
  },
};

export default nextConfig;

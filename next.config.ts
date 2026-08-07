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
  turbopack: {
    resolveAlias: {
      fs: "./src/lib/browser-node-stub.ts",
      path: "./src/lib/browser-node-stub.ts",
      "ort.bundle.min.mjs": "./node_modules/onnxruntime-web/dist/ort.wasm.bundle.min.mjs",
    },
  },
};

export default nextConfig;

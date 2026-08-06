import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const outputDirectory = new URL("../docs/screenshots/", import.meta.url);
await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch();
try {
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.goto("http://localhost:3000/", { waitUntil: "networkidle" });
  await mobile.screenshot({
    path: fileURLToPath(new URL("home-mobile.png", outputDirectory)),
    fullPage: true,
  });

  await mobile.goto("http://localhost:3000/split/new?sample=1", { waitUntil: "networkidle" });
  await mobile.getByText("Langkah 2 dari 5").waitFor();
  await mobile.screenshot({
    path: fileURLToPath(new URL("verify-mobile.png", outputDirectory)),
    fullPage: false,
  });

  const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await desktop.goto("http://localhost:3000/", { waitUntil: "networkidle" });
  await desktop.screenshot({
    path: fileURLToPath(new URL("home-desktop.png", outputDirectory)),
    fullPage: true,
  });
} finally {
  await browser.close();
}

import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const iconDirectory = path.join(root, "public", "icons");

await mkdir(iconDirectory, { recursive: true });
await Promise.all([
  sharp(path.join(iconDirectory, "icon.svg")).resize(192, 192).png().toFile(path.join(iconDirectory, "icon-192.png")),
  sharp(path.join(iconDirectory, "icon.svg")).resize(512, 512).png().toFile(path.join(iconDirectory, "icon-512.png")),
  sharp(path.join(iconDirectory, "icon-maskable.svg")).resize(512, 512).png().toFile(path.join(iconDirectory, "icon-maskable-512.png")),
  sharp(path.join(iconDirectory, "icon-apple.svg")).resize(180, 180).png().toFile(path.join(iconDirectory, "apple-touch-icon.png")),
  sharp(path.join(root, "public", "og-bagiyuk.svg")).png().toFile(path.join(root, "public", "og-bagiyuk.png")),
]);

console.log("Generated legal BagiYuk PWA icons from the repository-owned SVG artwork.");

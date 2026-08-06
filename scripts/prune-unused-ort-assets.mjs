import { readdir, unlink } from "node:fs/promises";
import path from "node:path";

const mediaDirectory = path.resolve(".open-next", "assets", "_next", "static", "media");
const entries = await readdir(mediaDirectory, { withFileTypes: true });
const unusedJsepAssets = entries.filter(
  (entry) =>
    entry.isFile() && /^ort-wasm-simd-threaded\.jsep\..+\.wasm$/.test(entry.name),
);

for (const entry of unusedJsepAssets) {
  await unlink(path.join(mediaDirectory, entry.name));
}

console.log(`Pruned ${unusedJsepAssets.length} unused ONNX JSEP asset(s).`);

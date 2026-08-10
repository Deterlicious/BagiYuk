import { existsSync, mkdirSync } from "node:fs";
import { stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const dataset = "Voxel51/consolidated_receipt_dataset";
const revision = "a468aad0427a88453151d968c2f175299d9e0ba6";
const imageIds = ["000000", "000003", "000014", "000020", "000055", "000064", "000068", "000076"];
const root = resolve(".cache", "cord");
const files = [
  { remote: "samples.json", local: join(root, "samples.json") },
  ...imageIds.map((id) => ({
    remote: `data/${id}.png`,
    local: join(root, "images", `${id}.png`),
  })),
];

async function hasContent(path) {
  if (!existsSync(path)) return false;
  return (await stat(path)).size > 0;
}

async function download(remote, local) {
  if (await hasContent(local)) {
    process.stdout.write(`Cached ${remote}\n`);
    return;
  }
  const url = `https://huggingface.co/datasets/${dataset}/resolve/${revision}/${remote}`;
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`Failed to download ${remote}: HTTP ${response.status}`);
  mkdirSync(dirname(local), { recursive: true });
  await writeFile(local, new Uint8Array(await response.arrayBuffer()));
  process.stdout.write(`Downloaded ${remote}\n`);
}

mkdirSync(join(root, "images"), { recursive: true });
for (const file of files) await download(file.remote, file.local);

process.stdout.write(`CORD benchmark cache ready at ${root}\n`);

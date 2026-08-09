import type { SplitResult } from "@/domain/billing/types";
import { formatRupiah } from "./currency";

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

export async function createResultImage(merchantName: string, result: SplitResult) {
  const width = 1080;
  const rowHeight = 112;
  const height = 450 + result.participants.length * rowHeight;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas_unavailable");

  context.fillStyle = "#f7f3e8";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "rgba(24,34,29,0.035)";
  for (let y = 32; y < height; y += 40) context.fillRect(0, y, width, 1);

  roundedRect(context, 70, 60, width - 140, height - 120, 32);
  context.fillStyle = "#fffdf8";
  context.fill();
  context.strokeStyle = "#dcd6c9";
  context.lineWidth = 2;
  context.stroke();

  context.fillStyle = "#0e6b5c";
  context.font = "800 28px 'Plus Jakarta Sans', system-ui, sans-serif";
  context.fillText("BAGIYUK · HASIL PEMBAGIAN", 120, 130);
  context.fillStyle = "#18221d";
  context.font = "800 48px 'Plus Jakarta Sans', system-ui, sans-serif";
  context.fillText((merchantName.trim() || "Makan bareng").slice(0, 30), 120, 194);
  context.fillStyle = "#667169";
  context.font = "600 24px 'Plus Jakarta Sans', system-ui, sans-serif";
  context.fillText(`${result.participants.length} orang · total sudah direkonsiliasi`, 120, 236);

  let y = 292;
  for (const allocation of result.participants) {
    context.strokeStyle = "#dcd6c9";
    context.setLineDash([8, 8]);
    context.beginPath();
    context.moveTo(120, y);
    context.lineTo(width - 120, y);
    context.stroke();
    context.setLineDash([]);
    context.fillStyle = "#18221d";
    context.font = "800 29px 'Plus Jakarta Sans', system-ui, sans-serif";
    context.fillText(allocation.participant.name.slice(0, 24), 120, y + 64);
    context.textAlign = "right";
    context.fillStyle = "#084c42";
    context.fillText(formatRupiah(allocation.total), width - 120, y + 64);
    context.textAlign = "left";
    y += rowHeight;
  }

  context.strokeStyle = "#18221d";
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(120, y);
  context.lineTo(width - 120, y);
  context.stroke();
  context.fillStyle = "#667169";
  context.font = "700 25px 'Plus Jakarta Sans', system-ui, sans-serif";
  context.fillText("TOTAL TAGIHAN", 120, y + 68);
  context.textAlign = "right";
  context.fillStyle = "#18221d";
  context.font = "800 36px 'Plus Jakarta Sans', system-ui, sans-serif";
  context.fillText(formatRupiah(result.reconciliation.allocatedTotal), width - 120, y + 68);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("image_unavailable");
  return blob;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

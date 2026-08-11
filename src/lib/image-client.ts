const MAX_INFERENCE_DIMENSION = 3_200;
const MIN_RECEIPT_WIDTH = 1_400;
const ANALYSIS_DIMENSION = 360;
const JPEG_QUALITY = 0.92;
const MAX_SERVER_DIMENSION = 2_500;
const MAX_SERVER_BYTES = 4 * 1024 * 1024;

type ReceiptBounds = { x: number; y: number; width: number; height: number };

function longestQualifiedRun(values: number[], threshold: number) {
  let bestStart = -1;
  let bestEnd = -1;
  let currentStart = -1;
  let gap = 0;

  for (let index = 0; index <= values.length; index += 1) {
    const qualified = index < values.length && (values[index] ?? -Infinity) >= threshold;
    if (qualified) {
      if (currentStart < 0) currentStart = index;
      gap = 0;
    } else if (currentStart >= 0 && gap < 2 && index < values.length) {
      gap += 1;
    } else if (currentStart >= 0) {
      const end = index - gap;
      if (end - currentStart > bestEnd - bestStart) {
        bestStart = currentStart;
        bestEnd = end;
      }
      currentStart = -1;
      gap = 0;
    }
  }

  return bestStart >= 0 ? { start: bestStart, end: bestEnd } : null;
}

function looksLikeReceiptPaper(red: number, green: number, blue: number) {
  const luminance = red * 0.299 + green * 0.587 + blue * 0.114;
  const spread = Math.max(red, green, blue) - Math.min(red, green, blue);
  return luminance >= 145 && spread <= 72;
}

export function findReceiptBounds(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): ReceiptBounds | null {
  if (width < 20 || height < 20 || pixels.length < width * height * 4) return null;

  const columns = new Array<number>(width).fill(0);
  const rows = new Array<number>(height).fill(0);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      if (
        !looksLikeReceiptPaper(
          pixels[offset] ?? 0,
          pixels[offset + 1] ?? 0,
          pixels[offset + 2] ?? 0,
        )
      ) {
        continue;
      }
      columns[x] = (columns[x] ?? 0) + 1;
      rows[y] = (rows[y] ?? 0) + 1;
    }
  }

  const horizontal = longestQualifiedRun(
    columns.map((count) => count / height),
    0.36,
  );
  if (!horizontal) return null;

  const detectedWidth = horizontal.end - horizontal.start;
  const widthRatio = detectedWidth / width;
  if (widthRatio < 0.22 || widthRatio > 0.98) return null;

  const vertical = longestQualifiedRun(
    rows.map((count) => count / Math.max(1, detectedWidth)),
    0.28,
  );
  if (!vertical) return null;

  const detectedHeight = vertical.end - vertical.start;
  if (detectedHeight / height < 0.32) return null;

  const paddingX = Math.round(detectedWidth * 0.055);
  const paddingY = Math.round(detectedHeight * 0.025);
  const x = Math.max(0, horizontal.start - paddingX);
  const y = Math.max(0, vertical.start - paddingY);
  const right = Math.min(width, horizontal.end + paddingX);
  const bottom = Math.min(height, vertical.end + paddingY);
  return { x, y, width: right - x, height: bottom - y };
}

function detectBounds(bitmap: ImageBitmap): ReceiptBounds {
  const scale = Math.min(1, ANALYSIS_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return { x: 0, y: 0, width: bitmap.width, height: bitmap.height };
  context.drawImage(bitmap, 0, 0, width, height);
  const detected = findReceiptBounds(context.getImageData(0, 0, width, height).data, width, height);
  if (!detected) return { x: 0, y: 0, width: bitmap.width, height: bitmap.height };
  return {
    x: Math.round(detected.x / scale),
    y: Math.round(detected.y / scale),
    width: Math.min(bitmap.width, Math.round(detected.width / scale)),
    height: Math.min(bitmap.height, Math.round(detected.height / scale)),
  };
}

/**
 * Crops likely paper boundaries, enlarges narrow receipts, raises contrast, and
 * removes embedded metadata. The original preview remains local in memory.
 */
async function canvasToReceiptFile(
  canvas: HTMLCanvasElement,
  variant: "balanced" | "contrast",
) {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
  return blob
    ? new File([blob], `receipt-${variant}-${Date.now()}.jpg`, {
        type: "image/jpeg",
        lastModified: Date.now(),
      })
    : null;
}

function renderReceiptCanvas(
  bitmap: ImageBitmap,
  crop: ReceiptBounds,
  width: number,
  height: number,
  filter: string,
) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) return null;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.filter = filter;
  context.drawImage(
    bitmap,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    width,
    height,
  );
  return canvas;
}

/**
 * Produces two aligned, metadata-free variants. The balanced image is used for
 * the fast first pass; the stronger contrast variant is only OCR'd when the
 * parsed subtotal indicates missing or misaligned rows.
 */
export async function prepareReceiptImageVariants(file: File) {
  if (typeof createImageBitmap !== "function") return [file];

  try {
    const bitmap = await createImageBitmap(file);
    const crop = detectBounds(bitmap);
    const downscale = Math.min(
      1,
      MAX_INFERENCE_DIMENSION / Math.max(crop.width, crop.height),
    );
    const upscale = Math.max(1, MIN_RECEIPT_WIDTH / crop.width);
    const scale = Math.min(
      MAX_INFERENCE_DIMENSION / Math.max(crop.width, crop.height),
      Math.max(downscale, upscale),
    );
    const width = Math.max(1, Math.round(crop.width * scale));
    const height = Math.max(1, Math.round(crop.height * scale));
    const balancedCanvas = renderReceiptCanvas(
      bitmap,
      crop,
      width,
      height,
      "grayscale(1) contrast(1.18)",
    );
    const contrastCanvas = renderReceiptCanvas(
      bitmap,
      crop,
      width,
      height,
      "grayscale(1) contrast(1.58) brightness(1.04)",
    );
    if (!balancedCanvas || !contrastCanvas) {
      bitmap.close();
      return [file];
    }
    const balanced = await canvasToReceiptFile(balancedCanvas, "balanced");
    const contrast = await canvasToReceiptFile(contrastCanvas, "contrast");
    bitmap.close();
    return [balanced ?? file, contrast ?? balanced ?? file];
  } catch {
    return [file];
  }
}

export async function prepareReceiptImage(file: File) {
  const variants = await prepareReceiptImageVariants(file);
  return variants[0] ?? file;
}

export function serverReceiptOutputSize(width: number, height: number) {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  const maximumScale = MAX_SERVER_DIMENSION / Math.max(safeWidth, safeHeight);
  const downscale = Math.min(1, maximumScale);
  const upscale = Math.max(1, MIN_RECEIPT_WIDTH / safeWidth);
  const scale = Math.min(maximumScale, Math.max(downscale, upscale));
  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
  };
}

/** Produces a metadata-free, bounded upload for the private server OCR path. */
export async function prepareServerReceiptImage(file: File) {
  if (typeof createImageBitmap !== "function") return null;
  try {
    const bitmap = await createImageBitmap(file);
    const crop = detectBounds(bitmap);
    const output = serverReceiptOutputSize(crop.width, crop.height);
    let { width, height } = output;
    for (const quality of [0.86, 0.76, 0.66]) {
      const canvas = renderReceiptCanvas(bitmap, crop, width, height, "grayscale(1) contrast(1.18)");
      const blob = canvas
        ? await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality))
        : null;
      if (blob && blob.size <= MAX_SERVER_BYTES) {
        bitmap.close();
        return new File([blob], `receipt-server-${Date.now()}.jpg`, { type: "image/jpeg" });
      }
      width = Math.max(1, Math.round(width * 0.82));
      height = Math.max(1, Math.round(height * 0.82));
    }
    bitmap.close();
    return null;
  } catch {
    return null;
  }
}

export async function rotateReceiptImage(file: File) {
  if (typeof createImageBitmap !== "function") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.height;
    canvas.height = bitmap.width;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) {
      bitmap.close();
      return file;
    }
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.translate(canvas.width, 0);
    context.rotate(Math.PI / 2);
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    return blob
      ? new File([blob], `receipt-rotated-${Date.now()}.jpg`, { type: "image/jpeg" })
      : file;
  } catch {
    return file;
  }
}

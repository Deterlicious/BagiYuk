from __future__ import annotations

import sys
import io
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.extract import extract_lines
from app.main import _pipeline, decode_image


image = Image.new("RGB", (1400, 420), "white")
draw = ImageDraw.Draw(image)
font = ImageFont.load_default(size=76)
draw.text((90, 80), "NASI GORENG 25000", fill="black", font=font)
draw.text((90, 220), "TOTAL 25000", fill="black", font=font)
buffer = io.BytesIO()
image.save(buffer, format="PNG")
bgr = decode_image(buffer.getvalue(), "image/png")
if bgr[0, 0].tolist() != [255, 255, 255] or not bgr.flags["C_CONTIGUOUS"]:
    raise RuntimeError("RGB-to-BGR image boundary failed")
lines = extract_lines(list(_pipeline().predict(bgr)))
joined = " ".join(line["text"].upper() for line in lines)
if not lines or "TOTAL" not in joined:
    raise RuntimeError(f"PP-OCRv6 inference smoke test failed: {joined[:200]}")
print(f"PP-OCRv6 smoke test passed with {len(lines)} recognized lines")

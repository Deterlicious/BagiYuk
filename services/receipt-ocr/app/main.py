from __future__ import annotations

import io
import logging
import os
import threading
from contextlib import asynccontextmanager
from typing import Any

import numpy as np
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel, ConfigDict
from PIL import Image, ImageOps, UnidentifiedImageError
from paddleocr import PaddleOCR
from app.extract import extract_lines

MAX_IMAGE_BYTES = int(os.getenv("MAX_IMAGE_BYTES", str(4 * 1024 * 1024)))
MAX_IMAGE_PIXELS = int(os.getenv("MAX_IMAGE_PIXELS", "20000000"))
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
EXPECTED_FORMATS = {"image/jpeg": "JPEG", "image/png": "PNG", "image/webp": "WEBP"}
MODEL_DIR = os.getenv("PADDLE_MODEL_HOME", "/opt/paddle-models")
INFERENCE_TIMEOUT_SECONDS = max(10, min(int(os.getenv("OCR_INFERENCE_TIMEOUT_SECONDS", "75")), 80))

logging.getLogger("paddleocr").setLevel(logging.WARNING)
Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS


def _pipeline() -> PaddleOCR:
    return PaddleOCR(
        text_detection_model_name="PP-OCRv6_small_det",
        text_recognition_model_name="PP-OCRv6_small_rec",
        text_detection_model_dir=f"{MODEL_DIR}/PP-OCRv6_small_det",
        text_recognition_model_dir=f"{MODEL_DIR}/PP-OCRv6_small_rec",
        doc_orientation_classify_model_dir=f"{MODEL_DIR}/PP-LCNet_x1_0_doc_ori",
        textline_orientation_model_dir=f"{MODEL_DIR}/PP-LCNet_x1_0_textline_ori",
        use_doc_orientation_classify=True,
        use_doc_unwarping=False,
        use_textline_orientation=True,
        device="cpu",
        engine="paddle_static",
        engine_config={
            "cpu_threads": max(1, min(int(os.getenv("OCR_CPU_THREADS", "1")), 2)),
            "enable_new_ir": False,
            "mkldnn_cache_capacity": 1,
        },
        enable_mkldnn=True,
    )


def decode_image(body: bytes, content_type: str) -> np.ndarray:
    try:
        with Image.open(io.BytesIO(body)) as source:
            if source.format != EXPECTED_FORMATS.get(content_type):
                raise ValueError("declared image type does not match file")
            if source.width * source.height > MAX_IMAGE_PIXELS:
                raise ValueError("image dimensions exceed limit")
            source.verify()
        with Image.open(io.BytesIO(body)) as source:
            image = ImageOps.exif_transpose(source).convert("RGB")
            if image.width < 120 or image.height < 120:
                raise ValueError("image too small")
            if image.width > 8000 or image.height > 8000 or image.width * image.height > MAX_IMAGE_PIXELS:
                raise ValueError("image dimensions exceed limit")
            # PaddleX leaves ndarray inputs unchanged and its OCR reader expects BGR.
            return np.ascontiguousarray(np.asarray(image)[:, :, ::-1])
    except (UnidentifiedImageError, Image.DecompressionBombError, ValueError, OSError) as error:
        raise HTTPException(status_code=422, detail="invalid_image") from error


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.ocr = _pipeline()
    yield
    app.state.ocr = None


app = FastAPI(
    title="BagiYuk Receipt OCR",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
    lifespan=lifespan,
)


class OcrLine(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)

    text: str
    score: float
    poly: list[tuple[float, float]]


class OcrResponse(BaseModel):
    engine: str
    lines: list[OcrLine]


async def read_bounded_body(request: Request) -> bytes:
    chunks: list[bytes] = []
    total = 0
    async for chunk in request.stream():
        total += len(chunk)
        if total > MAX_IMAGE_BYTES:
            raise HTTPException(status_code=413, detail="image_too_large")
        chunks.append(chunk)
    return b"".join(chunks)


@app.get("/healthz")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/ocr", response_model=OcrResponse)
async def recognize(request: Request) -> OcrResponse:
    content_type = request.headers.get("content-type", "").split(";", 1)[0].lower()
    if content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=415, detail="unsupported_image_type")
    length = request.headers.get("content-length")
    if length:
        try:
            if int(length) > MAX_IMAGE_BYTES:
                raise HTTPException(status_code=413, detail="image_too_large")
        except ValueError as error:
            raise HTTPException(status_code=400, detail="invalid_content_length") from error
    body = await read_bounded_body(request)
    if not body:
        raise HTTPException(status_code=413, detail="image_too_large")

    image = decode_image(body, content_type)
    watchdog = threading.Timer(INFERENCE_TIMEOUT_SECONDS, lambda: os._exit(124))
    watchdog.daemon = True
    watchdog.start()
    try:
        results = list(request.app.state.ocr.predict(image))
        lines = extract_lines(results)
    except Exception as error:
        logging.getLogger(__name__).exception("OCR inference failed without logging receipt data")
        raise HTTPException(status_code=502, detail="ocr_failed") from error
    finally:
        watchdog.cancel()
        del image
        del body
    if not lines:
        raise HTTPException(status_code=422, detail="no_text_detected")
    return OcrResponse(engine="PP-OCRv6-small", lines=lines)

from __future__ import annotations

import os
import hashlib
import shutil
from pathlib import Path

from paddleocr import PaddleOCR

cache = Path("/root/.paddlex/official_models")
target = Path(os.getenv("PADDLE_MODEL_HOME", "/opt/paddle-models"))

EXPECTED_MODEL_SHA256 = {
    "PP-LCNet_x1_0_doc_ori": "7de164de5d200844af44c0adc698bed97018138f91473b293100145cdd6b0ce4",
    "PP-LCNet_x1_0_textline_ori": "d55d8a6b79ed3178a29d3b77b12d057ec8fe45142a80b8bbf5701798edb94383",
    "PP-OCRv6_small_det": "8be5289a3fd15126fed19f15a84f5810cbfa5164068e3b98cf71a68f6905b29e",
    "PP-OCRv6_small_rec": "8c0f504df8d7b5a5efe8c40469629a1a1923c83b5a61b0fb52e3912e635b10d0",
}


def directory_digest(directory: Path) -> str:
    digest = hashlib.sha256()
    for file in sorted(path for path in directory.rglob("*") if path.is_file()):
        digest.update(file.relative_to(directory).as_posix().encode("utf-8"))
        digest.update(b"\0")
        with file.open("rb") as source:
            for chunk in iter(lambda: source.read(1024 * 1024), b""):
                digest.update(chunk)
    return digest.hexdigest()

PaddleOCR(
    text_detection_model_name="PP-OCRv6_small_det",
    text_recognition_model_name="PP-OCRv6_small_rec",
    use_doc_orientation_classify=True,
    use_doc_unwarping=False,
    use_textline_orientation=True,
    device="cpu",
)

target.mkdir(parents=True, exist_ok=True)
missing = []
for name in (
    "PP-OCRv6_small_det",
    "PP-OCRv6_small_rec",
    "PP-LCNet_x1_0_doc_ori",
    "PP-LCNet_x1_0_textline_ori",
):
    source = cache / name
    if source.exists():
        destination = target / name
        if destination.exists():
            shutil.rmtree(destination)
        shutil.copytree(source, destination)
        shutil.rmtree(destination / ".cache", ignore_errors=True)
        actual_digest = directory_digest(destination)
        if actual_digest != EXPECTED_MODEL_SHA256[name]:
            raise RuntimeError(
                f"Checksum mismatch for {name}: expected {EXPECTED_MODEL_SHA256[name]}, got {actual_digest}"
            )
    else:
        missing.append(name)

if missing:
    raise RuntimeError(f"Required OCR models were not downloaded: {', '.join(missing)}")

# Keep only the explicit, runtime model copy in the final image layer.
shutil.rmtree(cache.parent, ignore_errors=True)

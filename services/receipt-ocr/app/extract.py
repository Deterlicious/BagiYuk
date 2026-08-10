from __future__ import annotations

import math
from typing import Any, Iterator


def _result_payload(result: Any) -> dict[str, Any]:
    value = getattr(result, "json", result)
    if callable(value):
        value = value()
    if isinstance(value, dict) and isinstance(value.get("res"), dict):
        return value["res"]
    if isinstance(value, dict):
        return value
    raise ValueError("unsupported PaddleOCR result")


def _candidate_dicts(value: Any) -> Iterator[dict[str, Any]]:
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from _candidate_dicts(child)
    elif isinstance(value, (list, tuple)):
        for child in value:
            yield from _candidate_dicts(child)


def _as_list(value: Any) -> list[Any] | None:
    if isinstance(value, (list, tuple)):
        return list(value)
    tolist = getattr(value, "tolist", None)
    if callable(tolist):
        converted = tolist()
        return converted if isinstance(converted, list) else None
    return None


def extract_lines(results: list[Any]) -> list[dict[str, Any]]:
    lines: list[dict[str, Any]] = []
    for result in results:
        payload = _result_payload(result)
        ocr = next(
            (
                candidate
                for candidate in _candidate_dicts(payload)
                if _as_list(candidate.get("rec_texts")) is not None
                and (
                    _as_list(candidate.get("rec_polys")) is not None
                    or _as_list(candidate.get("rec_boxes")) is not None
                )
            ),
            payload,
        )
        texts = _as_list(ocr.get("rec_texts")) or []
        scores = _as_list(ocr.get("rec_scores")) or []
        polygons = _as_list(ocr.get("rec_polys"))
        boxes = _as_list(ocr.get("rec_boxes"))

        for index, raw_text in enumerate(texts):
            text = str(raw_text).strip()
            if not text or len(text) > 300:
                continue
            raw_poly = polygons[index] if polygons is not None and index < len(polygons) else None
            if raw_poly is None and boxes is not None and index < len(boxes):
                left, top, right, bottom = boxes[index]
                raw_poly = [[left, top], [right, top], [right, bottom], [left, bottom]]
            if not isinstance(raw_poly, (list, tuple)) or len(raw_poly) < 4:
                continue
            try:
                poly = [[float(point[0]), float(point[1])] for point in raw_poly]
                score = float(scores[index]) if index < len(scores) else 0.5
            except (IndexError, TypeError, ValueError):
                continue
            if not math.isfinite(score) or any(
                not math.isfinite(coordinate) for point in poly for coordinate in point
            ):
                continue
            lines.append({"text": text, "score": max(0.0, min(1.0, score)), "poly": poly})
    return lines[:600]

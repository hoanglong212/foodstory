import contextlib
import io
import json
import math
import numbers
import os
import sys


DEBUG_ENABLED = os.getenv("TRACK2_V3_LOCAL_OCR_DEBUG", "").strip().lower() == "true"


def json_safe(value):
    """Recursively convert EasyOCR/numpy values to strict JSON primitives."""
    if value is None or isinstance(value, (bool, str)):
        return value
    if isinstance(value, numbers.Integral):
        return int(value)
    if isinstance(value, numbers.Real):
        number = float(value)
        return number if math.isfinite(number) else None
    if isinstance(value, dict):
        return {str(key): json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [json_safe(item) for item in value]

    tolist = getattr(value, "tolist", None)
    if callable(tolist):
        return json_safe(tolist())
    item = getattr(value, "item", None)
    if callable(item):
        scalar = item()
        if scalar is not value:
            return json_safe(scalar)
    return str(value)


def emit(payload):
    try:
        encoded = json.dumps(
            json_safe(payload),
            ensure_ascii=False,
            allow_nan=False,
            separators=(",", ":"),
        )
    except Exception as error:  # Last-resort JSON contract protection.
        fallback = {
            "status": "ERROR",
            "reason": "EASYOCR_JSON_SERIALIZATION_FAILED",
        }
        if DEBUG_ENABLED:
            fallback["diagnostics"] = debug_diagnostics(exception=error, exit_code=0)
        encoded = json.dumps(fallback, ensure_ascii=False, allow_nan=False)
    encoded_bytes = encoded.encode("utf-8")
    stdout_buffer = getattr(sys.stdout, "buffer", None)
    if stdout_buffer is not None:
        stdout_buffer.write(encoded_bytes)
        stdout_buffer.flush()
    else:
        sys.stdout.write(encoded)
        sys.stdout.flush()


def debug_diagnostics(
    *,
    easyocr_import_ok=False,
    reader_loaded_ok=False,
    images=None,
    exception=None,
    exit_code=None,
):
    if not DEBUG_ENABLED:
        return None
    image_list = images if isinstance(images, list) else []
    first_path = ""
    if image_list and isinstance(image_list[0], dict):
        first_path = str(image_list[0].get("imagePath") or "")
    diagnostics = {
        "pythonExecutable": str(sys.executable or "")[:1000],
        "easyocrImportOk": bool(easyocr_import_ok),
        "readerLoadedOk": bool(reader_loaded_ok),
        "imageCountReceived": len(image_list),
        "firstImagePathExists": bool(first_path and os.path.exists(first_path)),
    }
    if exception is not None:
        diagnostics["exceptionClass"] = type(exception).__name__[:200]
        diagnostics["exceptionMessage"] = str(exception)[:1000]
    if exit_code is not None:
        diagnostics["exitCode"] = int(exit_code)
    return diagnostics


def response(payload, **diagnostic_values):
    diagnostics = debug_diagnostics(**diagnostic_values)
    if diagnostics is not None:
        payload["diagnostics"] = diagnostics
    return payload


def load_easyocr():
    try:
        # Third-party startup chatter must never corrupt the stdout JSON contract.
        with contextlib.redirect_stdout(io.StringIO()):
            import easyocr  # pylint: disable=import-outside-toplevel

        return easyocr, None
    except Exception as error:
        return None, error


def json_bbox(box):
    points = json_safe(box)
    if not isinstance(points, list):
        return []
    normalized = []
    for point in points:
        if not isinstance(point, list) or len(point) < 2:
            continue
        try:
            normalized.append([int(float(point[0])), int(float(point[1]))])
        except (TypeError, ValueError, OverflowError):
            continue
    return normalized


def box_metrics(box):
    normalized_box = json_bbox(box)
    if not normalized_box:
        return None
    xs = [point[0] for point in normalized_box]
    ys = [point[1] for point in normalized_box]
    return {
        "bbox": normalized_box,
        "left": min(xs),
        "right": max(xs),
        "top": min(ys),
        "bottom": max(ys),
        "center_y": (min(ys) + max(ys)) / 2,
        "height": max(1.0, max(ys) - min(ys)),
    }


def group_text_lines(detections):
    words = []
    for detection in detections:
        if not isinstance(detection, (list, tuple)) or len(detection) < 3:
            continue
        box, text, confidence = detection[0], str(detection[1]).strip(), detection[2]
        if not text:
            continue
        metrics = box_metrics(box)
        if metrics is None:
            continue
        words.append({
            **metrics,
            "text": text,
            "confidence": float(confidence or 0),
        })

    words.sort(key=lambda item: (item["center_y"], item["left"]))
    lines = []
    for word in words:
        matched_line = None
        for line in lines:
            threshold = max(line["height"], word["height"]) * 0.6
            if abs(line["center_y"] - word["center_y"]) <= threshold:
                matched_line = line
                break
        if matched_line is None:
            matched_line = {
                "center_y": word["center_y"],
                "height": word["height"],
                "words": [],
            }
            lines.append(matched_line)
        matched_line["words"].append(word)
        count = len(matched_line["words"])
        matched_line["center_y"] = (
            (matched_line["center_y"] * (count - 1)) + word["center_y"]
        ) / count
        matched_line["height"] = max(matched_line["height"], word["height"])

    lines.sort(key=lambda line: line["center_y"])
    text_lines = []
    confidences = []
    for line in lines:
        ordered = sorted(line["words"], key=lambda item: item["left"])
        text_lines.append(" ".join(word["text"] for word in ordered))
        confidences.extend(word["confidence"] for word in ordered)

    if words:
        left = min(word["left"] for word in words)
        right = max(word["right"] for word in words)
        top = min(word["top"] for word in words)
        bottom = max(word["bottom"] for word in words)
        bbox = [[left, top], [right, top], [right, bottom], [left, bottom]]
    else:
        bbox = []

    return {
        "rawText": "\n".join(text_lines),
        "confidence": sum(confidences) / len(confidences) if confidences else 0.0,
        "bbox": bbox,
    }


def main():
    global DEBUG_ENABLED
    easyocr, import_error = load_easyocr()
    if "--probe" in sys.argv:
        emit(response(
            {
                "status": "OK" if easyocr is not None else "UNAVAILABLE",
                "reason": (
                    "EASYOCR_AVAILABLE"
                    if easyocr is not None
                    else "EASYOCR_IMPORT_UNAVAILABLE"
                ),
            },
            easyocr_import_ok=easyocr is not None,
            exception=import_error,
            exit_code=0,
        ))
        return

    if easyocr is None:
        emit(response(
            {"status": "UNAVAILABLE", "reason": "EASYOCR_IMPORT_UNAVAILABLE"},
            easyocr_import_ok=False,
            exception=import_error,
            exit_code=0,
        ))
        return

    images = []
    reader_loaded_ok = False
    try:
        request = json.load(sys.stdin)
        DEBUG_ENABLED = DEBUG_ENABLED or request.get("debug") is True
        languages = request.get("languages") or ["vi", "en"]
        images = request.get("images") or []
        try:
            with contextlib.redirect_stdout(io.StringIO()):
                reader = easyocr.Reader(
                    languages,
                    gpu=False,
                    verbose=False,
                    download_enabled=False,
                )
            reader_loaded_ok = True
        except Exception as error:
            emit(response(
                {"status": "UNAVAILABLE", "reason": "EASYOCR_MODEL_UNAVAILABLE"},
                easyocr_import_ok=True,
                reader_loaded_ok=False,
                images=images,
                exception=error,
                exit_code=0,
            ))
            return

        results = []
        for image in images:
            image_data = image if isinstance(image, dict) else {}
            image_path = str(image_data.get("imagePath") or "")
            with contextlib.redirect_stdout(io.StringIO()):
                detections = reader.readtext(image_path, detail=1, paragraph=False)
            grouped = group_text_lines(detections)
            results.append({
                "source": "local_easyocr",
                **grouped,
                "imagePath": image_path,
                "timestampSeconds": image_data.get("timestampSeconds"),
                "cropVariant": image_data.get("cropVariant"),
                "preprocessingVariant": image_data.get("preprocessingVariant"),
            })
        emit(response(
            {"status": "OK", "results": results},
            easyocr_import_ok=True,
            reader_loaded_ok=True,
            images=images,
            exit_code=0,
        ))
    except Exception as error:
        emit(response(
            {"status": "ERROR", "reason": "EASYOCR_EXECUTION_FAILED"},
            easyocr_import_ok=True,
            reader_loaded_ok=reader_loaded_ok,
            images=images,
            exception=error,
            exit_code=0,
        ))


if __name__ == "__main__":
    main()

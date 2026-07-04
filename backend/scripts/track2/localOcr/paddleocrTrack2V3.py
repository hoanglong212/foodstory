import os

# These flags must be set before PaddleOCR/PaddleX/Paddle are imported on Windows CPU.
os.environ["FLAGS_use_mkldnn"] = "0"
os.environ["PADDLE_PDX_ENABLE_MKLDNN_BYDEFAULT"] = "0"
os.environ["PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK"] = "True"

import contextlib
import io
import json
import math
import numbers
from pathlib import Path
import sys


DEBUG_ENABLED = os.getenv("TRACK2_V3_LOCAL_OCR_DEBUG", "").strip().lower() == "true"


def json_safe(value):
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
    except Exception as error:
        fallback = {
            "status": "ERROR",
            "reason": "PADDLEOCR_JSON_SERIALIZATION_FAILED",
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
    paddleocr_import_ok=False,
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
        "paddleocrImportOk": bool(paddleocr_import_ok),
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


def load_paddleocr():
    try:
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            from paddleocr import PaddleOCR  # pylint: disable=import-outside-toplevel
        return PaddleOCR, None
    except Exception as error:
        return None, error


def cached_model_kwargs(allow_model_download=False):
    if allow_model_download:
        return {}
    cache_home = Path(os.getenv("PADDLE_PDX_CACHE_HOME") or Path.home() / ".paddlex")
    model_root = cache_home / "official_models"
    detection_dir = model_root / "PP-OCRv6_medium_det"
    recognition_dir = model_root / "PP-OCRv6_medium_rec"
    if not detection_dir.is_dir() or not recognition_dir.is_dir():
        raise FileNotFoundError("Cached PaddleOCR detection/recognition models are unavailable.")
    if not any(detection_dir.iterdir()) or not any(recognition_dir.iterdir()):
        raise FileNotFoundError("Cached PaddleOCR detection/recognition models are incomplete.")
    return {
        "text_detection_model_dir": str(detection_dir),
        "text_recognition_model_dir": str(recognition_dir),
    }


def json_bbox(value):
    points = json_safe(value)
    if not isinstance(points, list):
        return []
    if len(points) == 4 and all(isinstance(item, numbers.Real) for item in points):
        left, top, right, bottom = [int(float(item)) for item in points]
        return [[left, top], [right, top], [right, bottom], [left, bottom]]
    normalized = []
    for point in points:
        if not isinstance(point, list) or len(point) < 2:
            continue
        try:
            normalized.append([int(float(point[0])), int(float(point[1]))])
        except (TypeError, ValueError, OverflowError):
            continue
    return normalized


def aggregate_bbox(boxes):
    points = [point for box in boxes for point in box]
    if not points:
        return []
    xs = [point[0] for point in points]
    ys = [point[1] for point in points]
    left, right = min(xs), max(xs)
    top, bottom = min(ys), max(ys)
    return [[left, top], [right, top], [right, bottom], [left, bottom]]


def paddle_v3_lines(predictions):
    lines = []
    for prediction in predictions if isinstance(predictions, (list, tuple)) else [predictions]:
        if not isinstance(prediction, dict):
            continue
        texts_value = prediction.get("rec_texts")
        scores_value = prediction.get("rec_scores")
        polygons_value = prediction.get("rec_polys")
        if polygons_value is None:
            polygons_value = prediction.get("dt_polys")
        if polygons_value is None:
            polygons_value = prediction.get("rec_boxes")
        texts = json_safe(texts_value if texts_value is not None else [])
        scores = json_safe(scores_value if scores_value is not None else [])
        polygons = json_safe(polygons_value if polygons_value is not None else [])
        for index, text in enumerate(texts if isinstance(texts, list) else []):
            clean_text = str(text or "").strip()
            if not clean_text:
                continue
            score = scores[index] if isinstance(scores, list) and index < len(scores) else 0
            box = polygons[index] if isinstance(polygons, list) and index < len(polygons) else []
            lines.append({
                "text": clean_text,
                "confidence": float(score or 0),
                "bbox": json_bbox(box),
            })
    return lines


def paddle_v2_lines(predictions):
    lines = []
    batches = predictions if isinstance(predictions, (list, tuple)) else []
    for batch in batches:
        for detection in batch if isinstance(batch, (list, tuple)) else []:
            if not isinstance(detection, (list, tuple)) or len(detection) < 2:
                continue
            recognition = detection[1]
            if not isinstance(recognition, (list, tuple)) or not recognition:
                continue
            text = str(recognition[0] or "").strip()
            if not text:
                continue
            confidence = recognition[1] if len(recognition) > 1 else 0
            lines.append({
                "text": text,
                "confidence": float(confidence or 0),
                "bbox": json_bbox(detection[0]),
            })
    return lines


def grouped_result(predictions):
    lines = paddle_v3_lines(predictions)
    if not lines:
        lines = paddle_v2_lines(predictions)
    confidences = [line["confidence"] for line in lines]
    return {
        "rawText": "\n".join(line["text"] for line in lines),
        "confidence": sum(confidences) / len(confidences) if confidences else 0.0,
        "bbox": aggregate_bbox([line["bbox"] for line in lines if line["bbox"]]),
    }


def create_reader(paddleocr_class, allow_model_download):
    model_kwargs = cached_model_kwargs(allow_model_download)
    return paddleocr_class(
        lang="vi",
        device="cpu",
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
        **model_kwargs,
    )


def predict_image(reader, image_path):
    if hasattr(reader, "predict"):
        return reader.predict(
            image_path,
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
        )
    return reader.ocr(image_path, cls=False)


def main():
    global DEBUG_ENABLED
    paddleocr_class, import_error = load_paddleocr()
    if "--probe" in sys.argv:
        emit(response(
            {
                "status": "OK" if paddleocr_class is not None else "UNAVAILABLE",
                "reason": (
                    "PADDLEOCR_AVAILABLE"
                    if paddleocr_class is not None
                    else "PADDLEOCR_IMPORT_UNAVAILABLE"
                ),
            },
            paddleocr_import_ok=paddleocr_class is not None,
            exception=import_error,
            exit_code=0,
        ))
        return

    if paddleocr_class is None:
        emit(response(
            {"status": "UNAVAILABLE", "reason": "PADDLEOCR_IMPORT_UNAVAILABLE"},
            paddleocr_import_ok=False,
            exception=import_error,
            exit_code=0,
        ))
        return

    images = []
    reader_loaded_ok = False
    try:
        request = json.load(sys.stdin)
        DEBUG_ENABLED = DEBUG_ENABLED or request.get("debug") is True
        images = request.get("images") or []
        allow_model_download = request.get("allowModelDownload") is True
        try:
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                reader = create_reader(paddleocr_class, allow_model_download)
            reader_loaded_ok = True
        except FileNotFoundError as error:
            emit(response(
                {"status": "UNAVAILABLE", "reason": "PADDLEOCR_MODEL_UNAVAILABLE"},
                paddleocr_import_ok=True,
                reader_loaded_ok=False,
                images=images,
                exception=error,
                exit_code=0,
            ))
            return
        except Exception as error:
            emit(response(
                {"status": "ERROR", "reason": "PADDLEOCR_READER_FAILED"},
                paddleocr_import_ok=True,
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
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                predictions = predict_image(reader, image_path)
            grouped = grouped_result(predictions)
            results.append({
                "source": "local_paddleocr",
                **grouped,
                "imagePath": image_path,
                "timestampSeconds": image_data.get("timestampSeconds"),
                "cropVariant": image_data.get("cropVariant"),
                "preprocessingVariant": image_data.get("preprocessingVariant"),
            })
        emit(response(
            {"status": "OK", "results": results},
            paddleocr_import_ok=True,
            reader_loaded_ok=True,
            images=images,
            exit_code=0,
        ))
    except Exception as error:
        emit(response(
            {"status": "ERROR", "reason": "PADDLEOCR_EXECUTION_FAILED"},
            paddleocr_import_ok=True,
            reader_loaded_ok=reader_loaded_ok,
            images=images,
            exception=error,
            exit_code=0,
        ))


if __name__ == "__main__":
    main()

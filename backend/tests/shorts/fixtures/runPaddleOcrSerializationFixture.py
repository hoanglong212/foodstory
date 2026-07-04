import importlib.util
import io
import json
import pathlib
import sys


class NumpyLikeInt:
    def __init__(self, value):
        self.value = value

    def item(self):
        return self.value


class NumpyLikeFloat:
    def __init__(self, value):
        self.value = value

    def item(self):
        return self.value

    def __float__(self):
        return float(self.value)


class NumpyLikeArray:
    def __init__(self, value):
        self.value = value

    def tolist(self):
        return self.value


class FakePaddleOcr:
    def __init__(self, *_args, **_kwargs):
        pass

    def predict(self, *_args, **_kwargs):
        return [{
            "rec_texts": ["1143 3/2 Phường 6 Quận 10"],
            "rec_scores": NumpyLikeArray([NumpyLikeFloat(0.875)]),
            "rec_polys": NumpyLikeArray([[
                [NumpyLikeInt(10), NumpyLikeInt(20)],
                [NumpyLikeInt(110), NumpyLikeInt(20)],
                [NumpyLikeInt(110), NumpyLikeInt(50)],
                [NumpyLikeInt(10), NumpyLikeInt(50)],
            ]]),
        }]


script_path = (
    pathlib.Path(__file__).resolve().parents[3]
    / "scripts"
    / "track2"
    / "localOcr"
    / "paddleocrTrack2V3.py"
)
spec = importlib.util.spec_from_file_location("paddleocr_track2_v3", script_path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module.load_paddleocr = lambda: (FakePaddleOcr, None)
module.cached_model_kwargs = lambda _allow_model_download=False: {}

sys.argv = [str(script_path)]
sys.stdin = io.StringIO(json.dumps({
    "images": [{
        "imagePath": "offline-selected-crop.jpg",
        "timestampSeconds": 19.125,
        "cropVariant": "upper_middle_crop_raw",
        "preprocessingVariant": "original",
    }],
}))
module.main()

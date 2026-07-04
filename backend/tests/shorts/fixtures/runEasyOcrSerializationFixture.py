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


class FakeReader:
    def __init__(self, *_args, **_kwargs):
        pass

    def readtext(self, *_args, **_kwargs):
        return [
            (
                NumpyLikeArray([
                    [NumpyLikeInt(10), NumpyLikeInt(20)],
                    [NumpyLikeInt(110), NumpyLikeInt(20)],
                    [NumpyLikeInt(110), NumpyLikeInt(50)],
                    [NumpyLikeInt(10), NumpyLikeInt(50)],
                ]),
                "1143 3/2 Phường 6 Quận 10",
                NumpyLikeFloat(0.875),
            ),
        ]


class FakeEasyOcr:
    Reader = FakeReader


script_path = (
    pathlib.Path(__file__).resolve().parents[3]
    / "scripts"
    / "track2"
    / "localOcr"
    / "easyocrTrack2V3.py"
)
spec = importlib.util.spec_from_file_location("easyocr_track2_v3", script_path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module.load_easyocr = lambda: (FakeEasyOcr, None)

sys.argv = [str(script_path)]
sys.stdin = io.StringIO(json.dumps({
    "languages": ["vi", "en"],
    "images": [{
        "imagePath": "offline-selected-crop.jpg",
        "timestampSeconds": 19.125,
        "cropVariant": "upper_middle_crop_raw",
        "preprocessingVariant": "original",
    }],
}))
module.main()

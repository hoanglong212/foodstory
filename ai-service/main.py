import asyncio
import io
import ipaddress
import socket
from contextlib import asynccontextmanager
from urllib.parse import urljoin, urlparse

import httpx
import open_clip
import torch
from fastapi import FastAPI, File, HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
CLIP_MODEL_NAME = "ViT-B-32"
CLIP_PRETRAINED = "openai"
MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_IMAGE_REDIRECTS = 3
ALLOWED_IMAGE_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
FOOD_PROMPTS = [
    "a close-up photo of a prepared meal",
    "a photo of food served on a plate",
    "a bowl of noodles or soup",
    "a restaurant dish ready to eat",
]
NON_FOOD_PROMPTS = [
    "a landscape or nature photo",
    "a photo of a person",
    "a photo of an animal",
    "a photo of a building or street",
    "a screenshot or document",
    "an abstract or blank image",
    "a photo of a vehicle",
]
DISH_CLASSES = [
    {
        "dish_name": "Cơm tấm",
        "category": "Broken Rice",
        "prompts": [
            "cơm tấm",
            "broken rice",
            "cơm sườn trứng",
            "grilled pork chop rice",
            "Vietnamese broken rice with grilled pork chop and fried egg",
        ],
    },
    {
        "dish_name": "Bánh mì",
        "category": "Banh Mi",
        "prompts": [
            "bánh mì",
            "banh mi",
            "Vietnamese baguette sandwich",
        ],
    },
    {
        "dish_name": "Phở",
        "category": "Pho",
        "prompts": [
            "phở",
            "pho",
            "Vietnamese pho noodle soup",
        ],
    },
    {
        "dish_name": "Hủ tiếu",
        "category": "Hu Tieu",
        "prompts": [
            "hủ tiếu",
            "hu tieu",
            "Vietnamese clear noodle soup",
        ],
    },
    {
        "dish_name": "Bún bò Huế",
        "category": "Beef Noodle Soup",
        "prompts": [
            "bún bò",
            "bun bo hue",
            "Vietnamese spicy beef noodle soup",
        ],
    },
    {
        "dish_name": "Bún đậu",
        "category": "Tofu Vermicelli",
        "prompts": [
            "bún đậu",
            "bun dau",
            "Vietnamese vermicelli with fried tofu",
        ],
    },
    {
        "dish_name": "Mì Quảng",
        "category": "Noodles",
        "prompts": [
            "mì quảng",
            "mi quang",
            "Vietnamese turmeric noodles with herbs",
        ],
    },
    {
        "dish_name": "Gỏi cuốn",
        "category": "Spring Rolls",
        "prompts": [
            "gỏi cuốn",
            "goi cuon",
            "Vietnamese fresh spring rolls",
        ],
    },
    {
        "dish_name": "Bánh cuốn",
        "category": "Steamed Rice Rolls",
        "prompts": [
            "bánh cuốn",
            "banh cuon",
            "Vietnamese steamed rice rolls",
        ],
    },
    {
        "dish_name": "Cháo gà",
        "category": "Congee",
        "prompts": [
            "cháo gà",
            "chicken congee",
            "Vietnamese chicken rice porridge",
        ],
    },
    {
        "dish_name": "Cơm gà",
        "category": "Chicken Rice",
        "prompts": [
            "cơm gà",
            "chicken rice",
            "Vietnamese chicken rice plate",
        ],
    },
    {
        "dish_name": "Cà phê sữa đá",
        "category": "Cafe",
        "prompts": [
            "cà phê sữa đá",
            "Vietnamese iced coffee",
            "Vietnamese iced coffee with condensed milk",
        ],
    },
    {
        "dish_name": "Bún thịt nướng",
        "category": "Rice Vermicelli",
        "prompts": [
            "bún thịt nướng",
            "grilled pork vermicelli",
            "Vietnamese rice vermicelli with grilled pork",
        ],
    },
    {
        "dish_name": "Bún chả",
        "category": "Rice Vermicelli",
        "prompts": [
            "bún chả",
            "bun cha",
            "Vietnamese grilled pork with rice vermicelli",
        ],
    },
]

model = SentenceTransformer(MODEL_NAME)
clip_model = None
clip_preprocess = None
clip_tokenizer = None
food_class_features = None
dish_class_features = None


def load_clip_model():
    global clip_model, clip_preprocess, clip_tokenizer, food_class_features
    global dish_class_features

    if clip_model is None:
        clip_model, _, clip_preprocess = open_clip.create_model_and_transforms(
            CLIP_MODEL_NAME,
            pretrained=CLIP_PRETRAINED,
            force_quick_gelu=True,
        )
        clip_model = clip_model.to(DEVICE)
        clip_model.eval()
        clip_tokenizer = open_clip.get_tokenizer(CLIP_MODEL_NAME)

        with torch.inference_mode():
            class_features = []
            for prompts in (FOOD_PROMPTS, NON_FOOD_PROMPTS):
                prompt_features = clip_model.encode_text(clip_tokenizer(prompts).to(DEVICE))
                prompt_features = prompt_features / prompt_features.norm(dim=-1, keepdim=True)
                class_feature = prompt_features.mean(dim=0, keepdim=True)
                class_features.append(
                    class_feature / class_feature.norm(dim=-1, keepdim=True)
                )
            food_class_features = torch.cat(class_features, dim=0)

            dish_features = []
            for dish_class in DISH_CLASSES:
                prompt_features = clip_model.encode_text(
                    clip_tokenizer(dish_class["prompts"]).to(DEVICE)
                )
                prompt_features = prompt_features / prompt_features.norm(
                    dim=-1, keepdim=True
                )
                class_feature = prompt_features.mean(dim=0, keepdim=True)
                dish_features.append(
                    class_feature / class_feature.norm(dim=-1, keepdim=True)
                )
            dish_class_features = torch.cat(dish_features, dim=0)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await asyncio.to_thread(load_clip_model)
    yield


app = FastAPI(
    title="FoodStory AI Service",
    description="Local embedding service for FoodStory retrieval and visual search",
    version="1.1.0",
    lifespan=lifespan,
)


class TextEmbeddingRequest(BaseModel):
    text: str


class ImageUrlEmbeddingRequest(BaseModel):
    url: str


class ClipTextEmbeddingRequest(BaseModel):
    text: str


def encode_image(contents: bytes):
    if len(contents) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image must be 5MB or smaller")

    try:
        image = Image.open(io.BytesIO(contents))
        image.load()
        image = image.convert("RGB")
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as error:
        raise HTTPException(status_code=400, detail="Invalid or unsupported image") from error

    image_tensor = clip_preprocess(image).unsqueeze(0).to(DEVICE)
    with torch.inference_mode():
        image_features = clip_model.encode_image(image_tensor)
        image_features = image_features / image_features.norm(dim=-1, keepdim=True)
        class_logits = (
            clip_model.logit_scale.exp() * image_features @ food_class_features.T
        )
        food_score = torch.softmax(class_logits, dim=-1)[0, 0].item()
        dish_scores = (image_features @ dish_class_features.T)[0]
        top_dish_count = min(5, len(DISH_CLASSES))
        top_dish_scores, top_dish_indices = torch.topk(
            dish_scores,
            k=top_dish_count,
        )

    dish_predictions = []
    for score, index in zip(
        top_dish_scores.cpu().tolist(),
        top_dish_indices.cpu().tolist(),
    ):
        dish_class = DISH_CLASSES[index]
        dish_predictions.append(
            {
                "dish_name": dish_class["dish_name"],
                "category": dish_class["category"],
                "score": round(score, 4),
                "source": "clip_dish_prompts",
            }
        )

    embedding = image_features.cpu().numpy()[0].tolist()
    return {
        "embedding": embedding,
        "dimension": len(embedding),
        "model": f"{CLIP_MODEL_NAME}:{CLIP_PRETRAINED}",
        "food_score": round(food_score, 4),
        "dish_predictions": dish_predictions,
    }


def encode_clip_text(text: str):
    tokens = clip_tokenizer([text]).to(DEVICE)
    with torch.inference_mode():
        text_features = clip_model.encode_text(tokens)
        text_features = text_features / text_features.norm(dim=-1, keepdim=True)

    embedding = text_features.cpu().numpy()[0].tolist()
    return {
        "text": text,
        "embedding": embedding,
        "dimension": len(embedding),
        "model": f"{CLIP_MODEL_NAME}:{CLIP_PRETRAINED}",
    }


async def validate_public_image_url(url: str):
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise HTTPException(status_code=400, detail="Image URL must use http or https")

    try:
        addresses = await asyncio.to_thread(
            socket.getaddrinfo,
            parsed.hostname,
            parsed.port or (443 if parsed.scheme == "https" else 80),
            type=socket.SOCK_STREAM,
        )
    except socket.gaierror as error:
        raise HTTPException(status_code=400, detail="Image URL host could not be resolved") from error

    for address in addresses:
        ip = ipaddress.ip_address(address[4][0])
        if not ip.is_global:
            raise HTTPException(status_code=400, detail="Private image URLs are not allowed")


async def download_image(url: str):
    current_url = url

    async with httpx.AsyncClient(timeout=10.0) as client:
        for redirect_count in range(MAX_IMAGE_REDIRECTS + 1):
            await validate_public_image_url(current_url)
            try:
                request = client.build_request("GET", current_url)
                response = await client.send(
                    request,
                    stream=True,
                    follow_redirects=False,
                )
            except httpx.HTTPError as error:
                raise HTTPException(status_code=400, detail="Unable to download image URL") from error

            try:
                if response.is_redirect:
                    if redirect_count == MAX_IMAGE_REDIRECTS:
                        raise HTTPException(
                            status_code=400,
                            detail="Image URL redirected too many times",
                        )
                    location = response.headers.get("location")
                    if not location:
                        raise HTTPException(status_code=400, detail="Invalid image redirect")
                    current_url = urljoin(current_url, location)
                    continue

                try:
                    response.raise_for_status()
                except httpx.HTTPStatusError as error:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Image URL returned HTTP {response.status_code}",
                    ) from error

                content_type = response.headers.get("content-type", "").split(";")[0].lower()
                if content_type not in ALLOWED_IMAGE_CONTENT_TYPES:
                    raise HTTPException(
                        status_code=400,
                        detail="URL did not return a supported image",
                    )

                contents = bytearray()
                async for chunk in response.aiter_bytes():
                    contents.extend(chunk)
                    if len(contents) > MAX_IMAGE_BYTES:
                        raise HTTPException(
                            status_code=413,
                            detail="Image must be 5MB or smaller",
                        )

                return bytes(contents)
            finally:
                await response.aclose()

    raise HTTPException(status_code=400, detail="Unable to download image URL")


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "foodstory-ai-service",
        "model": MODEL_NAME,
        "clip_model": f"{CLIP_MODEL_NAME}:{CLIP_PRETRAINED}",
        "clip_device": DEVICE,
        "clip_loaded": clip_model is not None,
        "dish_prompt_count": len(DISH_CLASSES),
    }


@app.post("/embed/text")
def embed_text(request: TextEmbeddingRequest):
    text = request.text.strip()

    if not text:
        raise HTTPException(status_code=400, detail="Text must not be empty")

    embedding = model.encode(text, normalize_embeddings=True)

    return {
        "text": text,
        "embedding": embedding.tolist(),
        "dimension": len(embedding),
        "model": MODEL_NAME,
    }


@app.post("/embed-image")
async def embed_image(file: UploadFile = File(...)):
    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED_IMAGE_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, WebP, or GIF images are allowed")

    contents = await file.read(MAX_IMAGE_BYTES + 1)
    return await asyncio.to_thread(encode_image, contents)


@app.post("/embed-image-url")
async def embed_image_url(request: ImageUrlEmbeddingRequest):
    contents = await download_image(request.url.strip())
    return await asyncio.to_thread(encode_image, contents)


@app.post("/embed-clip-text")
async def embed_clip_text(request: ClipTextEmbeddingRequest):
    text = request.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text must not be empty")

    return await asyncio.to_thread(encode_clip_text, text)

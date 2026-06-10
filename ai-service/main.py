from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer

app = FastAPI(
    title="FoodStory AI Service",
    description="Local embedding service for FoodStory retrieval and chatbot",
    version="1.0.0",
)

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"

model = SentenceTransformer(MODEL_NAME)


class TextEmbeddingRequest(BaseModel):
    text: str


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "foodstory-ai-service",
        "model": MODEL_NAME,
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
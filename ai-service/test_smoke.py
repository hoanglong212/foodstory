import asyncio

from fastapi import HTTPException

import main


def expect_http_error(callable_, status_code):
    try:
        callable_()
    except HTTPException as error:
        assert error.status_code == status_code
        return
    raise AssertionError(f"Expected HTTP {status_code}.")


def run():
    health = main.health_check()
    assert health["status"] == "ok"
    assert health["service"] == "foodstory-ai-service"
    print("PASS lightweight health contract")

    embedded = main.embed_text(main.TextEmbeddingRequest(text="Vietnamese noodle soup"))
    assert embedded["dimension"] > 0
    assert len(embedded["embedding"]) == embedded["dimension"]
    print("PASS SentenceTransformer text embedding")

    expect_http_error(lambda: main.encode_image(b"not-an-image"), 400)
    print("PASS invalid image bytes are rejected")

    expect_http_error(
        lambda: asyncio.run(main.validate_public_image_url("http://127.0.0.1/private.jpg")),
        400,
    )
    print("PASS loopback/private image URL is rejected")
    print("AI service deterministic smoke complete: 4/4 checks passed, 0 failed.")


if __name__ == "__main__":
    run()

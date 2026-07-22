import asyncio

from fastapi import HTTPException

import main


class FakeNetworkStream:
    def __init__(self, address):
        self.address = address

    def get_extra_info(self, name):
        return self.address if name == "server_addr" else None


class FakeResponse:
    def __init__(self, address):
        self.extensions = {"network_stream": FakeNetworkStream(address)}


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
    assert health["text_model_loaded"] is False
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

    expect_http_error(
        lambda: main.validate_public_response_peer(FakeResponse(("127.0.0.1", 80))),
        400,
    )
    assert main.validate_public_response_peer(
        FakeResponse(("93.184.216.34", 443))
    ) == "93.184.216.34"
    print("PASS connected peer IP is revalidated after DNS resolution")

    assert main.embedding_request_is_authorized(
        "Bearer expected-token",
        configured_token="expected-token",
        require_auth=True,
    )
    assert not main.embedding_request_is_authorized(
        "Bearer wrong-token",
        configured_token="expected-token",
        require_auth=True,
    )
    assert not main.embedding_request_is_authorized(
        "",
        configured_token="",
        require_auth=True,
    )
    print("PASS AI service bearer-token boundary fails closed")
    print("AI service deterministic smoke complete: 6/6 checks passed, 0 failed.")


if __name__ == "__main__":
    run()

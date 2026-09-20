"""
Resolve Amazon Bedrock model for Strands, or flag mock fallback.

eu-north-1 catalog includes:
  - anthropic.claude-haiku-4-5-20251001-v1:0
  - amazon.nova-micro-v1:0
"""

from __future__ import annotations

import os
from typing import Any

PREFERRED_MODELS = [
    os.getenv("BEDROCK_MODEL_ID", "").strip(),
    "amazon.nova-micro-v1:0",
    "anthropic.claude-haiku-4-5-20251001-v1:0",
]


def region() -> str:
    return (
        os.getenv("AWS_REGION")
        or os.getenv("AWS_DEFAULT_REGION")
        or "eu-north-1"
    )


def try_bedrock_model() -> tuple[Any | None, str]:
    """
    Returns (model_or_None, status_message).
    status_message starts with MOCK_FALLBACK when Bedrock is unavailable.
    """
    try:
        from strands.models import BedrockModel
        import boto3
    except ImportError as e:
        return None, f"MOCK_FALLBACK: strands/boto3 import failed ({e})"

    reg = region()
    client = boto3.client("bedrock-runtime", region_name=reg)
    last_err = "no model tried"
    for mid in PREFERRED_MODELS:
        if not mid:
            continue
        try:
            client.converse(
                modelId=mid,
                messages=[{"role": "user", "content": [{"text": "ok"}]}],
                inferenceConfig={"maxTokens": 4},
            )
            model = BedrockModel(model_id=mid, region_name=reg)
            return model, f"BEDROCK: using {mid} in {reg}"
        except Exception as e:
            last_err = f"{mid}: {type(e).__name__}: {e}"
            continue
    return (
        None,
        f"MOCK_FALLBACK: Bedrock not usable in {reg} ({last_err}). "
        "Using local rule-based tool calls (no LLM API).",
    )

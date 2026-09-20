"""
LimitX buy tool for Strands agents — always POST /transactions with x-api-key.
"""

from __future__ import annotations

import json
import os
from typing import Any

from limitx.client import LimitXClient, LimitXError


def _post_buy(
    *,
    agent_id: str,
    api_key: str,
    amount: float,
    recipient: str,
    purpose: str,
) -> dict[str, Any]:
    client = LimitXClient(
        api_url=os.getenv("LIMITX_API_URL"),
        agent_id=agent_id,
        api_key=api_key,
    )
    body_preview = {
        "agentId": agent_id,
        "amount": round(float(amount), 2),
        "recipient": recipient,
        "type": "purchase",
        "purpose": purpose,
    }
    print("\n" + "=" * 60)
    print("[buy tool] POST /transactions")
    print(json.dumps(body_preview, indent=2))
    print("=" * 60)
    try:
        result = client.request_purchase(
            amount=amount,
            recipient=recipient,
            purpose=purpose,
            settlement_rail=os.getenv("LIMITX_SETTLEMENT_RAIL", "chain"),
            metadata={"via": "strands-buy-tool"},
        )
    except LimitXError as e:
        result = {
            "decision": "ERROR",
            "httpStatus": e.status,
            "message": e.message,
        }
    print("[buy tool] LimitX response:")
    print(json.dumps(result, indent=2))
    print("=" * 60 + "\n")
    return result


def make_buy_tool(agent_id: str, api_key: str):
    """Return a Strands @tool that posts purchases for a fixed agent identity."""
    from strands import tool

    @tool(
        name="buy",
        description=(
            "Submit a purchase to LimitX. Required: amount (USD number), "
            "recipient (exact merchant id, e.g. Amazon or VendorA), purpose (string). "
            "Returns the LimitX decision JSON."
        ),
    )
    def buy(amount: float, recipient: str, purpose: str) -> str:
        return json.dumps(
            _post_buy(
                agent_id=agent_id,
                api_key=api_key,
                amount=amount,
                recipient=recipient,
                purpose=purpose,
            )
        )

    return buy


def call_buy_direct(
    *,
    agent_id: str,
    api_key: str,
    amount: float,
    recipient: str,
    purpose: str,
) -> dict[str, Any]:
    """Same HTTP path without Strands (used by mock runner)."""
    return _post_buy(
        agent_id=agent_id,
        api_key=api_key,
        amount=amount,
        recipient=recipient,
        purpose=purpose,
    )

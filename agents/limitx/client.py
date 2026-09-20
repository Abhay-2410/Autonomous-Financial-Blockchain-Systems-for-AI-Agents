"""LimitX HTTP client — every agent spend must pass policy + KMS."""

from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any

import requests


class LimitXError(RuntimeError):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


class LimitXClient:
    def __init__(
        self,
        api_url: str | None = None,
        agent_id: str | None = None,
        api_key: str | None = None,
    ) -> None:
        self.api_url = (
            api_url or os.getenv("LIMITX_API_URL", "")
        ).rstrip("/")
        self.agent_id = agent_id or os.getenv("LIMITX_AGENT_ID", "shopping-bot")
        self.api_key = api_key or os.getenv(
            "LIMITX_API_KEY", "shopping-bot-secret"
        )
        if not self.api_url:
            raise LimitXError(0, "LIMITX_API_URL is not set")

    def request_purchase(
        self,
        *,
        amount: float,
        recipient: str,
        purpose: str,
        settlement_rail: str = "chain",
        txn_type: str = "purchase",
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        body = {
            "agentId": self.agent_id,
            "amount": round(float(amount), 2),
            "recipient": recipient,
            "type": txn_type,
            "purpose": purpose[:500],
            "timestamp": datetime.now(timezone.utc)
            .isoformat()
            .replace("+00:00", "Z"),
            "settlementRail": settlement_rail
            if settlement_rail in ("chain", "prava")
            else "chain",
            "metadata": metadata or {},
        }
        res = requests.post(
            f"{self.api_url}/transactions",
            headers={
                "content-type": "application/json",
                "x-api-key": self.api_key,
            },
            json=body,
            timeout=60,
        )
        try:
            data = res.json()
        except Exception:
            data = {"message": res.text}
        if res.status_code >= 400:
            raise LimitXError(
                res.status_code,
                data.get("message") if isinstance(data, dict) else str(data),
            )
        return data if isinstance(data, dict) else {"raw": data}

"""
Prava Agentic Commerce client.

Preferred: `prava` CLI (`prava shop search|product|quote|checkout`).
Docs: https://docs.prava.space/prava-pay/shopping.md
      https://docs.prava.space/integration/overview.md

UCP discovers Shopify merchants; Browser Harness completes checkout.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from typing import Any

from catalog.models import ProductHit


class PravaCommerceError(RuntimeError):
    pass


def _cli() -> str:
    return os.getenv("PRAVA_CLI", "prava")


def prava_available() -> bool:
    return shutil.which(_cli()) is not None


def _run(args: list[str], timeout: int = 120) -> dict[str, Any] | list[Any] | str:
    cmd = [_cli(), *args]
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
    except FileNotFoundError as e:
        raise PravaCommerceError(
            "prava CLI not found. Install/link per https://docs.prava.space/prava-pay/quickstart"
        ) from e
    out = (proc.stdout or "").strip()
    err = (proc.stderr or "").strip()
    if proc.returncode != 0:
        raise PravaCommerceError(
            f"prava {' '.join(args)} failed ({proc.returncode}): {err or out}"
        )
    if not out:
        return {}
    try:
        return json.loads(out)
    except json.JSONDecodeError:
        return out


def shop_search(query: str, *, limit: int = 8, merchant: str | None = None) -> list[ProductHit]:
    """Discover products via Prava UCP (Shopify participating merchants)."""
    args = ["shop", "search", "--query", query, "--limit", str(limit), "--json"]
    if merchant:
        args += ["--merchant", merchant]
    raw = _run(args)
    hits: list[ProductHit] = []

    rows: list[Any]
    if isinstance(raw, list):
        rows = raw
    elif isinstance(raw, dict):
        rows = raw.get("results") or raw.get("products") or raw.get("items") or []
    else:
        # Text CLI output — best-effort parse product-id lines
        rows = []
        return _parse_text_search(str(raw), query)

    for row in rows:
        if not isinstance(row, dict):
            continue
        title = str(row.get("title") or row.get("name") or "Product")
        price = float(
            row.get("price")
            or row.get("amount")
            or row.get("price_estimate")
            or 0
        )
        merch = str(
            row.get("merchant")
            or row.get("merchant_domain")
            or row.get("domain")
            or "Shopify"
        )
        hits.append(
            ProductHit(
                title=title[:160],
                price=price,
                currency=str(row.get("currency") or "USD"),
                merchant=_map_merchant(merch),
                url=str(row.get("url") or f"https://{merch}"),
                source="prava",
                product_id=str(row.get("product_id") or row.get("id") or ""),
            )
        )
    hits.sort(key=lambda h: h.price)
    return hits


def _parse_text_search(text: str, query: str) -> list[ProductHit]:
    """Fallback when CLI omits --json support."""
    hits: list[ProductHit] = []
    for line in text.splitlines():
        if "product-id:" in line.lower() or "prod_" in line:
            hits.append(
                ProductHit(
                    title=f"Prava result for {query}",
                    price=0.0,
                    currency="USD",
                    merchant="DemoStore",
                    url="https://docs.prava.space/prava-pay/shopping",
                    source="prava",
                    product_id=line.strip(),
                )
            )
    return hits


def shop_product(product_id: str, merchant: str | None = None) -> dict[str, Any]:
    args = ["shop", "product", "--product-id", product_id, "--json"]
    if merchant:
        args += ["--merchant", merchant]
    raw = _run(args)
    return raw if isinstance(raw, dict) else {"raw": raw}


def shop_quote(
    variant_id: str,
    merchant: str,
    *,
    quantity: int = 1,
    address_id: str | None = None,
    yes: bool = False,
) -> dict[str, Any]:
    args = [
        "shop",
        "quote",
        "--variant-id",
        variant_id,
        "--merchant",
        merchant,
        "--quantity",
        str(quantity),
        "--json",
    ]
    if address_id:
        args += ["--address-id", address_id]
    if yes:
        args.append("--yes")
    raw = _run(args, timeout=180)
    return raw if isinstance(raw, dict) else {"raw": raw}


def shop_checkout(
    checkout_session_id: str,
    *,
    token: str,
    cryptogram: str,
    expiry_month: str | None = None,
    expiry_year: str | None = None,
    yes: bool = False,
) -> dict[str, Any]:
    """Complete via Prava Browser Harness (pays with one-time credentials)."""
    args = [
        "shop",
        "checkout",
        "--checkout-session-id",
        checkout_session_id,
        "--token",
        token,
        "--cryptogram",
        cryptogram,
        "--json",
    ]
    if expiry_month:
        args += ["--expiry-month", expiry_month]
    if expiry_year:
        args += ["--expiry-year", expiry_year]
    if yes:
        args.append("--yes")
    raw = _run(args, timeout=300)
    return raw if isinstance(raw, dict) else {"raw": raw}


def create_payment_session_cli(
    *,
    total_amount: str,
    currency: str,
    merchant_name: str,
    merchant_url: str,
    merchant_country: str,
    products: list[dict[str, Any]],
) -> dict[str, Any]:
    args = [
        "sessions",
        "create",
        "--total-amount",
        total_amount,
        "--currency",
        currency,
        "--merchant-name",
        merchant_name,
        "--merchant-url",
        merchant_url,
        "--merchant-country",
        merchant_country,
    ]
    for p in products:
        args += ["--product", json.dumps(p)]
    raw = _run(args, timeout=60)
    return raw if isinstance(raw, dict) else {"raw": raw}


def _map_merchant(domain: str) -> str:
    d = domain.lower().replace("https://", "").replace("www.", "").split("/")[0]
    if "amazon" in d:
        return "Amazon"
    if "flipkart" in d:
        return "Flipkart"
    # LimitX allow-list uses DemoStore for generic Shopify demos
    return "DemoStore"


def mock_prava_search(query: str, budget: float | None = None) -> list[ProductHit]:
    """Offline stand-in when CLI is missing — still exercises LimitX path."""
    samples = [
        ProductHit(
            "Stumptown Hair Bender (Prava mock)",
            17.0,
            "USD",
            "DemoStore",
            "https://www.stumptowncoffee.com",
            "prava",
            product_id="prod_mock_coffee",
            variant_id="var_mock_12oz",
        ),
        ProductHit(
            "Everlane Tee (Prava mock)",
            28.0,
            "USD",
            "DemoStore",
            "https://www.everlane.com",
            "prava",
            product_id="prod_mock_tee",
            variant_id="var_mock_m",
        ),
    ]
    q = query.lower()
    hits = [h for h in samples if any(w in h.title.lower() for w in q.split()) or True]
    if budget is not None:
        hits = [h for h in hits if h.price <= budget]
    return hits

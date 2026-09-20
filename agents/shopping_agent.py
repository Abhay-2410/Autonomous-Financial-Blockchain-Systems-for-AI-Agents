#!/usr/bin/env python3
"""
LimitX shopping agent

Modes:
  demo    — local catalog + FakeStore API
  browser — Playwright (books.toscrape.com or --url)
  prava   — Prava Agentic Commerce (UCP search → quote → Browser Harness)

Every purchase is gated by LimitX POST /transactions before any checkout.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

# Allow `python shopping_agent.py` from agents/
sys.path.insert(0, str(Path(__file__).resolve().parent))

from browser.scraper import browser_discover
from catalog.models import ProductHit
from catalog.search import search_demo
from limitx.client import LimitXClient, LimitXError
from prava_commerce.client import (
    PravaCommerceError,
    mock_prava_search,
    prava_available,
    shop_checkout,
    shop_product,
    shop_quote,
    shop_search,
    create_payment_session_cli,
)


def _parse_budget(query: str, explicit: float | None) -> float | None:
    if explicit is not None:
        return explicit
    import re

    m = re.search(r"under\s+\$?(\d+(?:\.\d+)?)", query.lower())
    return float(m.group(1)) if m else None


def discover(
    mode: str,
    query: str,
    *,
    budget: float | None,
    url: str | None,
    merchant: str,
) -> list[ProductHit]:
    if mode == "demo":
        return search_demo(query, budget=budget)
    if mode == "browser":
        return browser_discover(
            query, budget=budget, url=url, merchant=merchant
        )
    if mode == "prava":
        if prava_available():
            try:
                return shop_search(query)
            except PravaCommerceError as e:
                print(f"[prava] CLI search failed ({e}); using mock catalog")
                return mock_prava_search(query, budget=budget)
        print("[prava] CLI not installed — using mock UCP results")
        return mock_prava_search(query, budget=budget)
    raise SystemExit(f"Unknown mode: {mode}")


def pick_hit(hits: list[ProductHit], merchant: str | None) -> ProductHit | None:
    if not hits:
        return None
    if merchant:
        scoped = [h for h in hits if h.merchant.lower() == merchant.lower()]
        if scoped:
            return scoped[0]
    return hits[0]


def run_prava_checkout(hit: ProductHit, *, yes: bool) -> dict:
    """
    After LimitX ALLOW: quote → payment session (owner passkey) → shop checkout.
    Credentials stay in the Prava CLI / gateway; we do not print full tokens.
    """
    if not hit.product_id or hit.product_id.startswith("prod_mock"):
        return {
            "status": "skipped",
            "reason": "mock_or_missing_product_id — install/link prava CLI for live UCP",
        }

    domain = hit.url.replace("https://", "").replace("http://", "").split("/")[0]
    detail = shop_product(hit.product_id, merchant=domain)
    variant_id = hit.variant_id
    if isinstance(detail, dict):
        offers = detail.get("offers") or detail.get("variants") or []
        if offers and isinstance(offers[0], dict):
            variant_id = str(
                offers[0].get("variant_id") or offers[0].get("id") or variant_id
            )
            domain = str(offers[0].get("merchant") or domain)

    if not variant_id:
        return {"status": "error", "reason": "no variant_id from shop_product"}

    quote = shop_quote(variant_id, domain, yes=yes)
    total = str(
        quote.get("total")
        or quote.get("total_amount")
        or hit.price
    )
    checkout_id = str(
        quote.get("checkout_session_id")
        or quote.get("checkoutSessionId")
        or ""
    )
    if not checkout_id:
        return {"status": "quoted", "quote": quote, "next": "missing checkout_session_id"}

    session = create_payment_session_cli(
        total_amount=str(total),
        currency=hit.currency,
        merchant_name=hit.merchant,
        merchant_url=hit.url if hit.url.startswith("http") else f"https://{domain}",
        merchant_country="US",
        products=[
            {
                "description": hit.title[:80],
                "unit_price": str(total),
                "quantity": 1,
            }
        ],
    )
    payment_url = (
        session.get("payment_url")
        or session.get("iframe_url")
        or session.get("Payment URL")
    )
    session_id = session.get("session_id") or session.get("Session ID")
    print("\n=== Prava payment approval required ===")
    print(f"Open: {payment_url}")
    print("Approve with passkey, then press Enter to continue checkout…")
    if not yes:
        input()
    else:
        print("( --yes: waiting 5s then attempting poll/checkout )")
        import time

        time.sleep(5)

    # Prefer CLI poll if available
    from prava_commerce.client import _run

    try:
        polled = _run(["sessions", "poll", "--session-id", str(session_id)], timeout=600)
    except PravaCommerceError as e:
        return {
            "status": "awaiting_payment",
            "payment_url": payment_url,
            "session_id": session_id,
            "checkout_session_id": checkout_id,
            "error": str(e),
        }

    token = None
    crypto = None
    if isinstance(polled, dict):
        token = polled.get("token") or polled.get("Token")
        crypto = polled.get("cryptogram") or polled.get("dynamic_cvv") or polled.get("Cryptogram")
        exp_m = polled.get("expiry_month")
        exp_y = polled.get("expiry_year")
    else:
        # parse text
        text = str(polled)
        import re

        tm = re.search(r"Token:\s*(\d+)", text)
        cm = re.search(r"Cryptogram:\s*(\d+)", text)
        token = tm.group(1) if tm else None
        crypto = cm.group(1) if cm else None
        exp_m = exp_y = None

    if not token or not crypto:
        return {
            "status": "awaiting_payment",
            "payment_url": payment_url,
            "note": "Could not read credentials from poll (do not log tokens).",
        }

    result = shop_checkout(
        checkout_id,
        token=str(token),
        cryptogram=str(crypto),
        expiry_month=str(exp_m) if exp_m else None,
        expiry_year=str(exp_y) if exp_y else None,
        yes=yes,
    )
    # Never print raw credentials
    return {"status": "checked_out", "result": result}


def main() -> None:
    load_dotenv(Path(__file__).with_name(".env"))
    parser = argparse.ArgumentParser(description="LimitX shopping agent")
    parser.add_argument("query", help='e.g. "wireless headphones under 50"')
    parser.add_argument(
        "--mode",
        choices=["demo", "browser", "prava"],
        default=os.getenv("SHOP_MODE", "demo"),
    )
    parser.add_argument("--budget", type=float, default=None)
    parser.add_argument("--merchant", default=os.getenv("LIMITX_MERCHANT", "Amazon"))
    parser.add_argument("--url", default=None, help="Product URL for --mode browser")
    parser.add_argument(
        "--rail",
        choices=["chain", "prava"],
        default=os.getenv("LIMITX_SETTLEMENT_RAIL", "chain"),
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Confirm Prava quote/checkout without interactive prompts",
    )
    parser.add_argument("--dry-run", action="store_true", help="Discover only")
    args = parser.parse_args()

    budget = _parse_budget(args.query, args.budget)
    print(f"Query: {args.query}")
    print(f"Mode: {args.mode}  budget={budget}  merchant={args.merchant}  rail={args.rail}")

    hits = discover(
        args.mode,
        args.query,
        budget=budget,
        url=args.url,
        merchant=args.merchant,
    )
    if not hits:
        print("No products found.")
        raise SystemExit(1)

    print(f"\nFound {len(hits)} product(s):")
    for i, h in enumerate(hits[:8], 1):
        print(f"  {i}. {h.title} — {h.currency} {h.price:.2f} [{h.merchant}/{h.source}]")
        print(f"     {h.url}")

    hit = pick_hit(hits, None if args.mode in ("browser", "prava") else args.merchant)
    assert hit is not None
    # Map Prava Shopify merchants onto LimitX allow-list id
    recipient = hit.merchant
    if recipient not in ("Amazon", "Flipkart", "DemoStore", "VendorA", "VendorB"):
        recipient = "DemoStore"

    print(f"\nSelected: {hit.title} @ {hit.price} -> LimitX merchant={recipient}")

    if args.dry_run:
        print(json.dumps(hit.to_dict(), indent=2))
        return

    client = LimitXClient()
    try:
        decision = client.request_purchase(
            amount=hit.price,
            recipient=recipient,
            purpose=f"{args.mode}:{hit.title}"[:200],
            settlement_rail="prava" if args.mode == "prava" or args.rail == "prava" else args.rail,
            metadata={
                "shoppingMode": args.mode,
                "product": hit.to_dict(),
            },
        )
    except LimitXError as e:
        print(f"LimitX error ({e.status}): {e.message}")
        raise SystemExit(1)

    print("\nLimitX decision:")
    print(json.dumps(decision, indent=2))

    d = str(decision.get("decision", ""))
    if d == "DENIED":
        print("Stopped — policy denied.")
        raise SystemExit(2)
    if d == "PENDING_APPROVAL":
        print("Stopped — waiting for human approval in the dashboard.")
        raise SystemExit(3)

    # Optional Prava agentic checkout after ALLOW
    if args.mode == "prava" and d in ("ALLOWED",):
        print("\nStarting Prava Agentic Commerce checkout (Browser Harness)…")
        try:
            outcome = run_prava_checkout(hit, yes=args.yes)
            # redact any accidental credential fields
            safe = {
                k: v
                for k, v in outcome.items()
                if k not in ("token", "cryptogram", "dynamic_cvv")
            }
            print(json.dumps(safe, indent=2, default=str))
        except PravaCommerceError as e:
            print(f"Prava commerce error: {e}")
            print(
                "LimitX already authorized/signed the spend; complete Prava "
                "manually or use dashboard Pay → Prava rail."
            )

    # If LimitX returned a Prava iframe from settlementRail=prava
    prava = decision.get("pravaCheckout")
    if isinstance(prava, dict) and prava.get("iframeUrl"):
        print("\nLimitX opened a Prava hosted payment session:")
        print(prava["iframeUrl"])


if __name__ == "__main__":
    main()

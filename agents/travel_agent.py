#!/usr/bin/env python3
"""
LimitX travel agent (demo)

Builds a stub itinerary under budget, then requests spend via LimitX
(vendor-agent). Same policy gate as shopping — no card data in the agent.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent))

from limitx.client import LimitXClient, LimitXError


def stub_itinerary(query: str, budget: float) -> dict:
    base = min(budget * 0.85, budget - 1) if budget > 1 else budget
    return {
        "title": f"Travel package: {query[:80]}",
        "amount": round(max(base, 1), 2),
        "merchant": "VendorA",
        "legs": [
            {"type": "hotel", "nights": 2, "estimate": round(base * 0.7, 2)},
            {"type": "transfer", "estimate": round(base * 0.15, 2)},
        ],
    }


def main() -> None:
    load_dotenv(Path(__file__).with_name(".env"))
    parser = argparse.ArgumentParser(description="LimitX travel agent")
    parser.add_argument("query", help='e.g. "weekend hotel under 200"')
    parser.add_argument("--budget", type=float, default=None)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    budget = args.budget
    if budget is None:
        m = re.search(r"under\s+\$?(\d+(?:\.\d+)?)", args.query.lower())
        budget = float(m.group(1)) if m else 200.0

    plan = stub_itinerary(args.query, budget)
    print(json.dumps(plan, indent=2))
    if args.dry_run:
        return

    client = LimitXClient(
        agent_id=os.getenv("LIMITX_TRAVEL_AGENT_ID", "vendor-agent"),
        api_key=os.getenv("LIMITX_TRAVEL_API_KEY", "vendor-agent-secret"),
    )
    try:
        decision = client.request_purchase(
            amount=plan["amount"],
            recipient=plan["merchant"],
            purpose=f"travel:{plan['title']}"[:200],
            settlement_rail=os.getenv("LIMITX_SETTLEMENT_RAIL", "chain"),
            metadata={"itinerary": plan},
        )
    except LimitXError as e:
        print(f"LimitX error ({e.status}): {e.message}")
        raise SystemExit(1)

    print("\nLimitX decision:")
    print(json.dumps(decision, indent=2))


if __name__ == "__main__":
    main()

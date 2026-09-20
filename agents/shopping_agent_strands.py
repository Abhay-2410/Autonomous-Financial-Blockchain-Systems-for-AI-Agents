#!/usr/bin/env python3
"""
Strands shopping agent (shopping-bot) — in-policy Amazon office-supply buys.

Does NOT replace shopping_agent.py (commerce / browser / Prava modes).
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
load_dotenv(ROOT / ".env")

from strands_demo.buy_tool import call_buy_direct, make_buy_tool
from strands_demo.console import banner, reason, show_decision
from strands_demo.model import try_bedrock_model

AGENT_ID = "shopping-bot"
API_KEY = os.getenv("LIMITX_API_KEY", "shopping-bot-secret")
TASK = (
    "Reorder office supplies from Amazon, staying budget conscious. "
    "Make one or two reasonable purchases under $80 each. "
    "Use the buy tool with recipient exactly 'Amazon'. "
    "Do not invent other merchants."
)


def run_mock() -> None:
    banner("SHOPPING AGENT (MOCK FALLBACK — no Bedrock LLM)")
    reason(
        "Task: reorder office supplies from Amazon, budget conscious.\n"
        "Plan: buy printer paper (~$24) and pens (~$12) from Amazon — "
        "both well under per-txn ($2000) and daily ($5000) limits."
    )
    r1 = call_buy_direct(
        agent_id=AGENT_ID,
        api_key=API_KEY,
        amount=24.99,
        recipient="Amazon",
        purpose="Office supplies: printer paper ream",
    )
    show_decision("purchase 1/2", r1)
    r2 = call_buy_direct(
        agent_id=AGENT_ID,
        api_key=API_KEY,
        amount=12.50,
        recipient="Amazon",
        purpose="Office supplies: ballpoint pens pack",
    )
    show_decision("purchase 2/2", r2)
    print("\nDemo intent: both should be ALLOWED (in-policy).")


def run_bedrock(model) -> None:
    from strands import Agent

    banner("SHOPPING AGENT (Amazon Bedrock + Strands)")
    buy = make_buy_tool(AGENT_ID, API_KEY)
    agent = Agent(
        model=model,
        tools=[buy],
        system_prompt=(
            "You are shopping-bot for LimitX. You ONLY spend via the buy tool. "
            "Merchant recipient must be exactly Amazon. "
            "Keep each purchase under $80. Make 1–2 buys then stop."
        ),
    )
    reason(f"Invoking Strands agent with task:\n{TASK}")
    result = agent(TASK)
    print("\n[agent final message]")
    print(result)


def main() -> None:
    if not os.getenv("LIMITX_API_URL"):
        print("ERROR: set LIMITX_API_URL in agents/.env")
        raise SystemExit(1)

    model, status = try_bedrock_model()
    print(f"\n>>> {status}\n")
    if model is None:
        run_mock()
    else:
        try:
            run_bedrock(model)
        except Exception as e:
            print(f"\n>>> MOCK_FALLBACK: Bedrock agent failed ({e})")
            run_mock()


if __name__ == "__main__":
    main()

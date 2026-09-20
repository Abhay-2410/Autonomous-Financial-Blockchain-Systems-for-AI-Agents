"""Shared console helpers for Strands demo agents."""

from __future__ import annotations

import json
from typing import Any


def banner(title: str) -> None:
    print("\n" + "#" * 64)
    print(f"# {title}")
    print("#" * 64)


def reason(text: str) -> None:
    print(f"\n[agent reasoning]\n{text}\n")


def show_decision(label: str, result: dict[str, Any]) -> None:
    print(f"\n[{label}] final LimitX decision")
    print(json.dumps(result, indent=2))

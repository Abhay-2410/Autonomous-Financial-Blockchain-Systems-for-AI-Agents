"""Demo + FakeStore discovery (free, no browser)."""

from __future__ import annotations

import json
import re
from pathlib import Path

import requests

from catalog.models import ProductHit

_CATALOG = Path(__file__).with_name("products.json")


def _tokens(q: str) -> list[str]:
    return [t for t in re.split(r"[^a-z0-9]+", q.lower()) if t and t not in {"under", "buy", "a", "the", "for"}]


def search_local_catalog(query: str, budget: float | None = None) -> list[ProductHit]:
    data = json.loads(_CATALOG.read_text(encoding="utf-8"))
    toks = _tokens(query)
    hits: list[ProductHit] = []
    for row in data:
        blob = " ".join(
            [row["title"], row["merchant"], " ".join(row.get("tags", []))]
        ).lower()
        score = sum(1 for t in toks if t in blob) if toks else 1
        if score <= 0:
            continue
        price = float(row["price"])
        if budget is not None and price > budget:
            continue
        hits.append(
            ProductHit(
                title=row["title"],
                price=price,
                currency=row.get("currency", "USD"),
                merchant=row["merchant"],
                url=row["url"],
                source="demo",
                product_id=row["id"],
            )
        )
    hits.sort(key=lambda h: h.price)
    return hits


def search_fakestore(query: str, budget: float | None = None) -> list[ProductHit]:
    """Free public Fake Store API — real HTTP products, not Amazon."""
    try:
        res = requests.get("https://fakestoreapi.com/products", timeout=20)
        res.raise_for_status()
        rows = res.json()
    except Exception:
        return []

    toks = _tokens(query)
    hits: list[ProductHit] = []
    for row in rows:
        title = str(row.get("title", ""))
        blob = f"{title} {row.get('category', '')}".lower()
        if toks and not any(t in blob for t in toks):
            continue
        price = float(row.get("price", 0))
        if budget is not None and price > budget:
            continue
        hits.append(
            ProductHit(
                title=title[:120],
                price=price,
                currency="USD",
                merchant="DemoStore",
                url=f"https://fakestoreapi.com/products/{row.get('id')}",
                source="fakestore",
                product_id=str(row.get("id")),
                image=row.get("image"),
            )
        )
    hits.sort(key=lambda h: h.price)
    return hits[:12]


def search_demo(query: str, budget: float | None = None) -> list[ProductHit]:
    local = search_local_catalog(query, budget)
    remote = search_fakestore(query, budget)
    merged = {h.title.lower(): h for h in local + remote}
    out = list(merged.values())
    out.sort(key=lambda h: h.price)
    return out

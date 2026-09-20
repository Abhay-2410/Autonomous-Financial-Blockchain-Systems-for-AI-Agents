"""Product discovery hit shared by demo / browser / Prava backends."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any


@dataclass
class ProductHit:
    title: str
    price: float
    currency: str
    merchant: str
    url: str
    source: str  # demo | browser | prava | fakestore
    product_id: str | None = None
    variant_id: str | None = None
    image: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

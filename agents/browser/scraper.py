"""
Browser automation for product discovery (Playwright).

Default target: books.toscrape.com (explicitly scrape-friendly demo site).
Arbitrary merchant URLs require ALLOW_ARBITRARY_PRODUCT_URL=1.
"""

from __future__ import annotations

import os
import re
from urllib.parse import urlparse

from catalog.models import ProductHit

DEFAULT_SEARCH = "https://books.toscrape.com/catalogue/category/books_1/index.html"
CATEGORY_HINTS = {
    "poetry": "https://books.toscrape.com/catalogue/category/books/poetry_23/index.html",
    "travel": "https://books.toscrape.com/catalogue/category/books/travel_2/index.html",
    "mystery": "https://books.toscrape.com/catalogue/category/books/mystery_3/index.html",
    "science": "https://books.toscrape.com/catalogue/category/books/science_22/index.html",
    "music": "https://books.toscrape.com/catalogue/category/books/music_14/index.html",
}
ALLOWED_HOSTS = {
    "books.toscrape.com",
    "fakestoreapi.com",
}


def _price_from_text(text: str) -> float | None:
    m = re.search(r"(?:£|\$|€|USD\s*)?(\d+[.,]\d{2})", text.replace(",", ""))
    if not m:
        return None
    try:
        return float(m.group(1))
    except ValueError:
        return None


def _host_allowed(url: str) -> bool:
    host = urlparse(url).hostname or ""
    if host in ALLOWED_HOSTS:
        return True
    return os.getenv("ALLOW_ARBITRARY_PRODUCT_URL", "0") == "1"


def scrape_product_url(url: str, merchant: str = "DemoStore") -> ProductHit | None:
    if not _host_allowed(url):
        raise RuntimeError(
            f"Host not allow-listed for scraping: {urlparse(url).hostname}. "
            "Use books.toscrape.com, or set ALLOW_ARBITRARY_PRODUCT_URL=1 "
            "only for sites you are permitted to automate."
        )

    from playwright.sync_api import sync_playwright

    headless = os.getenv("BROWSER_HEADLESS", "1") != "0"
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless)
        page = browser.new_page()
        page.goto(url, wait_until="domcontentloaded", timeout=45000)
        title = page.title() or page.locator("h1").first.inner_text(timeout=5000)
        body = page.locator("body").inner_text()
        price = _price_from_text(body) or 0.0
        # books.toscrape specific
        try:
            price_el = page.locator(".price_color").first
            if price_el.count():
                price = _price_from_text(price_el.inner_text()) or price
                title = page.locator("h1").first.inner_text()
        except Exception:
            pass
        browser.close()

    return ProductHit(
        title=title.strip()[:160],
        price=float(price),
        currency="USD",
        merchant=merchant,
        url=url,
        source="browser",
    )


def search_books_toscrape(query: str, budget: float | None = None) -> list[ProductHit]:
    """Search listing pages on books.toscrape.com with Playwright."""
    from playwright.sync_api import sync_playwright

    headless = os.getenv("BROWSER_HEADLESS", "1") != "0"
    toks = [t for t in re.split(r"[^a-z0-9]+", query.lower()) if len(t) > 2]
    start = DEFAULT_SEARCH
    for key, cat_url in CATEGORY_HINTS.items():
        if key in query.lower():
            start = cat_url
            break

    hits: list[ProductHit] = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless)
        page = browser.new_page()
        page.goto(start, wait_until="domcontentloaded", timeout=45000)
        cards = page.locator("article.product_pod")
        n = min(cards.count(), 40)
        for i in range(n):
            card = cards.nth(i)
            title = card.locator("h3 a").get_attribute("title") or card.locator(
                "h3 a"
            ).inner_text()
            href = card.locator("h3 a").get_attribute("href") or ""
            price_txt = card.locator(".price_color").inner_text()
            price = _price_from_text(price_txt) or 0.0
            blob = title.lower()
            # On a category page, keep all cards; otherwise require token match
            if start == DEFAULT_SEARCH and toks and not any(t in blob for t in toks):
                continue
            if budget is not None and price > budget:
                continue
            if href and not href.startswith("http"):
                # From category pages links look like ../../../catalogue/slug/index.html
                # or ../slug/index.html
                cleaned = href.replace("../", "")
                if cleaned.startswith("catalogue/"):
                    href = "https://books.toscrape.com/" + cleaned
                else:
                    href = "https://books.toscrape.com/catalogue/" + cleaned
            hits.append(
                ProductHit(
                    title=title.strip()[:160],
                    price=price,
                    currency="GBP",
                    merchant="DemoStore",
                    url=href or start,
                    source="browser",
                )
            )
        browser.close()

    if not hits and budget is not None:
        # Retry without budget (site uses GBP; demo budgets are often USD-shaped)
        return search_books_toscrape(query, budget=None)[:8]

    hits.sort(key=lambda h: h.price)
    return hits[:15]


def browser_discover(
    query: str,
    *,
    budget: float | None = None,
    url: str | None = None,
    merchant: str = "DemoStore",
) -> list[ProductHit]:
    if url:
        hit = scrape_product_url(url, merchant=merchant)
        if hit is None:
            return []
        if budget is not None and hit.price > budget:
            return []
        return [hit]
    return search_books_toscrape(query, budget=budget)

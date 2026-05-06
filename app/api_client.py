"""
Async client for the InPost Points API.
Handles pagination, field selection, and rate limiting.
"""

import asyncio
import logging
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

BASE_URL = "https://api-global-points.easypack24.net/v1/points"

# Fields we actually need — keeps responses small and fast
FIELDS = ",".join([
    "name", "country", "type", "status", "location", "location_type",
    "address_details", "functions", "opening_hours", "locker_availability",
    "location_247", "payment_available", "easy_access_zone",
    "physical_type_mapped", "image_url", "location_description",
])

# Concurrency limit to be respectful to the InPost API
MAX_CONCURRENT_REQUESTS = 10
PER_PAGE = 1000


async def fetch_page(
    client: httpx.AsyncClient,
    semaphore: asyncio.Semaphore,
    page: int,
    country: Optional[str] = None,
) -> list[dict]:
    """Fetch a single page of points from the API."""
    async with semaphore:
        params = {
            "page": page,
            "per_page": PER_PAGE,
            "fields": FIELDS,
        }
        if country:
            params["country"] = country

        try:
            response = await client.get(BASE_URL, params=params, timeout=30.0)
            response.raise_for_status()
            data = response.json()
            return data.get("items", [])
        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP error fetching page {page}: {e.response.status_code}")
            return []
        except httpx.RequestError as e:
            logger.error(f"Request error fetching page {page}: {e}")
            return []


async def fetch_all_points(country: Optional[str] = None) -> list[dict]:
    """
    Fetch ALL points from the InPost API using parallel pagination.
    
    Returns a flat list of all point objects.
    Typically ~90k points for Poland, ~150k total across Europe.
    """
    semaphore = asyncio.Semaphore(MAX_CONCURRENT_REQUESTS)

    async with httpx.AsyncClient() as client:
        # First request: discover total pages
        params = {"page": 1, "per_page": PER_PAGE, "fields": FIELDS}
        if country:
            params["country"] = country

        logger.info(f"Fetching first page to discover total count...")
        response = await client.get(BASE_URL, params=params, timeout=30.0)
        response.raise_for_status()
        data = response.json()

        total_pages = data.get("total_pages", 1)
        total_count = data.get("count", 0)
        first_page_items = data.get("items", [])

        logger.info(f"Total points: {total_count}, pages: {total_pages}")

        if total_pages <= 1:
            return first_page_items

        # Fetch remaining pages in parallel (with concurrency limit)
        tasks = [
            fetch_page(client, semaphore, page, country)
            for page in range(2, total_pages + 1)
        ]

        results = await asyncio.gather(*tasks)
        all_items = first_page_items
        for page_items in results:
            all_items.extend(page_items)

        logger.info(f"Fetched {len(all_items)} points total")
        return all_items


async def fetch_points_near(
    latitude: float,
    longitude: float,
    per_page: int = 20,
) -> list[dict]:
    """Fetch points nearest to a given coordinate using the API's relative_point feature."""
    async with httpx.AsyncClient() as client:
        params = {
            "relative_point": f"{latitude},{longitude}",
            "per_page": per_page,
            "fields": FIELDS,
        }
        response = await client.get(BASE_URL, params=params, timeout=15.0)
        response.raise_for_status()
        data = response.json()
        return data.get("items", [])

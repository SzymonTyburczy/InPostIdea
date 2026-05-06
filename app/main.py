"""
InPost Locator Pro — FastAPI Application

Main entry point. Serves:
- REST API endpoints (proxied + enriched InPost data)
- Static frontend files (map, analytics dashboard)
"""

import logging
import math
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Query, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse

from app.api_client import fetch_all_points, fetch_points_near
from app.analytics import compute_analytics
from app.cache import cache

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"
TEMPLATES_DIR = BASE_DIR / "templates"

CACHE_KEY_POINTS = "all_points"
CACHE_KEY_ANALYTICS = "analytics"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Pre-fetch data on startup so first request is fast."""
    logger.info("Starting InPost Locator Pro...")
    logger.info("Background data fetch will happen on first request.")
    yield
    logger.info("Shutting down...")


app = FastAPI(
    title="InPost Locator Pro",
    description="Smart finder & analytics for InPost parcel lockers across Europe",
    version="1.0.0",
    lifespan=lifespan,
)

# Serve static files (CSS, JS, images)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


async def get_all_points_cached(country: Optional[str] = None) -> list[dict]:
    """Fetch all points with caching."""
    cache_key = f"{CACHE_KEY_POINTS}_{country or 'all'}"
    cached = cache.get(cache_key)
    if cached is not None:
        logger.info(f"Cache hit for {cache_key}: {len(cached)} points")
        return cached

    logger.info(f"Cache miss for {cache_key}, fetching from API...")
    points = await fetch_all_points(country=country)
    cache.set(cache_key, points, ttl=600)  # 10 min
    return points


# ─────────────────────────────────────────────
# Pages
# ─────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
async def index():
    """Serve the main SPA page."""
    html_path = TEMPLATES_DIR / "index.html"
    return FileResponse(str(html_path), media_type="text/html")


# ─────────────────────────────────────────────
# API Endpoints
# ─────────────────────────────────────────────

@app.get("/api/points")
async def api_points(
    country: Optional[str] = Query(None, description="Filter by country code (e.g. PL, IT, ES)"),
    city: Optional[str] = Query(None, description="Filter by city name"),
    type: Optional[str] = Query(None, description="Filter by type (parcel_locker, pop, etc.)"),
    status: Optional[str] = Query(None, description="Filter by status (Operating, NonOperating)"),
    location_247: Optional[bool] = Query(None, description="Filter 24/7 access"),
    easy_access: Optional[bool] = Query(None, description="Filter easy access zone"),
    payment: Optional[bool] = Query(None, description="Filter payment available"),
    location_type: Optional[str] = Query(None, description="Filter Indoor/Outdoor"),
    limit: int = Query(5000, ge=1, le=50000, description="Max points to return"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
):
    """
    Get InPost points with optional filtering.
    Data is fetched from the InPost API and cached for 10 minutes.
    """
    points = await get_all_points_cached(country=country)

    # Apply client-side filters
    filtered = points
    if city:
        city_lower = city.lower()
        filtered = [
            p for p in filtered
            if (p.get("address_details") or {}).get("city", "").lower() == city_lower
        ]
    if type:
        filtered = [p for p in filtered if type in p.get("type", [])]
    if status:
        filtered = [p for p in filtered if p.get("status") == status]
    if location_247 is not None:
        filtered = [p for p in filtered if p.get("location_247") == location_247]
    if easy_access is not None:
        filtered = [p for p in filtered if p.get("easy_access_zone") == easy_access]
    if payment is not None:
        filtered = [p for p in filtered if p.get("payment_available") == payment]
    if location_type:
        filtered = [p for p in filtered if p.get("location_type") == location_type]

    total = len(filtered)
    paginated = filtered[offset:offset + limit]

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": paginated,
    }


@app.get("/api/points/nearby")
async def api_nearby(
    lat: float = Query(..., description="Latitude"),
    lng: float = Query(..., description="Longitude"),
    limit: int = Query(20, ge=1, le=50, description="Number of nearby points"),
):
    """Find nearest InPost points to given coordinates using the API's native proximity search."""
    try:
        points = await fetch_points_near(lat, lng, per_page=limit)
        return {"total": len(points), "items": points}
    except Exception as e:
        logger.error(f"Error fetching nearby points: {e}")
        raise HTTPException(status_code=502, detail="Failed to fetch nearby points from InPost API")


@app.get("/api/analytics")
async def api_analytics(
    country: Optional[str] = Query(None, description="Compute analytics for a specific country"),
):
    """Get aggregated analytics about InPost points distribution."""
    cache_key = f"{CACHE_KEY_ANALYTICS}_{country or 'all'}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    points = await get_all_points_cached(country=country)
    analytics = compute_analytics(points)
    cache.set(cache_key, analytics, ttl=600)
    return analytics


@app.get("/api/cities")
async def api_cities(
    country: Optional[str] = Query("PL", description="Country code"),
    q: Optional[str] = Query(None, description="Search query for city name"),
):
    """Get list of unique cities (for autocomplete/search)."""
    points = await get_all_points_cached(country=country)
    
    cities: dict[str, dict] = {}
    for p in points:
        addr = p.get("address_details") or {}
        city = addr.get("city")
        if not city:
            continue
        if city not in cities:
            loc = p.get("location", {})
            cities[city] = {
                "name": city,
                "province": addr.get("province", ""),
                "lat": loc.get("latitude"),
                "lng": loc.get("longitude"),
                "count": 0,
            }
        cities[city]["count"] += 1

    result = list(cities.values())
    
    if q:
        q_lower = q.lower()
        result = [c for c in result if q_lower in c["name"].lower()]
    
    result.sort(key=lambda c: c["count"], reverse=True)
    return {"cities": result[:50]}


@app.get("/api/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok", "service": "InPost Locator Pro"}

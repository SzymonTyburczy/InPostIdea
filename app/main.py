"""
InPost Locator Pro — FastAPI Application

Main entry point. Serves:
- REST API endpoints (proxied + enriched InPost data)
- Static frontend files (map, analytics dashboard)
"""

import asyncio
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

# Global loading state for frontend progress polling
loading_state = {
    "status": "idle",  # idle, loading, ready, error
    "progress": 0,
    "total_pages": 0,
    "fetched_pages": 0,
    "total_points": 0,
    "message": "Waiting to start...",
}


async def prefetch_data():
    """Background task: pre-fetch Poland data on startup."""
    global loading_state
    try:
        loading_state["status"] = "loading"
        loading_state["message"] = "Connecting to InPost API..."
        logger.info("Pre-fetching Poland data in background...")

        points = await fetch_all_points(
            country="PL",
            progress_callback=update_loading_progress,
        )
        cache.set(f"{CACHE_KEY_POINTS}_PL", points, ttl=1800)  # 30 min cache

        analytics = compute_analytics(points)
        cache.set(f"{CACHE_KEY_ANALYTICS}_PL", analytics, ttl=1800)

        loading_state["status"] = "ready"
        loading_state["total_points"] = len(points)
        loading_state["progress"] = 100
        loading_state["message"] = f"Ready! {len(points):,} lockers loaded."
        logger.info(f"Pre-fetch complete: {len(points)} points cached.")
    except Exception as e:
        loading_state["status"] = "error"
        loading_state["message"] = f"Error: {e}"
        logger.error(f"Pre-fetch failed: {e}")


def update_loading_progress(fetched: int, total: int):
    """Callback for api_client to report pagination progress."""
    loading_state["fetched_pages"] = fetched
    loading_state["total_pages"] = total
    loading_state["progress"] = int((fetched / max(total, 1)) * 100)
    loading_state["message"] = f"Fetching page {fetched}/{total}..."


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Pre-fetch data on startup so first request is instant."""
    logger.info("Starting InPost Locator Pro...")
    asyncio.create_task(prefetch_data())
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
    cache.set(cache_key, points, ttl=1800)  # 30 min
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


@app.get("/api/cities/compare")
async def api_city_compare(
    country: Optional[str] = Query("PL"),
    city_a: str = Query(..., description="First city"),
    city_b: str = Query(..., description="Second city"),
):
    """Compare two cities side by side — locker counts, features, percentages."""
    points = await get_all_points_cached(country=country)

    def city_stats(city_name: str) -> dict:
        city_points = [
            p for p in points
            if (p.get("address_details") or {}).get("city", "").lower() == city_name.lower()
        ]
        total = len(city_points)
        if total == 0:
            return {"name": city_name, "total": 0, "operating": 0, "operating_pct": 0,
                    "access_247": 0, "access_247_pct": 0, "payment": 0, "payment_pct": 0,
                    "easy_access": 0, "easy_access_pct": 0, "indoor": 0, "indoor_pct": 0, "outdoor": 0}

        operating = sum(1 for p in city_points if p.get("status") == "Operating")
        a247 = sum(1 for p in city_points if p.get("location_247"))
        payment = sum(1 for p in city_points if p.get("payment_available"))
        easy = sum(1 for p in city_points if p.get("easy_access_zone"))
        indoor = sum(1 for p in city_points if p.get("location_type") == "Indoor")
        outdoor = total - indoor

        pct = lambda v: round(v / total * 100, 1) if total else 0
        return {
            "name": city_name, "total": total,
            "operating": operating, "operating_pct": pct(operating),
            "access_247": a247, "access_247_pct": pct(a247),
            "payment": payment, "payment_pct": pct(payment),
            "easy_access": easy, "easy_access_pct": pct(easy),
            "indoor": indoor, "indoor_pct": pct(indoor),
            "outdoor": outdoor,
        }

    return {"city_a": city_stats(city_a), "city_b": city_stats(city_b)}


@app.get("/api/districts")
async def api_districts(
    country: Optional[str] = Query("PL"),
    city: Optional[str] = Query(None, description="Filter by city for district ranking"),
):
    """Province/district ranking — sorted by locker count with feature breakdown."""
    points = await get_all_points_cached(country=country)

    # Group by province (or by city for district-level)
    groups = {}
    for p in points:
        addr = p.get("address_details") or {}
        if city:
            if addr.get("city", "").lower() != city.lower():
                continue
            key = addr.get("province", "Unknown")
        else:
            key = addr.get("province", "Unknown")

        if not key or key == "Unknown":
            continue

        if key not in groups:
            groups[key] = {"name": key, "total": 0, "operating": 0, "a247": 0,
                           "payment": 0, "easy_access": 0, "indoor": 0, "outdoor": 0}
        g = groups[key]
        g["total"] += 1
        if p.get("status") == "Operating": g["operating"] += 1
        if p.get("location_247"): g["a247"] += 1
        if p.get("payment_available"): g["payment"] += 1
        if p.get("easy_access_zone"): g["easy_access"] += 1
        if p.get("location_type") == "Indoor": g["indoor"] += 1
        else: g["outdoor"] += 1

    # Sort by total descending
    ranked = sorted(groups.values(), key=lambda x: x["total"], reverse=True)
    for i, r in enumerate(ranked):
        r["rank"] = i + 1
        t = r["total"]
        r["operating_pct"] = round(r["operating"] / t * 100, 1) if t else 0
        r["a247_pct"] = round(r["a247"] / t * 100, 1) if t else 0

    return {"districts": ranked, "total_districts": len(ranked)}


@app.get("/api/points/search")
async def api_search_point(
    q: str = Query(..., description="Locker ID or name to search"),
    country: Optional[str] = Query("PL"),
):
    """Search for a specific locker by name/ID (e.g., KRA389M)."""
    points = await get_all_points_cached(country=country)
    q_upper = q.upper().strip()
    results = [p for p in points if q_upper in (p.get("name") or "").upper()]
    return {"results": results[:20], "total": len(results)}


@app.get("/api/status")
async def api_status():
    """Loading progress endpoint — polled by frontend during startup."""
    return loading_state


@app.get("/api/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok", "service": "InPost Locator Pro"}

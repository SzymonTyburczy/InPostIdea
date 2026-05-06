"""
Analytics engine — aggregates raw InPost point data into useful statistics.
"""

from collections import Counter, defaultdict
from typing import Any


def compute_analytics(points: list[dict]) -> dict[str, Any]:
    """
    Compute comprehensive analytics from a list of InPost points.
    
    Returns aggregated statistics by country, province, type, status, etc.
    Designed to power the frontend analytics dashboard.
    """
    total = len(points)
    if total == 0:
        return {"total": 0}

    # Counters
    countries = Counter()
    provinces = Counter()
    cities = Counter()
    statuses = Counter()
    types = Counter()
    location_types = Counter()  # Indoor vs Outdoor
    functions_counter = Counter()
    
    access_247 = 0
    payment_available = 0
    easy_access = 0

    # Locker availability aggregation
    availability_statuses = Counter()

    # Per-country province breakdown
    country_provinces: dict[str, Counter] = defaultdict(Counter)

    for point in points:
        country = point.get("country", "Unknown")
        countries[country] += 1

        addr = point.get("address_details") or {}
        province = addr.get("province", "Unknown")
        city = addr.get("city", "Unknown")
        provinces[province] += 1
        cities[city] += 1
        country_provinces[country][province] += 1

        statuses[point.get("status", "Unknown")] += 1

        for t in point.get("type", []):
            types[t] += 1

        location_types[point.get("location_type", "Unknown")] += 1

        if point.get("location_247"):
            access_247 += 1
        if point.get("payment_available"):
            payment_available += 1
        if point.get("easy_access_zone"):
            easy_access += 1

        for func in point.get("functions", []):
            functions_counter[func] += 1

        locker = point.get("locker_availability") or {}
        availability_statuses[locker.get("status", "NO_DATA")] += 1

    # Top cities by number of lockers
    top_cities = cities.most_common(30)

    # Build province data for chart (sorted by count, top 20)
    province_data = provinces.most_common(20)

    return {
        "total": total,
        "countries": dict(countries.most_common()),
        "provinces": {
            "labels": [p[0] for p in province_data],
            "values": [p[1] for p in province_data],
        },
        "top_cities": {
            "labels": [c[0] for c in top_cities],
            "values": [c[1] for c in top_cities],
        },
        "statuses": dict(statuses),
        "types": dict(types.most_common()),
        "location_types": dict(location_types),
        "access_247_count": access_247,
        "access_247_pct": round(access_247 / total * 100, 1),
        "payment_available_count": payment_available,
        "payment_available_pct": round(payment_available / total * 100, 1),
        "easy_access_count": easy_access,
        "easy_access_pct": round(easy_access / total * 100, 1),
        "availability": dict(availability_statuses),
        "top_functions": dict(functions_counter.most_common(10)),
        "country_provinces": {
            country: dict(prov.most_common(20))
            for country, prov in country_provinces.items()
        },
    }

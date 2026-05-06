"""
Unit tests for the analytics module.
"""
from app.analytics import compute_analytics


SAMPLE_POINTS = [
    {
        "name": "WAW01M", "country": "PL", "status": "Operating",
        "type": ["parcel_locker"], "location_type": "Outdoor",
        "location_247": True, "payment_available": True, "easy_access_zone": True,
        "address_details": {"city": "Warszawa", "province": "mazowieckie", "post_code": "00-001", "street": "Test", "building_number": "1"},
        "functions": ["parcel_collect", "parcel_send"],
        "locker_availability": {"status": "Available", "details": {"A": "Available", "B": "Full", "C": "Available"}},
        "location": {"latitude": 52.23, "longitude": 21.01},
    },
    {
        "name": "KRK01M", "country": "PL", "status": "Operating",
        "type": ["parcel_locker"], "location_type": "Indoor",
        "location_247": False, "payment_available": True, "easy_access_zone": False,
        "address_details": {"city": "Kraków", "province": "małopolskie", "post_code": "30-001", "street": "Test", "building_number": "2"},
        "functions": ["parcel_collect"],
        "locker_availability": {"status": "NO_DATA", "details": {"A": "NO_DATA", "B": "NO_DATA", "C": "NO_DATA"}},
        "location": {"latitude": 50.06, "longitude": 19.94},
    },
    {
        "name": "WAW02M", "country": "PL", "status": "NonOperating",
        "type": ["parcel_locker"], "location_type": "Outdoor",
        "location_247": True, "payment_available": False, "easy_access_zone": True,
        "address_details": {"city": "Warszawa", "province": "mazowieckie", "post_code": "00-002", "street": "Test2", "building_number": "3"},
        "functions": ["parcel_collect", "parcel_send"],
        "locker_availability": {"status": "Full", "details": {"A": "Full", "B": "Full", "C": "Full"}},
        "location": {"latitude": 52.24, "longitude": 21.02},
    },
]


def test_compute_analytics_total():
    result = compute_analytics(SAMPLE_POINTS)
    assert result["total"] == 3


def test_compute_analytics_countries():
    result = compute_analytics(SAMPLE_POINTS)
    assert result["countries"]["PL"] == 3


def test_compute_analytics_statuses():
    result = compute_analytics(SAMPLE_POINTS)
    assert result["statuses"]["Operating"] == 2
    assert result["statuses"]["NonOperating"] == 1


def test_compute_analytics_247():
    result = compute_analytics(SAMPLE_POINTS)
    assert result["access_247_count"] == 2
    assert result["access_247_pct"] == 66.7


def test_compute_analytics_location_types():
    result = compute_analytics(SAMPLE_POINTS)
    assert result["location_types"]["Outdoor"] == 2
    assert result["location_types"]["Indoor"] == 1


def test_compute_analytics_empty():
    result = compute_analytics([])
    assert result["total"] == 0


def test_compute_analytics_provinces():
    result = compute_analytics(SAMPLE_POINTS)
    assert "mazowieckie" in result["provinces"]["labels"]
    assert "małopolskie" in result["provinces"]["labels"]


def test_compute_analytics_top_cities():
    result = compute_analytics(SAMPLE_POINTS)
    assert result["top_cities"]["labels"][0] == "Warszawa"
    assert result["top_cities"]["values"][0] == 2

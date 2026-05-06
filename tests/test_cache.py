"""
Unit tests for the cache module.
"""
import time
from app.cache import Cache


def test_cache_set_and_get():
    c = Cache(default_ttl=10)
    c.set("key1", {"data": [1, 2, 3]})
    assert c.get("key1") == {"data": [1, 2, 3]}


def test_cache_miss():
    c = Cache(default_ttl=10)
    assert c.get("nonexistent") is None


def test_cache_expiry():
    c = Cache(default_ttl=1)
    c.set("key1", "value1", ttl=1)
    assert c.get("key1") == "value1"
    time.sleep(1.1)
    assert c.get("key1") is None


def test_cache_invalidate():
    c = Cache(default_ttl=10)
    c.set("key1", "value1")
    c.invalidate("key1")
    assert c.get("key1") is None


def test_cache_clear():
    c = Cache(default_ttl=10)
    c.set("a", 1)
    c.set("b", 2)
    c.clear()
    assert c.get("a") is None
    assert c.get("b") is None

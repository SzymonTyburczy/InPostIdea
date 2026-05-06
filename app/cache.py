"""
In-memory cache with TTL for storing InPost API data.
Avoids hammering the external API on every user request.
"""

import time
from typing import Any, Optional


class Cache:
    """Simple in-memory cache with per-key TTL."""

    def __init__(self, default_ttl: int = 600):
        self._store: dict[str, tuple[Any, float]] = {}
        self._default_ttl = default_ttl

    def get(self, key: str) -> Optional[Any]:
        """Return cached value if it exists and hasn't expired."""
        if key not in self._store:
            return None
        value, expires_at = self._store[key]
        if time.time() > expires_at:
            del self._store[key]
            return None
        return value

    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        """Store a value with an expiration time."""
        ttl = ttl if ttl is not None else self._default_ttl
        self._store[key] = (value, time.time() + ttl)

    def invalidate(self, key: str) -> None:
        """Remove a specific key from cache."""
        self._store.pop(key, None)

    def clear(self) -> None:
        """Clear entire cache."""
        self._store.clear()


# Singleton cache instance — 10 minute TTL by default
cache = Cache(default_ttl=600)

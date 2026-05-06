# 📦 InPost Locator Pro

> **Smart finder & distribution analytics** for InPost's European parcel locker network.  
> Built with **FastAPI** + **Leaflet.js** + **Chart.js** — a full-stack web application that turns 34,000+ Polish locker data points into an interactive, filterable map and a real-time analytics dashboard.

### 🌐 [Live Demo → inpostidea.onrender.com](https://inpostidea.onrender.com/)

![Map View](screenshots/stats_and_controls.png)

---

## 🎯 What is this?

InPost Locator Pro solves a real problem I've personally experienced: **finding the right parcel locker**.

Not just the *nearest* one — the one that's actually **24/7 accessible**, has **available compartments** for my parcel size, supports **on-site payment**, and is **wheelchair accessible** when I'm picking up a package for my grandmother.

The InPost app shows you lockers on a map. But it doesn't let you **filter and compare** them across multiple criteria simultaneously. This tool does.

On top of that, I added a **distribution analytics dashboard** — because once you have 34,000 data points, it's a shame not to visualize the patterns.

---

## ✨ Features

### 🗺️ Smart Finder (Map View)
- **Interactive clustered map** — 34,000+ markers rendered efficiently with Leaflet.js marker clustering
- **🔥 Heatmap mode** — toggle between markers and density heatmap visualization
- **🌙 Dark / Light theme** — toggle between dark and light mode, saved in localStorage
- **Multi-criteria filtering** — filter by 24/7 access, payment availability, easy access zone, indoor/outdoor, operational status
- **City search with autocomplete** — type a city name, fly to it instantly
- **Geolocation** — "Find near me" button using browser GPS
- **📏 Distance & travel time** — walking (🚶 5 km/h) and driving (🚗 30 km/h) estimates to each locker
- **📍 5 Nearest lockers** — after geolocating, auto-shows the 5 closest lockers sorted by distance
- **⚖️ Comparison mode** — select up to 3 lockers and compare features side by side
- **⭐ Favorites** — save lockers to favorites (persisted in localStorage)
- **🔗 Share locker** — copy a direct link to any locker (URL param `?locker=NAME`)
- **🔔 Watch & notify** — watch a locker’s status, get browser notifications if it changes
- **Detail panel** — photo, address, opening hours, locker availability (A/B/C), Google Maps navigation
- **Live stats bar** — real-time counters (Total / Operating / 24/7 / Indoor) on the map
- **Country switching** — view Poland, Italy, Spain, or all of Europe

### 📊 Distribution Analytics Dashboard
- **KPI cards** — total lockers, 24/7 access %, payment availability %, easy access %
- **Province breakdown** — bar chart showing locker density per voivodeship
- **Top 20 cities** — horizontal bar chart of cities with the most lockers
- **Operational status** — doughnut chart (operating vs non-operating)
- **Indoor vs Outdoor** — doughnut chart of location types
- **🏙️ City comparison** — select 2 cities and compare locker stats side by side
- **Country breakdown** — when viewing all countries

### ⚡ Performance
- **Pre-fetch on startup** — data loads in the background when the server starts
- **Progress bar** — real-time loading progress with page counter
- **30-min cache** — subsequent requests are instant

![Comparison Panel](screenshots/comparison_panel.png)

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────┐
│  Frontend (Vanilla JS)                      │
│  ├── Leaflet.js + MarkerCluster (map)       │
│  ├── Chart.js (analytics)                   │
│  └── Modular JS (api, map, filters, app)    │
└──────────────────┬──────────────────────────┘
                   │ fetch() → JSON
┌──────────────────▼──────────────────────────┐
│  Backend (Python / FastAPI)                 │
│  ├── /api/points — filtered, cached proxy   │
│  ├── /api/points/nearby — proximity search  │
│  ├── /api/analytics — aggregated stats      │
│  ├── /api/cities — autocomplete endpoint    │
│  ├── /api/status — loading progress poll    │
│  └── In-memory cache (30 min TTL)           │
└──────────────────┬──────────────────────────┘
                   │ httpx (async)
┌──────────────────▼──────────────────────────┐
│  InPost Points API                          │
│  api-global-points.easypack24.net/v1/points │
└─────────────────────────────────────────────┘
```

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **FastAPI** over Flask | Async-native, built-in OpenAPI docs, Pydantic validation, modern Python |
| **Backend proxy** instead of direct API calls from frontend | CORS avoidance, caching (API is slow for 34k points), data aggregation server-side, smaller payloads to client |
| **In-memory cache with TTL** | Simple, no external dependency (Redis would be overkill for a single-instance app). 30-min TTL balances freshness vs API load |
| **Parallel pagination with semaphore** | The InPost API paginates at 1000/page max. Fetching 35 pages sequentially would take ~30s. Parallel fetch with 10 concurrent requests brings it to ~3s |
| **Pre-fetch on startup** | Data loads in the background when the server starts. Frontend polls `/api/status` and shows a progress bar |
| **Field selection** via `fields` query param | Reduces payload from InPost API by ~60%. We only fetch the 16 fields we need, not all 50+ |
| **Leaflet + MarkerCluster** over Google Maps | Free, open-source, no API key needed. MarkerCluster handles 34k markers without performance issues |
| **Haversine distance** for travel estimates | Client-side calculation — no external API needed. Walk time at 5 km/h, drive at 30 km/h city average |
| **Vanilla JS** instead of React/Vue | Zero build step for frontend. The app is small enough that a framework adds complexity without proportional benefit |
| **Chart.js** over D3/Plotly | Lightweight (70kB), beautiful defaults, perfect for dashboard charts. D3 would be overkill |

---

## 🛠️ Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Backend | Python | 3.10+ |
| Framework | FastAPI | 0.115 |
| HTTP Client | httpx | 0.28 |
| ASGI Server | Uvicorn | 0.34 |
| Map | Leaflet.js | 1.9.4 |
| Clustering | Leaflet.MarkerCluster | 1.5.3 |
| Heatmap | Leaflet.heat | 0.2.0 |
| Charts | Chart.js | 4.4.7 |
| Container | Docker | — |
| CI/CD | GitHub Actions | — |
| Typography | Inter (Google Fonts) | — |
| Map Tiles | CARTO Dark | — |
| Testing | pytest | 8.3 |

---

## 🚀 How to Run

### Prerequisites
- **Python 3.10+** installed
- **Git** installed

### Setup

```bash
# Clone the repository
git clone https://github.com/SzymonTyburczy/InPostIdea.git
cd InPostIdea

# Create virtual environment
python -m venv venv

# Activate it
# Windows:
.\venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run the application
python run.py
```

The app starts at **http://localhost:8000**.

> **⚡ Data pre-fetches on startup** — the backend immediately begins loading ~34,000 points from the InPost API. The frontend shows a progress bar while it loads. Subsequent requests are served from cache (30-min TTL).

### Docker (Alternative)

```bash
# One-command startup
docker-compose up --build
```

The app will be available at **http://localhost:8000**.

### Run Tests

```bash
python -m pytest tests/ -v
```

All 13 tests should pass:
```
tests/test_analytics.py::test_compute_analytics_total PASSED
tests/test_analytics.py::test_compute_analytics_countries PASSED
tests/test_analytics.py::test_compute_analytics_statuses PASSED
tests/test_analytics.py::test_compute_analytics_247 PASSED
tests/test_analytics.py::test_compute_analytics_location_types PASSED
tests/test_analytics.py::test_compute_analytics_empty PASSED
tests/test_analytics.py::test_compute_analytics_provinces PASSED
tests/test_analytics.py::test_compute_analytics_top_cities PASSED
tests/test_cache.py::test_cache_set_and_get PASSED
tests/test_cache.py::test_cache_miss PASSED
tests/test_cache.py::test_cache_expiry PASSED
tests/test_cache.py::test_cache_invalidate PASSED
tests/test_cache.py::test_cache_clear PASSED
============================= 13 passed ==============================
```

### API Documentation

FastAPI auto-generates OpenAPI docs. With the server running, visit:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

---

## 📁 Project Structure

```
InPostIdea/
├── app/
│   ├── __init__.py
│   ├── main.py            # FastAPI app — routes, pre-fetch, progress tracking
│   ├── api_client.py      # Async InPost API client with parallel pagination
│   ├── cache.py           # In-memory TTL cache
│   └── analytics.py       # Data aggregation engine
├── static/
│   ├── css/
│   │   └── style.css      # Full design system — dark theme, responsive
│   └── js/
│       ├── api.js          # Frontend API client
│       ├── map.js          # Map + clustering + heatmap + distance + comparison
│       ├── filters.js      # Sidebar filters + city search + geolocation
│       ├── analytics.js    # Chart.js dashboard
│       └── app.js          # App orchestrator + progress polling
├── templates/
│   └── index.html          # Single-page HTML with both views
├── tests/
│   ├── test_cache.py       # 5 unit tests for cache module
│   └── test_analytics.py   # 8 unit tests for analytics engine
├── .github/
│   └── workflows/
│       └── ci.yml          # GitHub Actions CI pipeline
├── screenshots/            # Screenshots for README
├── Dockerfile              # Docker image definition
├── docker-compose.yml      # One-command startup
├── render.yaml             # Render.com deployment blueprint
├── requirements.txt        # Python dependencies
├── run.py                  # Uvicorn entry point
├── .gitignore
└── README.md
```

---

## 📸 Screenshots

### Map View — Live Stats + Controls
34,005 lockers with real-time stats bar and Markers/Heatmap toggle.

![Stats Bar](screenshots/stats_and_controls.png)

### Comparison Mode + Detail Panel
Select lockers, compare features side-by-side, see walking/driving distance.

![Comparison](screenshots/comparison_panel.png)

### Map View — Warsaw Zoomed
Individual lockers visible at street level. Green = operating, red = non-operating.

![Warsaw Zoom](screenshots/warsaw_zoom.png)

### Analytics Dashboard
KPI cards, province bar chart, top cities, status/location type doughnuts.

![Analytics](screenshots/analytics_view.png)

---

## 🧠 Assumptions & Trade-offs

1. **Poland-first approach**: The app defaults to Poland (where InPost has the densest network — 34k points). Other countries are available but have far fewer lockers.

2. **Client-side limit of 50,000 points**: To keep browser performance reasonable, the frontend loads max 50k points at a time. The API returns all points for a country, and filters are applied server-side before sending.

3. **No database**: Data is fetched live from the InPost API and cached in memory. For a production service I'd add Redis + PostgreSQL, but for this scope it's unnecessary complexity.

4. **No authentication**: This is a read-only tool — no user accounts needed.

5. **Locker availability data is mostly `NO_DATA`**: The InPost API returns availability status, but for most lockers it's `NO_DATA`. The detail panel shows it regardless, as it works for some lockers.

---

## 🔮 What I'd Add With More Time

- ~~**Heatmap layer**~~ ✅ Implemented
- ~~**Comparison mode**~~ ✅ Implemented  
- ~~**Docker containerization**~~ ✅ Implemented
- ~~**CI/CD pipeline**~~ ✅ Implemented
- **Route planning** — "show me lockers on my daily commute" using waypoints
- **Availability alerts** — notify when a frequently-full locker has space
- **Persistent cache** — Redis for multi-instance deployments
- **Full routing API** — real travel times via OSRM or Google Directions API (currently using Haversine estimates)

---

## 👤 Author

**Szymon Tyburczy**

---

## 📄 License

MIT

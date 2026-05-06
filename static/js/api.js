/**
 * API client — communicates with our FastAPI backend.
 */
const API = {
    BASE: '',

    async getPoints(params = {}) {
        const qs = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => {
            if (v !== null && v !== undefined && v !== '') qs.set(k, v);
        });
        const res = await fetch(`${this.BASE}/api/points?${qs}`);
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        return res.json();
    },

    async getNearby(lat, lng, limit = 20) {
        const res = await fetch(`${this.BASE}/api/points/nearby?lat=${lat}&lng=${lng}&limit=${limit}`);
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        return res.json();
    },

    async getAnalytics(country = '') {
        const qs = country ? `?country=${country}` : '';
        const res = await fetch(`${this.BASE}/api/analytics${qs}`);
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        return res.json();
    },

    async getCities(country = 'PL', q = '') {
        const qs = new URLSearchParams({ country });
        if (q) qs.set('q', q);
        const res = await fetch(`${this.BASE}/api/cities?${qs}`);
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        return res.json();
    },

    async getCityComparison(country, cityA, cityB) {
        const qs = new URLSearchParams({ country, city_a: cityA, city_b: cityB });
        const res = await fetch(`${this.BASE}/api/cities/compare?${qs}`);
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        return res.json();
    },

    async getDistricts(country = 'PL') {
        const res = await fetch(`${this.BASE}/api/districts?country=${country}`);
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        return res.json();
    },

    async searchLocker(q, country = 'PL') {
        const qs = new URLSearchParams({ q, country });
        const res = await fetch(`${this.BASE}/api/points/search?${qs}`);
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        return res.json();
    },
};

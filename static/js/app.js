/**
 * App — main orchestrator.
 * Theme toggle, progress polling, city comparison, navigation.
 */
document.addEventListener('DOMContentLoaded', () => {
    const overlay = document.getElementById('loading-overlay');
    const loadingText = document.getElementById('loading-text');
    const loadingSubtext = document.getElementById('loading-subtext');
    const progressBar = document.getElementById('progress-bar');
    const progressPct = document.getElementById('progress-pct');
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.querySelector('.status-text');

    // ── Theme Toggle ──
    const themeBtn = document.getElementById('theme-toggle');
    const savedTheme = localStorage.getItem('inpost_theme') || 'dark';
    if (savedTheme === 'light') applyTheme('light');

    function applyTheme(theme) {
        document.body.classList.toggle('light-theme', theme === 'light');
        themeBtn.textContent = theme === 'light' ? '☀️' : '🌙';
        localStorage.setItem('inpost_theme', theme);
        if (typeof MapModule !== 'undefined' && MapModule.setTileTheme) {
            MapModule.setTileTheme(theme);
        }
    }

    themeBtn.addEventListener('click', () => {
        const current = document.body.classList.contains('light-theme') ? 'light' : 'dark';
        applyTheme(current === 'light' ? 'dark' : 'light');
    });

    // ── Navigation ──
    const tabs = document.querySelectorAll('.nav-tab');
    const views = document.querySelectorAll('.view');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.dataset.view;
            tabs.forEach(t => t.classList.remove('active'));
            views.forEach(v => v.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(`view-${target}`).classList.add('active');
            if (target === 'map') MapModule.invalidateSize();
            if (target === 'analytics') loadAnalytics();
        });
    });

    // ── Analytics ──
    let analyticsLoaded = false;
    async function loadAnalytics() {
        if (analyticsLoaded) return;
        try {
            const country = document.getElementById('analytics-country').value;
            await Analytics.load(country);
            analyticsLoaded = true;
            await loadCityDropdowns(country);
        } catch (err) { console.error('Analytics load failed:', err); }
    }

    document.getElementById('analytics-country').addEventListener('change', async (e) => {
        analyticsLoaded = false;
        await Analytics.load(e.target.value);
        analyticsLoaded = true;
        await loadCityDropdowns(e.target.value);
    });

    // ── City Comparison ──
    async function loadCityDropdowns(country) {
        try {
            const data = await API.getCities(country || 'PL');
            const cities = (data.cities || []).slice(0, 30);
            ['city-compare-a', 'city-compare-b'].forEach(id => {
                const sel = document.getElementById(id);
                sel.innerHTML = '<option value="">Select city...</option>' +
                    cities.map(c => `<option value="${c.name}">${c.name} (${c.count})</option>`).join('');
            });
        } catch (err) { console.error('Failed to load city list:', err); }
    }

    document.getElementById('btn-compare-cities').addEventListener('click', async () => {
        const cityA = document.getElementById('city-compare-a').value;
        const cityB = document.getElementById('city-compare-b').value;
        if (!cityA || !cityB || cityA === cityB) return;

        const country = document.getElementById('analytics-country').value || 'PL';
        try {
            const data = await API.getCityComparison(country, cityA, cityB);
            renderCityComparison(data);
        } catch (err) { console.error('City comparison failed:', err); }
    });

    function renderCityComparison(data) {
        const grid = document.getElementById('city-compare-grid');
        grid.innerHTML = [data.city_a, data.city_b].map(c => `
            <div class="city-stat-card">
                <h4>${c.name}</h4>
                <div class="city-stat-row"><span>Total lockers</span><span style="font-weight:700;color:var(--accent)">${c.total}</span></div>
                <div class="city-stat-row"><span>Operating</span><span>${c.operating} (${c.operating_pct}%)</span></div>
                <div class="city-stat-row"><span>24/7 Access</span><span>${c.access_247} (${c.access_247_pct}%)</span></div>
                <div class="city-stat-row"><span>Payment</span><span>${c.payment} (${c.payment_pct}%)</span></div>
                <div class="city-stat-row"><span>Easy Access</span><span>${c.easy_access} (${c.easy_access_pct}%)</span></div>
                <div class="city-stat-row"><span>Indoor</span><span>${c.indoor} (${c.indoor_pct}%)</span></div>
                <div class="city-stat-row"><span>Outdoor</span><span>${c.outdoor}</span></div>
            </div>
        `).join('');
    }

    // ── Map + Filters ──
    MapModule.init();

    async function loadMapData(filters = {}) {
        try {
            const params = { country: filters.country || 'PL', limit: 50000 };
            if (filters.location_type) params.location_type = filters.location_type;
            if (filters.status) params.status = filters.status;
            if (filters.location_247) params.location_247 = 'true';
            if (filters.payment) params.payment = 'true';
            if (filters.easy_access) params.easy_access = 'true';

            const data = await API.getPoints(params);
            const count = MapModule.loadPoints(data.items || []);
            Filters.setResultsCount(count);
            statusDot.classList.add('connected');
            statusText.textContent = `${count.toLocaleString()} lockers loaded`;
        } catch (err) {
            console.error('Failed to load points:', err);
            statusText.textContent = 'Error loading data';
            Filters.setResultsCount(0);
        }
    }

    Filters.init(filters => { loadMapData(filters); });

    // ── Progress polling ──
    async function pollAndLoad() {
        loadingText.textContent = 'Connecting to InPost API...';
        loadingSubtext.textContent = 'Pre-fetching locker data on server startup';

        const poll = setInterval(async () => {
            try {
                const res = await fetch('/api/status');
                const status = await res.json();
                progressBar.style.width = status.progress + '%';
                progressPct.textContent = status.progress + '%';
                loadingSubtext.textContent = status.message;
                if (status.status === 'loading') loadingText.textContent = 'Fetching locker data...';
                if (status.status === 'ready' || status.status === 'error') {
                    clearInterval(poll);
                    if (status.status === 'ready') {
                        loadingText.textContent = 'Rendering map...';
                        progressBar.style.width = '100%';
                        progressPct.textContent = '100%';
                    }
                    await new Promise(r => setTimeout(r, 300));
                    await loadMapData(Filters.getFilters());
                    overlay.classList.add('hidden');
                }
            } catch { loadingSubtext.textContent = 'Waiting for server...'; }
        }, 500);
    }

    pollAndLoad();
});

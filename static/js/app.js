/**
 * App — main entry point, wires everything together.
 * Polls /api/status for loading progress, then loads data.
 */
document.addEventListener('DOMContentLoaded', () => {
    const overlay = document.getElementById('loading-overlay');
    const loadingText = document.getElementById('loading-text');
    const loadingSubtext = document.getElementById('loading-subtext');
    const progressBar = document.getElementById('progress-bar');
    const progressPct = document.getElementById('progress-pct');
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.querySelector('.status-text');

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
        } catch (err) {
            console.error('Analytics load failed:', err);
        }
    }

    document.getElementById('analytics-country').addEventListener('change', async (e) => {
        analyticsLoaded = false;
        await Analytics.load(e.target.value);
        analyticsLoaded = true;
    });

    // ── Map + Filters ──
    MapModule.init();

    async function loadMapData(filters = {}) {
        try {
            const params = {
                country: filters.country || 'PL',
                limit: 50000,
            };
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

    Filters.init(filters => {
        loadMapData(filters);
    });

    // ── Progress polling ──
    // Poll /api/status until backend pre-fetch is done, then load map
    async function pollAndLoad() {
        loadingText.textContent = 'Connecting to InPost API...';
        loadingSubtext.textContent = 'Pre-fetching locker data on server startup';

        const poll = setInterval(async () => {
            try {
                const res = await fetch('/api/status');
                const status = await res.json();

                // Update progress bar
                progressBar.style.width = status.progress + '%';
                progressPct.textContent = status.progress + '%';
                loadingSubtext.textContent = status.message;

                if (status.status === 'loading') {
                    loadingText.textContent = `Fetching locker data...`;
                }

                if (status.status === 'ready' || status.status === 'error') {
                    clearInterval(poll);

                    if (status.status === 'ready') {
                        loadingText.textContent = 'Rendering map...';
                        progressBar.style.width = '100%';
                        progressPct.textContent = '100%';
                    }

                    // Small delay for visual satisfaction
                    await new Promise(r => setTimeout(r, 300));
                    await loadMapData(Filters.getFilters());
                    overlay.classList.add('hidden');
                }
            } catch (err) {
                // API not ready yet, keep polling
                loadingSubtext.textContent = 'Waiting for server...';
            }
        }, 500);
    }

    pollAndLoad();
});

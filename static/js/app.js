/**
 * App — main entry point, wires everything together.
 */
document.addEventListener('DOMContentLoaded', () => {
    const overlay = document.getElementById('loading-overlay');
    const loadingText = document.getElementById('loading-text');
    const loadingSubtext = document.getElementById('loading-subtext');
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
        loadingText.textContent = 'Loading locker data...';
        loadingSubtext.textContent = 'This may take a moment for the first load';
        overlay.classList.remove('hidden');

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
        } finally {
            overlay.classList.add('hidden');
        }
    }

    Filters.init(filters => {
        loadMapData(filters);
    });

    // Initial load
    loadMapData(Filters.getFilters());
});

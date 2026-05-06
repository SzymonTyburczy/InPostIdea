/**
 * App — main orchestrator.
 * Theme toggle, progress polling, city comparison, locker search,
 * district ranking, CSV/PNG export.
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

    // ── Locker ID Search ──
    const lockerInput = document.getElementById('search-locker');
    const lockerResults = document.getElementById('locker-search-results');
    let lockerDebounce = null;

    lockerInput.addEventListener('input', () => {
        clearTimeout(lockerDebounce);
        const q = lockerInput.value.trim();
        if (q.length < 2) { lockerResults.classList.remove('open'); return; }

        lockerDebounce = setTimeout(async () => {
            try {
                const data = await API.searchLocker(q);
                if (!data.results.length) {
                    lockerResults.innerHTML = '<div class="locker-result"><span class="locker-addr">No lockers found</span></div>';
                    lockerResults.classList.add('open');
                    return;
                }
                lockerResults.innerHTML = data.results.map(p => {
                    const addr = p.address_details || {};
                    return `<div class="locker-result" data-name="${p.name}">
                        <div class="locker-id">${p.name}</div>
                        <div class="locker-addr">${addr.street || ''} ${addr.building_number || ''}, ${addr.city || ''}</div>
                    </div>`;
                }).join('');
                lockerResults.classList.add('open');

                lockerResults.querySelectorAll('.locker-result[data-name]').forEach(el => {
                    el.addEventListener('click', () => {
                        const name = el.dataset.name;
                        lockerResults.classList.remove('open');
                        lockerInput.value = name;
                        if (!MapModule.searchAndFly(name)) {
                            // If not found client-side, try via API response
                            const data2 = MapModule.getPoints();
                            const p = data2.find(pt => pt.name === name);
                            if (p && p.location) MapModule.flyTo(p.location.latitude, p.location.longitude, 16);
                        }
                    });
                });
            } catch (err) { console.error('Locker search failed:', err); }
        }, 300);
    });

    lockerInput.addEventListener('blur', () => {
        setTimeout(() => lockerResults.classList.remove('open'), 200);
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
            await loadDistrictRanking(country);
        } catch (err) { console.error('Analytics load failed:', err); }
    }

    document.getElementById('analytics-country').addEventListener('change', async (e) => {
        analyticsLoaded = false;
        await Analytics.load(e.target.value);
        analyticsLoaded = true;
        await loadCityDropdowns(e.target.value);
        await loadDistrictRanking(e.target.value);
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

    // ── District Ranking ──
    async function loadDistrictRanking(country) {
        try {
            const data = await API.getDistricts(country || 'PL');
            const districts = data.districts || [];
            const maxTotal = districts.length ? districts[0].total : 1;
            const container = document.getElementById('district-ranking-table');

            container.innerHTML = `<table class="district-table">
                <thead><tr>
                    <th>#</th><th>Province</th><th>Lockers</th>
                    <th>Operating</th><th>24/7</th><th>Density</th>
                </tr></thead>
                <tbody>${districts.map(d => `<tr>
                    <td class="district-rank">${d.rank}</td>
                    <td>${d.name}</td>
                    <td style="font-weight:700;color:var(--accent)">${d.total.toLocaleString()}</td>
                    <td>${d.operating_pct}%</td>
                    <td>${d.a247_pct}%</td>
                    <td style="min-width:120px"><div class="district-bar"><div class="district-bar-fill" style="width:${Math.round(d.total/maxTotal*100)}%"></div></div></td>
                </tr>`).join('')}</tbody>
            </table>`;
        } catch (err) { console.error('District ranking failed:', err); }
    }

    // ── CSV Export ──
    document.getElementById('btn-export-csv').addEventListener('click', () => {
        const points = MapModule.getPoints();
        if (!points.length) return;

        const headers = ['Name','Country','Status','City','Street','Building','PostCode','Province','Latitude','Longitude','24/7','Payment','EasyAccess','Type','OpeningHours'];
        const rows = points.map(p => {
            const a = p.address_details || {};
            const l = p.location || {};
            return [
                p.name, p.country, p.status,
                a.city, a.street, a.building_number, a.post_code, a.province,
                l.latitude, l.longitude,
                p.location_247 ? 'Yes' : 'No',
                p.payment_available ? 'Yes' : 'No',
                p.easy_access_zone ? 'Yes' : 'No',
                p.location_type,
                (p.opening_hours || '').replace(/,/g, ';'),
            ].map(v => `"${(v ?? '').toString().replace(/"/g, '""')}"`).join(',');
        });

        const csv = [headers.join(','), ...rows].join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `inpost_lockers_${new Date().toISOString().slice(0,10)}.csv`;
        a.click(); URL.revokeObjectURL(url);
    });

    // ── PNG Export (charts) ──
    document.querySelectorAll('.chart-card').forEach(card => {
        const canvas = card.querySelector('canvas');
        if (!canvas) return;
        const h3 = card.querySelector('h3');
        if (!h3) return;
        const btn = document.createElement('button');
        btn.className = 'btn-export';
        btn.innerHTML = '📸 PNG';
        btn.title = 'Export chart as PNG';
        btn.style.marginLeft = 'auto';
        btn.addEventListener('click', () => {
            const link = document.createElement('a');
            link.download = `inpost_${canvas.id || 'chart'}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        });
        // Wrap h3 and btn in header
        const header = document.createElement('div');
        header.className = 'chart-card-header';
        h3.parentNode.insertBefore(header, h3);
        header.appendChild(h3);
        header.appendChild(btn);
    });

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

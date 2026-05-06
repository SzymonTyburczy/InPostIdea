/**
 * Filters module — handles sidebar filter state and city search.
 */
const Filters = (() => {
    let currentFilters = {
        country: 'PL',
        location_type: '',
        status: '',
        location_247: null,
        payment: null,
        easy_access: null,
    };
    let onFilterChange = null;
    let debounceTimer = null;

    function init(callback) {
        onFilterChange = callback;

        // Country select
        document.getElementById('filter-country').addEventListener('change', e => {
            currentFilters.country = e.target.value;
            triggerChange();
        });

        // Chip groups
        document.querySelectorAll('.chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const group = chip.dataset.filter;
                document.querySelectorAll(`.chip[data-filter="${group}"]`).forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                currentFilters[group] = chip.dataset.value;
                triggerChange();
            });
        });

        // Toggles
        document.getElementById('filter-247').addEventListener('change', e => {
            currentFilters.location_247 = e.target.checked ? true : null;
            triggerChange();
        });
        document.getElementById('filter-payment').addEventListener('change', e => {
            currentFilters.payment = e.target.checked ? true : null;
            triggerChange();
        });
        document.getElementById('filter-access').addEventListener('change', e => {
            currentFilters.easy_access = e.target.checked ? true : null;
            triggerChange();
        });

        // City search
        const searchInput = document.getElementById('search-city');
        const searchResults = document.getElementById('search-results');

        searchInput.addEventListener('input', e => {
            clearTimeout(debounceTimer);
            const q = e.target.value.trim();
            if (q.length < 2) { searchResults.classList.remove('open'); return; }
            debounceTimer = setTimeout(async () => {
                try {
                    const data = await API.getCities(currentFilters.country || 'PL', q);
                    renderSearchResults(data.cities || []);
                } catch (err) { console.error('City search failed:', err); }
            }, 300);
        });

        searchInput.addEventListener('focus', () => {
            if (searchResults.children.length > 0) searchResults.classList.add('open');
        });

        document.addEventListener('click', e => {
            if (!e.target.closest('.search-wrapper')) searchResults.classList.remove('open');
        });

        // Geolocate button
        document.getElementById('btn-geolocate').addEventListener('click', geolocate);

        // Sidebar toggle (mobile)
        document.getElementById('sidebar-open').addEventListener('click', () => {
            document.getElementById('sidebar').classList.remove('hidden');
            document.getElementById('sidebar').classList.add('open');
        });
        document.getElementById('sidebar-close').addEventListener('click', () => {
            document.getElementById('sidebar').classList.add('hidden');
            document.getElementById('sidebar').classList.remove('open');
        });

        // Detail panel close
        document.getElementById('detail-close').addEventListener('click', () => {
            document.getElementById('detail-panel').classList.remove('open');
        });
    }

    function renderSearchResults(cities) {
        const container = document.getElementById('search-results');
        if (cities.length === 0) {
            container.innerHTML = '<div class="search-result-item"><span class="city-name">No results</span></div>';
            container.classList.add('open');
            return;
        }
        container.innerHTML = cities.slice(0, 10).map(c => `
            <div class="search-result-item" data-lat="${c.lat}" data-lng="${c.lng}" data-city="${c.name}">
                <div class="city-name">${c.name}</div>
                <div class="city-meta">${c.province} • ${c.count} lockers</div>
            </div>
        `).join('');

        container.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', () => {
                const lat = parseFloat(item.dataset.lat);
                const lng = parseFloat(item.dataset.lng);
                if (!isNaN(lat) && !isNaN(lng)) {
                    MapModule.flyTo(lat, lng, 13);
                }
                document.getElementById('search-city').value = item.dataset.city;
                container.classList.remove('open');
            });
        });
        container.classList.add('open');
    }

    async function geolocate() {
        if (!navigator.geolocation) {
            alert('Geolocation is not supported by your browser.');
            return;
        }
        const btn = document.getElementById('btn-geolocate');
        btn.disabled = true;
        btn.textContent = 'Locating...';

        navigator.geolocation.getCurrentPosition(
            pos => {
                const { latitude, longitude } = pos.coords;
                MapModule.showUserLocation(latitude, longitude);
                btn.disabled = false;
                btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg> Find near me';
            },
            err => {
                alert('Unable to get your location. Please allow location access.');
                btn.disabled = false;
                btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg> Find near me';
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    }

    function triggerChange() {
        if (onFilterChange) onFilterChange(currentFilters);
    }

    function getFilters() { return { ...currentFilters }; }
    function setResultsCount(count) {
        document.getElementById('results-count').textContent = `${count.toLocaleString()} lockers found`;
    }

    return { init, getFilters, setResultsCount };
})();

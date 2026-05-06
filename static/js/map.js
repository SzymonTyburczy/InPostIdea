/**
 * Map module — Leaflet map with clustering, heatmap, distance, comparison,
 * favorites, share, watch/notify, nearest 5.
 */
const MapModule = (() => {
    let map, clusterGroup, heatLayer, userMarker;
    let userPosition = null;
    let currentPoints = [];
    let mode = 'markers';
    let compareList = [];
    let tileLayer;
    const POLAND_CENTER = [52.0, 19.5];
    const DEFAULT_ZOOM = 7;
    const DARK_TILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    const LIGHT_TILES = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

    // ── Favorites (localStorage) ──
    function getFavorites() {
        try { return JSON.parse(localStorage.getItem('inpost_favorites') || '[]'); } catch { return []; }
    }
    function saveFavorites(favs) { localStorage.setItem('inpost_favorites', JSON.stringify(favs)); }
    function isFavorite(name) { return getFavorites().includes(name); }
    function toggleFavorite(name) {
        const favs = getFavorites();
        const idx = favs.indexOf(name);
        if (idx >= 0) favs.splice(idx, 1); else favs.push(name);
        saveFavorites(favs);
        return idx < 0;
    }

    // ── Watch/Notify (localStorage) ──
    function getWatched() {
        try { return JSON.parse(localStorage.getItem('inpost_watched') || '{}'); } catch { return {}; }
    }
    function saveWatched(w) { localStorage.setItem('inpost_watched', JSON.stringify(w)); }
    function toggleWatch(name, status) {
        const w = getWatched();
        if (w[name]) { delete w[name]; } else { w[name] = status; }
        saveWatched(w);
        return !!w[name];
    }
    function checkWatchedNotifications(points) {
        if (!('Notification' in window) || Notification.permission !== 'granted') return;
        const watched = getWatched();
        points.forEach(p => {
            if (watched[p.name] && watched[p.name] !== p.status) {
                new Notification(`📦 ${p.name} status changed`, {
                    body: `${watched[p.name]} → ${p.status}`,
                    icon: '📦',
                });
                watched[p.name] = p.status;
            }
        });
        saveWatched(watched);
    }

    // ── Haversine ──
    function haversine(lat1, lon1, lat2, lon2) {
        const R = 6371, dLat = (lat2-lat1)*Math.PI/180, dLon = (lon2-lon1)*Math.PI/180;
        const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }
    function fmtDist(km) { return km < 1 ? `${Math.round(km*1000)} m` : `${km.toFixed(1)} km`; }
    function walkTime(km) { const m = Math.round(km/5*60); return m < 60 ? `${m} min` : `${Math.floor(m/60)}h ${m%60}min`; }
    function driveTime(km) { const m = Math.round(km/30*60); return m < 1 ? '< 1 min' : m < 60 ? `${m} min` : `${Math.floor(m/60)}h ${m%60}min`; }

    function init() {
        map = L.map('map', { center: POLAND_CENTER, zoom: DEFAULT_ZOOM, zoomControl: true, preferCanvas: true });
        tileLayer = L.tileLayer(DARK_TILES, {
            attribution: '&copy; OSM &copy; CARTO', subdomains: 'abcd', maxZoom: 19,
        }).addTo(map);

        clusterGroup = L.markerClusterGroup({
            maxClusterRadius: 50, spiderfyOnMaxZoom: true, showCoverageOnHover: false,
            chunkedLoading: true, chunkInterval: 100, chunkDelay: 10,
        });
        map.addLayer(clusterGroup);

        document.getElementById('btn-markers').addEventListener('click', () => setMode('markers'));
        document.getElementById('btn-heatmap').addEventListener('click', () => setMode('heatmap'));
        document.getElementById('compare-close').addEventListener('click', clearComparison);
        document.getElementById('nearest-close').addEventListener('click', () => {
            document.getElementById('nearest-panel').classList.remove('open');
        });

        setTimeout(() => map.invalidateSize(), 100);
    }

    function setTileTheme(theme) {
        const url = theme === 'light' ? LIGHT_TILES : DARK_TILES;
        tileLayer.setUrl(url);
    }

    function setMode(m) {
        mode = m;
        document.getElementById('btn-markers').classList.toggle('active', mode === 'markers');
        document.getElementById('btn-heatmap').classList.toggle('active', mode === 'heatmap');
        if (mode === 'markers') { if (heatLayer) { map.removeLayer(heatLayer); heatLayer = null; } map.addLayer(clusterGroup); }
        else { map.removeLayer(clusterGroup); renderHeatmap(); }
    }

    function renderHeatmap() {
        if (heatLayer) map.removeLayer(heatLayer);
        const data = currentPoints.filter(p => p.location?.latitude).map(p => [p.location.latitude, p.location.longitude, 0.6]);
        heatLayer = L.heatLayer(data, {
            radius: 18, blur: 25, maxZoom: 13,
            gradient: { 0.2:'#1a1a2e', 0.4:'#16213e', 0.5:'#0f3460', 0.65:'#e94560', 0.8:'#ffcf00', 1.0:'#ffffff' },
        }).addTo(map);
    }

    function createIcon(status, fav) {
        const color = status === 'Operating' ? '#34d399' : '#f87171';
        const border = fav ? '#ffcf00' : '#fff';
        const size = fav ? 14 : 12;
        return L.divIcon({
            className: 'custom-marker',
            html: `<div style="width:${size}px;height:${size}px;background:${color};border-radius:50%;border:2px solid ${border};box-shadow:0 0 6px ${color}"></div>`,
            iconSize: [size, size], iconAnchor: [size/2, size/2],
        });
    }

    function loadPoints(points) {
        currentPoints = points;
        clusterGroup.clearLayers();
        const markers = [];
        let operating = 0, access247 = 0, indoor = 0;
        const favs = getFavorites();

        checkWatchedNotifications(points);

        points.forEach(p => {
            const loc = p.location;
            if (!loc?.latitude || !loc?.longitude) return;
            if (p.status === 'Operating') operating++;
            if (p.location_247) access247++;
            if (p.location_type === 'Indoor') indoor++;

            const marker = L.marker([loc.latitude, loc.longitude], { icon: createIcon(p.status, favs.includes(p.name)) });
            marker.on('click', () => showDetail(p));
            const addr = p.address_details || {};
            marker.bindTooltip(`<strong>${p.name}</strong><br>${addr.street||''} ${addr.building_number||''}<br>${addr.city||''}`, { direction:'top', offset:[0,-8] });
            markers.push(marker);
        });

        clusterGroup.addLayers(markers);
        document.getElementById('stat-total').textContent = points.length.toLocaleString();
        document.getElementById('stat-operating').textContent = operating.toLocaleString();
        document.getElementById('stat-247').textContent = access247.toLocaleString();
        document.getElementById('stat-indoor').textContent = indoor.toLocaleString();
        if (mode === 'heatmap') renderHeatmap();

        // Check URL for shared locker
        const params = new URLSearchParams(window.location.search);
        const shared = params.get('locker');
        if (shared) {
            const found = points.find(p => p.name === shared);
            if (found) {
                showDetail(found);
                if (found.location) flyTo(found.location.latitude, found.location.longitude, 16);
            }
        }

        return markers.length;
    }

    function flyTo(lat, lng, zoom = 14) { map.flyTo([lat, lng], zoom, { duration: 1.2 }); }

    function showUserLocation(lat, lng) {
        userPosition = { lat, lng };
        if (userMarker) map.removeLayer(userMarker);
        userMarker = L.circleMarker([lat, lng], { radius: 10, fillColor:'#ffcf00', fillOpacity:0.9, color:'#fff', weight:2 }).addTo(map);
        userMarker.bindTooltip('You are here', { permanent: true, direction: 'top' });
        flyTo(lat, lng, 14);
        showNearest5();
    }

    function showNearest5() {
        if (!userPosition || !currentPoints.length) return;
        const withDist = currentPoints
            .filter(p => p.location?.latitude)
            .map(p => ({ ...p, _dist: haversine(userPosition.lat, userPosition.lng, p.location.latitude, p.location.longitude) }))
            .sort((a, b) => a._dist - b._dist)
            .slice(0, 5);

        const list = document.getElementById('nearest-list');
        list.innerHTML = withDist.map((p, i) => {
            const addr = p.address_details || {};
            return `<div class="nearest-item" data-name="${p.name}">
                <span class="nearest-rank">${i+1}</span>
                <div class="nearest-info">
                    <div class="nearest-name">${p.name}</div>
                    <div class="nearest-addr">${addr.street||''} ${addr.building_number||''}, ${addr.city||''}</div>
                </div>
                <div class="nearest-dist">
                    <div class="nearest-dist-val">${fmtDist(p._dist)}</div>
                    <div class="nearest-dist-walk">🚶 ${walkTime(p._dist)}</div>
                </div>
            </div>`;
        }).join('');

        list.querySelectorAll('.nearest-item').forEach(el => {
            el.addEventListener('click', () => {
                const p = currentPoints.find(pt => pt.name === el.dataset.name);
                if (p) { showDetail(p); flyTo(p.location.latitude, p.location.longitude, 16); }
            });
        });

        document.getElementById('nearest-panel').classList.add('open');
    }

    function getUserPosition() { return userPosition; }
    function invalidateSize() { if (map) setTimeout(() => map.invalidateSize(), 50); }

    // ── Detail Panel ──
    function showDetail(point) {
        const panel = document.getElementById('detail-panel');
        const content = document.getElementById('detail-content');
        const addr = point.address_details || {};
        const locker = point.locker_availability || {};
        const details = locker.details || {};
        const loc = point.location || {};

        const statusBadge = point.status === 'Operating' ? '<span class="badge badge-success">Operating</span>' : '<span class="badge badge-danger">Non-operating</span>';
        const badges = [statusBadge];
        if (point.location_247) badges.push('<span class="badge badge-info">24/7</span>');
        if (point.payment_available) badges.push('<span class="badge badge-warning">Payment</span>');
        if (point.easy_access_zone) badges.push('<span class="badge badge-info">♿ Accessible</span>');
        badges.push(`<span class="badge badge-info">${point.location_type || 'N/A'}</span>`);

        const sizeLabels = { A:'Small (A)', B:'Medium (B)', C:'Large (C)' };
        const availHTML = Object.entries(details).map(([s, st]) => {
            let cls, label;
            if (st === 'Available') { cls = 'badge-success'; label = 'Available'; }
            else if (st === 'Full') { cls = 'badge-danger'; label = 'Full'; }
            else { cls = 'badge-muted'; label = 'No live data'; }
            return `<div class="detail-row"><span class="label">${sizeLabels[s]||s}</span><span class="badge ${cls}">${label}</span></div>`;
        }).join('');

        const imgUrl = point.image_url || '';
        const imgHTML = imgUrl ? `<img class="detail-img" src="${imgUrl}" alt="${point.name}" onerror="this.style.display='none'">` : '';

        let distHTML = '';
        if (userPosition && loc.latitude) {
            const d = haversine(userPosition.lat, userPosition.lng, loc.latitude, loc.longitude);
            distHTML = `<div class="detail-section"><h4>Distance from you</h4>
                <div class="distance-cards">
                    <div class="distance-card"><span class="distance-icon">🚶</span><span class="distance-value">${fmtDist(d)}</span><span class="distance-time">${walkTime(d)}</span></div>
                    <div class="distance-card"><span class="distance-icon">🚗</span><span class="distance-value">${fmtDist(d)}</span><span class="distance-time">${driveTime(d)}</span></div>
                </div></div>`;
        }

        const navUrl = loc.latitude ? `https://www.google.com/maps/dir/?api=1&destination=${loc.latitude},${loc.longitude}` : '#';
        const fav = isFavorite(point.name);
        const watched = getWatched();
        const isWatched = !!watched[point.name];
        const isInCompare = compareList.some(c => c.name === point.name);
        const shareUrl = `${window.location.origin}?locker=${encodeURIComponent(point.name)}`;

        content.innerHTML = `
            ${imgHTML}
            <h3>${point.name}</h3>
            <p class="detail-address">${addr.street||''} ${addr.building_number||''}, ${addr.post_code||''} ${addr.city||''}<br>${addr.province||''}, ${point.country||''}</p>
            <div class="detail-badges">${badges.join('')}</div>
            ${distHTML}
            <div class="detail-section"><h4>Opening Hours</h4><p style="font-size:0.9rem">${point.opening_hours || 'N/A'}</p></div>
            ${availHTML ? `<div class="detail-section"><h4>Locker Availability</h4>${availHTML}</div>` : ''}
            <div class="detail-section"><h4>Location</h4><p style="font-size:0.85rem;color:var(--text-secondary)">${point.location_description || 'N/A'}</p></div>
            <a href="${navUrl}" target="_blank" rel="noopener" class="btn-navigate">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
                Navigate with Google Maps
            </a>
            <div class="detail-actions">
                <button class="action-btn ${fav?'active':''}" id="btn-fav">⭐ ${fav?'Saved':'Favorite'}</button>
                <button class="action-btn" id="btn-share">🔗 Share</button>
                <button class="action-btn ${isWatched?'active':''}" id="btn-watch">🔔 ${isWatched?'Watching':'Watch'}</button>
            </div>
            <button class="btn-compare ${isInCompare?'added':''}" id="btn-add-compare" ${isInCompare?'disabled':''}>${isInCompare?'✓ In comparison':'⚖️ Add to compare'}</button>
        `;

        document.getElementById('btn-fav').addEventListener('click', function() {
            const nowFav = toggleFavorite(point.name);
            this.classList.toggle('active', nowFav);
            this.textContent = nowFav ? '⭐ Saved' : '⭐ Favorite';
        });

        document.getElementById('btn-share').addEventListener('click', function() {
            navigator.clipboard.writeText(shareUrl).then(() => {
                this.textContent = '✓ Copied!';
                setTimeout(() => { this.textContent = '🔗 Share'; }, 2000);
            });
        });

        document.getElementById('btn-watch').addEventListener('click', function() {
            if ('Notification' in window && Notification.permission === 'default') {
                Notification.requestPermission();
            }
            const nowWatched = toggleWatch(point.name, point.status);
            this.classList.toggle('active', nowWatched);
            this.textContent = nowWatched ? '🔔 Watching' : '🔔 Watch';
        });

        if (!isInCompare) {
            document.getElementById('btn-add-compare').addEventListener('click', function() {
                addToCompare(point);
                this.textContent = '✓ In comparison';
                this.classList.add('added');
                this.disabled = true;
            });
        }

        panel.classList.add('open');
    }

    // ── Comparison ──
    function addToCompare(p) {
        if (compareList.length >= 3) compareList.shift();
        if (!compareList.some(c => c.name === p.name)) compareList.push(p);
        renderComparison();
    }
    function clearComparison() { compareList = []; document.getElementById('compare-panel').classList.remove('open'); }
    function renderComparison() {
        const panel = document.getElementById('compare-panel');
        const body = document.getElementById('compare-body');
        if (!compareList.length) { panel.classList.remove('open'); return; }
        panel.classList.add('open');

        body.innerHTML = compareList.map(p => {
            const addr = p.address_details || {};
            const details = (p.locker_availability || {}).details || {};
            const loc = p.location || {};
            let distInfo = '';
            if (userPosition && loc.latitude) {
                const d = haversine(userPosition.lat, userPosition.lng, loc.latitude, loc.longitude);
                distInfo = `<div class="compare-row"><span class="compare-label">Distance</span><span>${fmtDist(d)}</span></div>
                <div class="compare-row"><span class="compare-label">🚶 Walk</span><span>${walkTime(d)}</span></div>
                <div class="compare-row"><span class="compare-label">🚗 Drive</span><span>${driveTime(d)}</span></div>`;
            }
            const sizeInfo = Object.entries(details).map(([s,st]) => `${st==='Available'?'✅':st==='Full'?'❌':'❓'} ${s}`).join(' ') || '—';
            return `<div class="compare-col">
                <button class="compare-remove" data-name="${p.name}">&times;</button>
                <h4>${p.name}</h4><p class="compare-city">${addr.city||''}</p>
                <div class="compare-row"><span class="compare-label">Status</span><span>${p.status==='Operating'?'✅':'❌'}</span></div>
                <div class="compare-row"><span class="compare-label">24/7</span><span>${p.location_247?'✅':'❌'}</span></div>
                <div class="compare-row"><span class="compare-label">Payment</span><span>${p.payment_available?'✅':'❌'}</span></div>
                <div class="compare-row"><span class="compare-label">Accessible</span><span>${p.easy_access_zone?'✅':'❌'}</span></div>
                <div class="compare-row"><span class="compare-label">Type</span><span>${p.location_type||'—'}</span></div>
                <div class="compare-row"><span class="compare-label">Sizes</span><span>${sizeInfo}</span></div>
                ${distInfo}
            </div>`;
        }).join('');

        body.querySelectorAll('.compare-remove').forEach(btn => {
            btn.addEventListener('click', () => { compareList = compareList.filter(c => c.name !== btn.dataset.name); renderComparison(); });
        });
    }

    function searchAndFly(name) {
        const p = currentPoints.find(pt => pt.name === name);
        if (p && p.location) {
            showDetail(p);
            flyTo(p.location.latitude, p.location.longitude, 16);
            return true;
        }
        return false;
    }

    function getPoints() { return currentPoints; }

    return { init, loadPoints, flyTo, showUserLocation, getUserPosition, invalidateSize, setTileTheme, searchAndFly, getPoints };
})();

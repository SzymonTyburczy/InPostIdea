/**
 * Map module — Leaflet map with marker clustering, heatmap, distance, comparison.
 */
const MapModule = (() => {
    let map;
    let clusterGroup;
    let heatLayer;
    let userMarker;
    let userPosition = null;  // {lat, lng}
    let currentPoints = [];
    let mode = 'markers';
    let compareList = [];   // up to 3 lockers for comparison
    const POLAND_CENTER = [52.0, 19.5];
    const DEFAULT_ZOOM = 7;

    // Haversine distance in km
    function haversine(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }

    function formatDistance(km) {
        if (km < 1) return `${Math.round(km * 1000)} m`;
        return `${km.toFixed(1)} km`;
    }

    function estimateWalkTime(km) {
        const mins = Math.round(km / 5 * 60); // 5 km/h
        if (mins < 60) return `${mins} min`;
        return `${Math.floor(mins/60)}h ${mins%60}min`;
    }

    function estimateDriveTime(km) {
        const mins = Math.round(km / 30 * 60); // 30 km/h city avg
        if (mins < 1) return '< 1 min';
        if (mins < 60) return `${mins} min`;
        return `${Math.floor(mins/60)}h ${mins%60}min`;
    }

    function init() {
        map = L.map('map', {
            center: POLAND_CENTER, zoom: DEFAULT_ZOOM,
            zoomControl: true, preferCanvas: true,
        });

        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
            subdomains: 'abcd', maxZoom: 19,
        }).addTo(map);

        clusterGroup = L.markerClusterGroup({
            maxClusterRadius: 50, spiderfyOnMaxZoom: true,
            showCoverageOnHover: false, chunkedLoading: true,
            chunkInterval: 100, chunkDelay: 10,
        });
        map.addLayer(clusterGroup);

        // Toggle buttons
        document.getElementById('btn-markers').addEventListener('click', () => setMode('markers'));
        document.getElementById('btn-heatmap').addEventListener('click', () => setMode('heatmap'));

        // Comparison panel close
        document.getElementById('compare-close').addEventListener('click', clearComparison);

        setTimeout(() => map.invalidateSize(), 100);
    }

    function setMode(newMode) {
        mode = newMode;
        document.getElementById('btn-markers').classList.toggle('active', mode === 'markers');
        document.getElementById('btn-heatmap').classList.toggle('active', mode === 'heatmap');
        if (mode === 'markers') {
            if (heatLayer) { map.removeLayer(heatLayer); heatLayer = null; }
            map.addLayer(clusterGroup);
        } else {
            map.removeLayer(clusterGroup);
            renderHeatmap();
        }
    }

    function renderHeatmap() {
        if (heatLayer) map.removeLayer(heatLayer);
        const heatData = currentPoints
            .filter(p => p.location && p.location.latitude)
            .map(p => [p.location.latitude, p.location.longitude, 0.6]);
        heatLayer = L.heatLayer(heatData, {
            radius: 18, blur: 25, maxZoom: 13,
            gradient: { 0.2:'#1a1a2e', 0.4:'#16213e', 0.5:'#0f3460', 0.65:'#e94560', 0.8:'#ffcf00', 1.0:'#ffffff' },
        }).addTo(map);
    }

    function createIcon(status) {
        const color = status === 'Operating' ? '#34d399' : '#f87171';
        return L.divIcon({
            className: 'custom-marker',
            html: `<div style="width:12px;height:12px;background:${color};border-radius:50%;border:2px solid #fff;box-shadow:0 0 6px ${color}"></div>`,
            iconSize: [12, 12], iconAnchor: [6, 6],
        });
    }

    function loadPoints(points) {
        currentPoints = points;
        clusterGroup.clearLayers();
        const markers = [];
        let operating = 0, access247 = 0, indoor = 0;

        points.forEach(p => {
            const loc = p.location;
            if (!loc || !loc.latitude || !loc.longitude) return;
            if (p.status === 'Operating') operating++;
            if (p.location_247) access247++;
            if (p.location_type === 'Indoor') indoor++;

            const marker = L.marker([loc.latitude, loc.longitude], { icon: createIcon(p.status) });
            marker.on('click', () => showDetail(p));
            const addr = p.address_details || {};
            marker.bindTooltip(
                `<strong>${p.name}</strong><br>${addr.street || ''} ${addr.building_number || ''}<br>${addr.city || ''}`,
                { direction: 'top', offset: [0, -8] }
            );
            markers.push(marker);
        });

        clusterGroup.addLayers(markers);
        document.getElementById('stat-total').textContent = points.length.toLocaleString();
        document.getElementById('stat-operating').textContent = operating.toLocaleString();
        document.getElementById('stat-247').textContent = access247.toLocaleString();
        document.getElementById('stat-indoor').textContent = indoor.toLocaleString();
        if (mode === 'heatmap') renderHeatmap();
        return markers.length;
    }

    function flyTo(lat, lng, zoom = 14) { map.flyTo([lat, lng], zoom, { duration: 1.2 }); }

    function showUserLocation(lat, lng) {
        userPosition = { lat, lng };
        if (userMarker) map.removeLayer(userMarker);
        userMarker = L.circleMarker([lat, lng], {
            radius: 10, fillColor: '#ffcf00', fillOpacity: 0.9, color: '#fff', weight: 2,
        }).addTo(map);
        userMarker.bindTooltip('You are here', { permanent: true, direction: 'top' });
        flyTo(lat, lng, 14);
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

        const statusBadge = point.status === 'Operating'
            ? '<span class="badge badge-success">Operating</span>'
            : '<span class="badge badge-danger">Non-operating</span>';
        const badges = [statusBadge];
        if (point.location_247) badges.push('<span class="badge badge-info">24/7</span>');
        if (point.payment_available) badges.push('<span class="badge badge-warning">Payment</span>');
        if (point.easy_access_zone) badges.push('<span class="badge badge-info">♿ Accessible</span>');
        badges.push(`<span class="badge badge-info">${point.location_type || 'N/A'}</span>`);

        const sizeLabels = { A: 'Small (A)', B: 'Medium (B)', C: 'Large (C)' };
        const availHTML = Object.entries(details).map(([size, status]) => {
            const cls = status === 'Available' ? 'badge-success' : status === 'Full' ? 'badge-danger' : 'badge-warning';
            return `<div class="detail-row"><span class="label">${sizeLabels[size]||size}</span><span class="badge ${cls}">${status}</span></div>`;
        }).join('');

        const imgUrl = point.image_url || '';
        const imgHTML = imgUrl ? `<img class="detail-img" src="${imgUrl}" alt="${point.name}" onerror="this.style.display='none'">` : '';

        // Distance from user
        let distHTML = '';
        if (userPosition && loc.latitude) {
            const dist = haversine(userPosition.lat, userPosition.lng, loc.latitude, loc.longitude);
            distHTML = `
            <div class="detail-section">
                <h4>Distance from you</h4>
                <div class="distance-cards">
                    <div class="distance-card">
                        <span class="distance-icon">🚶</span>
                        <span class="distance-value">${formatDistance(dist)}</span>
                        <span class="distance-time">${estimateWalkTime(dist)}</span>
                    </div>
                    <div class="distance-card">
                        <span class="distance-icon">🚗</span>
                        <span class="distance-value">${formatDistance(dist)}</span>
                        <span class="distance-time">${estimateDriveTime(dist)}</span>
                    </div>
                </div>
            </div>`;
        }

        const navUrl = loc.latitude ? `https://www.google.com/maps/dir/?api=1&destination=${loc.latitude},${loc.longitude}` : '#';
        const isInCompare = compareList.some(c => c.name === point.name);
        const compareBtnText = isInCompare ? '✓ In comparison' : '⚖️ Add to compare';
        const compareBtnClass = isInCompare ? 'btn-compare added' : 'btn-compare';

        content.innerHTML = `
            ${imgHTML}
            <h3>${point.name}</h3>
            <p class="detail-address">${addr.street||''} ${addr.building_number||''}, ${addr.post_code||''} ${addr.city||''}<br>${addr.province||''}, ${point.country||''}</p>
            <div class="detail-badges">${badges.join('')}</div>
            ${distHTML}
            <div class="detail-section">
                <h4>Opening Hours</h4>
                <p style="font-size:0.9rem">${point.opening_hours || 'N/A'}</p>
            </div>
            ${availHTML ? `<div class="detail-section"><h4>Locker Availability</h4>${availHTML}</div>` : ''}
            <div class="detail-section">
                <h4>Location</h4>
                <p style="font-size:0.85rem;color:var(--text-secondary)">${point.location_description || 'N/A'}</p>
            </div>
            <a href="${navUrl}" target="_blank" rel="noopener" class="btn-navigate">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
                Navigate with Google Maps
            </a>
            <button class="${compareBtnClass}" id="btn-add-compare" ${isInCompare ? 'disabled' : ''}>${compareBtnText}</button>
        `;

        if (!isInCompare) {
            document.getElementById('btn-add-compare').addEventListener('click', () => {
                addToCompare(point);
                document.getElementById('btn-add-compare').textContent = '✓ In comparison';
                document.getElementById('btn-add-compare').classList.add('added');
                document.getElementById('btn-add-compare').disabled = true;
            });
        }

        panel.classList.add('open');
    }

    // ── Comparison Mode ──
    function addToCompare(point) {
        if (compareList.length >= 3) {
            compareList.shift(); // Remove oldest
        }
        if (!compareList.some(c => c.name === point.name)) {
            compareList.push(point);
        }
        renderComparison();
    }

    function clearComparison() {
        compareList = [];
        document.getElementById('compare-panel').classList.remove('open');
    }

    function renderComparison() {
        const panel = document.getElementById('compare-panel');
        const body = document.getElementById('compare-body');
        if (compareList.length === 0) { panel.classList.remove('open'); return; }
        panel.classList.add('open');

        const cols = compareList.map(p => {
            const addr = p.address_details || {};
            const locker = p.locker_availability || {};
            const details = locker.details || {};
            const loc = p.location || {};

            let distInfo = '';
            if (userPosition && loc.latitude) {
                const d = haversine(userPosition.lat, userPosition.lng, loc.latitude, loc.longitude);
                distInfo = `<div class="compare-row"><span class="compare-label">Distance</span><span>${formatDistance(d)}</span></div>
                <div class="compare-row"><span class="compare-label">🚶 Walk</span><span>${estimateWalkTime(d)}</span></div>
                <div class="compare-row"><span class="compare-label">🚗 Drive</span><span>${estimateDriveTime(d)}</span></div>`;
            }

            const sizeInfo = Object.entries(details).map(([s, st]) => {
                const icon = st === 'Available' ? '✅' : st === 'Full' ? '❌' : '❓';
                return `<span>${icon} ${s}</span>`;
            }).join(' ');

            return `<div class="compare-col">
                <button class="compare-remove" data-name="${p.name}">&times;</button>
                <h4>${p.name}</h4>
                <p class="compare-city">${addr.city || ''}</p>
                <div class="compare-row"><span class="compare-label">Status</span><span>${p.status === 'Operating' ? '✅' : '❌'}</span></div>
                <div class="compare-row"><span class="compare-label">24/7</span><span>${p.location_247 ? '✅' : '❌'}</span></div>
                <div class="compare-row"><span class="compare-label">Payment</span><span>${p.payment_available ? '✅' : '❌'}</span></div>
                <div class="compare-row"><span class="compare-label">Accessible</span><span>${p.easy_access_zone ? '✅' : '❌'}</span></div>
                <div class="compare-row"><span class="compare-label">Type</span><span>${p.location_type || '—'}</span></div>
                <div class="compare-row"><span class="compare-label">Sizes</span><span>${sizeInfo || '—'}</span></div>
                ${distInfo}
            </div>`;
        }).join('');

        body.innerHTML = cols;

        // Remove buttons
        body.querySelectorAll('.compare-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                compareList = compareList.filter(c => c.name !== btn.dataset.name);
                renderComparison();
            });
        });
    }

    return { init, loadPoints, flyTo, showUserLocation, getUserPosition, invalidateSize };
})();

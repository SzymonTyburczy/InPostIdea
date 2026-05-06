/**
 * Map module — Leaflet map with marker clustering.
 */
const MapModule = (() => {
    let map;
    let clusterGroup;
    let userMarker;
    const POLAND_CENTER = [52.0, 19.5];
    const DEFAULT_ZOOM = 7;

    function init() {
        map = L.map('map', {
            center: POLAND_CENTER,
            zoom: DEFAULT_ZOOM,
            zoomControl: true,
            preferCanvas: true,
        });

        // Dark tile layer
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 19,
        }).addTo(map);

        clusterGroup = L.markerClusterGroup({
            maxClusterRadius: 50,
            spiderfyOnMaxZoom: true,
            showCoverageOnHover: false,
            chunkedLoading: true,
            chunkInterval: 100,
            chunkDelay: 10,
        });
        map.addLayer(clusterGroup);

        // Fix map size on view switch
        setTimeout(() => map.invalidateSize(), 100);
    }

    function createIcon(status) {
        const color = status === 'Operating' ? '#34d399' : '#f87171';
        return L.divIcon({
            className: 'custom-marker',
            html: `<div style="width:12px;height:12px;background:${color};border-radius:50%;border:2px solid #fff;box-shadow:0 0 6px ${color}"></div>`,
            iconSize: [12, 12],
            iconAnchor: [6, 6],
        });
    }

    function loadPoints(points) {
        clusterGroup.clearLayers();
        const markers = [];

        points.forEach(p => {
            const loc = p.location;
            if (!loc || !loc.latitude || !loc.longitude) return;

            const marker = L.marker([loc.latitude, loc.longitude], {
                icon: createIcon(p.status),
            });

            marker.on('click', () => {
                showDetail(p);
            });

            // Lightweight popup on hover
            const addr = p.address_details || {};
            marker.bindTooltip(
                `<strong>${p.name}</strong><br>${addr.street || ''} ${addr.building_number || ''}<br>${addr.city || ''}`,
                { direction: 'top', offset: [0, -8] }
            );

            markers.push(marker);
        });

        clusterGroup.addLayers(markers);
        return markers.length;
    }

    function flyTo(lat, lng, zoom = 14) {
        map.flyTo([lat, lng], zoom, { duration: 1.2 });
    }

    function showUserLocation(lat, lng) {
        if (userMarker) map.removeLayer(userMarker);
        userMarker = L.circleMarker([lat, lng], {
            radius: 10, fillColor: '#ffcf00', fillOpacity: 0.9,
            color: '#fff', weight: 2,
        }).addTo(map);
        userMarker.bindTooltip('You are here', { permanent: true, direction: 'top' });
        flyTo(lat, lng, 14);
    }

    function invalidateSize() {
        if (map) setTimeout(() => map.invalidateSize(), 50);
    }

    // Detail panel logic
    function showDetail(point) {
        const panel = document.getElementById('detail-panel');
        const content = document.getElementById('detail-content');
        const addr = point.address_details || {};
        const locker = point.locker_availability || {};
        const details = locker.details || {};

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
            return `<div class="detail-row"><span class="label">${sizeLabels[size] || size}</span><span class="badge ${cls}">${status}</span></div>`;
        }).join('');

        const imgUrl = point.image_url || '';
        const imgHTML = imgUrl ? `<img class="detail-img" src="${imgUrl}" alt="${point.name}" onerror="this.style.display='none'">` : '';

        content.innerHTML = `
            ${imgHTML}
            <h3>${point.name}</h3>
            <p class="detail-address">${addr.street || ''} ${addr.building_number || ''}, ${addr.post_code || ''} ${addr.city || ''}<br>${addr.province || ''}, ${point.country || ''}</p>
            <div class="detail-badges">${badges.join('')}</div>
            <div class="detail-section">
                <h4>Opening Hours</h4>
                <p style="font-size:0.9rem">${point.opening_hours || 'N/A'}</p>
            </div>
            ${availHTML ? `<div class="detail-section"><h4>Locker Availability</h4>${availHTML}</div>` : ''}
            <div class="detail-section">
                <h4>Location</h4>
                <p style="font-size:0.85rem;color:var(--text-secondary)">${point.location_description || 'N/A'}</p>
            </div>
        `;
        panel.classList.add('open');
    }

    return { init, loadPoints, flyTo, showUserLocation, invalidateSize };
})();

/**
 * Analytics module — Chart.js powered dashboard.
 */
const Analytics = (() => {
    let charts = {};
    let loaded = false;

    const PALETTE = [
        '#ffcf00','#ff6b6b','#4ecdc4','#45b7d1','#96ceb4',
        '#feca57','#ff9ff3','#54a0ff','#5f27cd','#01a3a4',
        '#f368e0','#ff9f43','#ee5a24','#0abde3','#10ac84',
        '#8395a7','#c8d6e5','#576574','#222f3e','#341f97',
    ];

    Chart.defaults.color = '#8b97b8';
    Chart.defaults.borderColor = '#1e293b';
    Chart.defaults.font.family = "'Inter', sans-serif";

    function destroyCharts() {
        Object.values(charts).forEach(c => c.destroy());
        charts = {};
    }

    async function load(country = 'PL') {
        const data = await API.getAnalytics(country);
        render(data);
        loaded = true;
    }

    function render(data) {
        destroyCharts();

        // KPIs
        document.getElementById('kpi-total-value').textContent = (data.total || 0).toLocaleString();
        document.getElementById('kpi-247-value').textContent = `${data.access_247_pct || 0}%`;
        document.getElementById('kpi-payment-value').textContent = `${data.payment_available_pct || 0}%`;
        document.getElementById('kpi-access-value').textContent = `${data.easy_access_pct || 0}%`;

        // Animate KPI values
        document.querySelectorAll('.kpi-value').forEach(el => {
            el.style.animation = 'none';
            el.offsetHeight; // reflow
            el.style.animation = 'fadeInUp 0.6s ease forwards';
        });

        // Province bar chart
        if (data.provinces) {
            charts.provinces = new Chart(document.getElementById('chart-provinces'), {
                type: 'bar',
                data: {
                    labels: data.provinces.labels || [],
                    datasets: [{
                        label: 'Lockers',
                        data: data.provinces.values || [],
                        backgroundColor: PALETTE.slice(0, (data.provinces.labels || []).length),
                        borderRadius: 6,
                        borderSkipped: false,
                    }],
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { ticks: { maxRotation: 45, font: { size: 11 } } },
                        y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.04)' } },
                    },
                },
            });
        }

        // Status doughnut
        if (data.statuses) {
            const statusLabels = Object.keys(data.statuses);
            const statusValues = Object.values(data.statuses);
            charts.status = new Chart(document.getElementById('chart-status'), {
                type: 'doughnut',
                data: {
                    labels: statusLabels,
                    datasets: [{
                        data: statusValues,
                        backgroundColor: ['#34d399', '#f87171', '#fbbf24', '#8b97b8'],
                        borderWidth: 0,
                    }],
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    cutout: '65%',
                    plugins: { legend: { position: 'bottom', labels: { padding: 16 } } },
                },
            });
        }

        // Location type doughnut
        if (data.location_types) {
            charts.locType = new Chart(document.getElementById('chart-location-type'), {
                type: 'doughnut',
                data: {
                    labels: Object.keys(data.location_types),
                    datasets: [{
                        data: Object.values(data.location_types),
                        backgroundColor: ['#45b7d1', '#ff9f43', '#8b97b8'],
                        borderWidth: 0,
                    }],
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    cutout: '65%',
                    plugins: { legend: { position: 'bottom', labels: { padding: 16 } } },
                },
            });
        }

        // Top cities
        if (data.top_cities) {
            charts.cities = new Chart(document.getElementById('chart-cities'), {
                type: 'bar',
                data: {
                    labels: (data.top_cities.labels || []).slice(0, 20),
                    datasets: [{
                        label: 'Lockers',
                        data: (data.top_cities.values || []).slice(0, 20),
                        backgroundColor: '#ffcf00',
                        borderRadius: 4,
                        borderSkipped: false,
                    }],
                },
                options: {
                    indexAxis: 'y',
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.04)' } },
                        y: { ticks: { font: { size: 11 } } },
                    },
                },
            });
        }

        // Countries
        if (data.countries) {
            charts.countries = new Chart(document.getElementById('chart-countries'), {
                type: 'doughnut',
                data: {
                    labels: Object.keys(data.countries),
                    datasets: [{
                        data: Object.values(data.countries),
                        backgroundColor: PALETTE.slice(0, Object.keys(data.countries).length),
                        borderWidth: 0,
                    }],
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    cutout: '55%',
                    plugins: { legend: { position: 'bottom', labels: { padding: 12 } } },
                },
            });
        }
    }

    return { load };
})();

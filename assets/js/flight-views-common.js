// Shared helpers for the 2D map and network-graph flight views.
// Loaded as a plain (non-module) global script. Expects `flightRoutesData`
// and `locationsData` to be defined on window by the host page (via Jekyll).
//
// Color + frequency logic mirrors assets/js/earth.js so the three views stay
// visually consistent (same airline -> same color across globe / map / graph).

window.FV = (function () {
    // Same palette + cyclic assignment as earth.js generateDistinctColors()
    const BASE_COLORS = [
        '#FFFF00', '#FF8C00', '#00BFFF', '#FFFFFF', '#FF1493',
        '#00FF00', '#FF4500', '#00FFFF', '#FFD700', '#FF69B4',
        '#00CED1', '#FF6347'
    ];
    const DEFAULT_COLOR = '#00FF00';

    // Build airline -> color using first-appearance order (matches earth.js,
    // which uses [...new Set(routes.map(r => r.airline))]).
    function airlineColorMap(routes) {
        const unique = [...new Set(routes.map(r => r.airline))].filter(Boolean);
        const map = {};
        unique.forEach((a, i) => { map[a] = BASE_COLORS[i % BASE_COLORS.length]; });
        map.default = DEFAULT_COLOR;
        return map;
    }

    function colorFor(airline, map) {
        return map[airline] || map.default;
    }

    // Name -> { name, lat, lon } lookup
    function locationIndex(locations) {
        const idx = {};
        locations.forEach(l => { idx[l.name] = l; });
        return idx;
    }

    // Undirected route key (Munich->Denver === Denver->Munich)
    function routeKey(a, b) {
        return [a, b].sort().join(' ↔ ');
    }

    // Count how many times each undirected city-pair was flown
    function countFrequencies(routes) {
        const freq = {};
        routes.forEach(r => {
            const k = routeKey(r.origin, r.destination);
            freq[k] = (freq[k] || 0) + 1;
        });
        return freq;
    }

    // Count how many flight legs touch each city (used for node / dot sizing)
    function countCityVisits(routes) {
        const visits = {};
        routes.forEach(r => {
            visits[r.origin] = (visits[r.origin] || 0) + 1;
            visits[r.destination] = (visits[r.destination] || 0) + 1;
        });
        return visits;
    }

    // Collapse directional legs into unique undirected edges with metadata:
    // { source, target, count, planned, airlineCounts, dominantAirline }
    function uniqueEdges(routes) {
        const edges = {};
        routes.forEach(r => {
            const k = routeKey(r.origin, r.destination);
            if (!edges[k]) {
                const [a, b] = [r.origin, r.destination].sort();
                edges[k] = { key: k, source: a, target: b, count: 0, planned: true, airlineCounts: {} };
            }
            const e = edges[k];
            e.count += 1;
            if (!r.planned) e.planned = false; // any completed leg => edge is completed
            if (r.airline) e.airlineCounts[r.airline] = (e.airlineCounts[r.airline] || 0) + 1;
        });
        // resolve dominant airline per edge
        Object.values(edges).forEach(e => {
            let best = null, bestN = -1;
            for (const [air, n] of Object.entries(e.airlineCounts)) {
                if (n > bestN) { best = air; bestN = n; }
            }
            e.dominantAirline = best;
        });
        return Object.values(edges);
    }

    // Match earth.js filterFlightData (year + airline are the active filters)
    function filterRoutes(routes, filters) {
        return routes.filter(r => {
            const yearMatch = !filters.years.length ||
                filters.years.map(Number).includes(Number(r.year));
            const airlineMatch = !filters.airlines.length ||
                filters.airlines.includes(r.airline);
            return yearMatch && airlineMatch;
        });
    }

    function getSelectedValues(id) {
        const el = document.getElementById(id);
        if (!el) return [];
        return Array.from(el.selectedOptions).map(o => o.value);
    }

    function readFilters() {
        return {
            years: getSelectedValues('year-filter'),
            airlines: getSelectedValues('airline-filter')
        };
    }

    // Populate the year + airline multiselects from the full dataset
    function populateFilters(routes) {
        const fill = (id, values) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.innerHTML = '';
            values.forEach(v => {
                const opt = document.createElement('option');
                opt.value = v;
                opt.textContent = v;
                el.appendChild(opt);
            });
        };
        const years = [...new Set(routes.map(r => r.year))]
            .filter(v => v !== undefined && v !== null)
            .sort((a, b) => Number(b) - Number(a));
        const airlines = [...new Set(routes.map(r => r.airline))]
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b));
        fill('year-filter', years);
        fill('airline-filter', airlines);
    }

    // Wire Apply / Reset / collapse-toggle. `onChange(filteredRoutes)` is called
    // with the filtered dataset whenever filters are applied or reset.
    function wireFilterHandlers(routes, onChange) {
        const apply = document.getElementById('apply-filters');
        const reset = document.getElementById('reset-filters');
        const toggle = document.getElementById('toggle-filters');
        const panel = document.getElementById('filter-panel');

        if (toggle && panel) {
            toggle.addEventListener('click', () => panel.classList.toggle('collapsed'));
        }
        if (apply) {
            apply.addEventListener('click', () => onChange(filterRoutes(routes, readFilters())));
        }
        if (reset) {
            reset.addEventListener('click', () => {
                ['year-filter', 'airline-filter'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.selectedIndex = -1;
                });
                onChange(routes);
            });
        }
    }

    // Render a compact airline legend into a container element
    function renderLegend(container, routes, colorMap) {
        if (!container) return;
        const airlines = [...new Set(routes.map(r => r.airline))].filter(Boolean)
            .sort((a, b) => a.localeCompare(b));
        container.innerHTML = '';
        airlines.forEach(a => {
            const row = document.createElement('div');
            row.className = 'fv-legend-row';
            row.innerHTML = `<span class="fv-legend-swatch" style="background:${colorFor(a, colorMap)}"></span>` +
                `<span class="fv-legend-label">${a}</span>`;
            container.appendChild(row);
        });
    }

    return {
        BASE_COLORS, DEFAULT_COLOR,
        airlineColorMap, colorFor, locationIndex,
        routeKey, countFrequencies, countCityVisits, uniqueEdges,
        filterRoutes, readFilters, populateFilters, wireFilterHandlers,
        renderLegend
    };
})();

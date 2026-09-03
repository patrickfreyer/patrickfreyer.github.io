// 2D dark vector world map of flight routes.
// Depends on: d3 v7, topojson-client v3, FV (flight-views-common.js),
// and globals `flightRoutesData`, `locationsData` set by the host page.

(function () {
    const container = document.getElementById('map-container');
    if (!container || typeof d3 === 'undefined') {
        console.error('flight-map: missing container or d3');
        return;
    }

    // Data is declared as top-level `const` by the host page, which creates a
    // global lexical binding (not a window property) — read the bare globals.
    const routesAll = (typeof flightRoutesData !== 'undefined') ? flightRoutesData : [];
    const locList = (typeof locationsData !== 'undefined') ? locationsData : [];
    const locIdx = FV.locationIndex(locList);
    const colorMap = FV.airlineColorMap(routesAll);

    FV.populateFilters(routesAll);
    FV.renderLegend(document.getElementById('legend-content'), routesAll, colorMap);

    // ---- SVG scaffold -------------------------------------------------------
    const svg = d3.select(container).append('svg')
        .attr('width', '100%')
        .attr('height', '100%');

    const defs = svg.append('defs');
    const glow = defs.append('filter').attr('id', 'route-glow')
        .attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%');
    glow.append('feGaussianBlur').attr('stdDeviation', '2.2').attr('result', 'blur');
    const merge = glow.append('feMerge');
    merge.append('feMergeNode').attr('in', 'blur');
    merge.append('feMergeNode').attr('in', 'SourceGraphic');

    const zoomLayer = svg.append('g');                 // pans/zooms
    const gSphere = zoomLayer.append('g');
    const gGraticule = zoomLayer.append('g');
    const gCountries = zoomLayer.append('g');
    const gRoutes = zoomLayer.append('g').attr('filter', 'url(#route-glow)');
    const gCities = zoomLayer.append('g');
    const gLabels = zoomLayer.append('g');

    const projection = d3.geoNaturalEarth1();
    const path = d3.geoPath(projection);
    const graticule = d3.geoGraticule10();

    // Tooltip
    const tip = d3.select(container).append('div').attr('class', 'fv-tooltip');

    let world = null;

    function size() {
        const r = container.getBoundingClientRect();
        return { w: r.width, h: r.height };
    }

    function fitProjection() {
        const { w, h } = size();
        projection.fitExtent([[10, 10], [w - 10, h - 10]], { type: 'Sphere' });
    }

    function drawBasemap() {
        gSphere.selectAll('path').data([{ type: 'Sphere' }]).join('path')
            .attr('class', 'map-sphere').attr('d', path);
        gGraticule.selectAll('path').data([graticule]).join('path')
            .attr('class', 'map-graticule').attr('d', path);
        if (world) {
            const countries = topojson.feature(world, world.objects.countries).features;
            gCountries.selectAll('path').data(countries).join('path')
                .attr('class', 'map-country').attr('d', path);
        }
    }

    // ---- Routes + cities ----------------------------------------------------
    function strokeWidth(count) {
        return Math.min(0.7 + count * 0.55, 5);      // clamp like the globe (max ~10 lines)
    }
    function cityRadius(visits) {
        return Math.min(2.2 + Math.sqrt(visits) * 1.5, 11);
    }

    function render(routes) {
        const edges = FV.uniqueEdges(routes)
            .filter(e => locIdx[e.source] && locIdx[e.target]);
        const visits = FV.countCityVisits(routes);

        // Routes as great-circle LineStrings (d3 densifies along geodesics)
        gRoutes.selectAll('path.route')
            .data(edges, d => d.key)
            .join('path')
            .attr('class', 'route')
            .attr('fill', 'none')
            .attr('stroke', d => FV.colorFor(d.dominantAirline, colorMap))
            .attr('stroke-width', d => strokeWidth(d.count))
            .attr('stroke-linecap', 'round')
            .attr('stroke-opacity', d => d.planned ? 0.55 : 0.85)
            .attr('stroke-dasharray', d => d.planned ? '4 5' : null)
            .attr('d', d => path({
                type: 'LineString',
                coordinates: [
                    [locIdx[d.source].lon, locIdx[d.source].lat],
                    [locIdx[d.target].lon, locIdx[d.target].lat]
                ]
            }))
            .on('mousemove', (ev, d) => showTip(ev,
                `<strong>${d.source} ↔ ${d.target}</strong>` +
                `<br>${d.count}× flown${d.planned ? ' · planned' : ''}` +
                `<br><span class="fv-tip-sub">${d.dominantAirline || '—'}</span>`))
            .on('mouseleave', hideTip);

        // City dots
        const cities = Object.keys(visits).filter(c => locIdx[c]);
        gCities.selectAll('circle.city')
            .data(cities, d => d)
            .join('circle')
            .attr('class', 'city')
            .attr('r', d => cityRadius(visits[d]))
            .attr('cx', d => projection([locIdx[d].lon, locIdx[d].lat])[0])
            .attr('cy', d => projection([locIdx[d].lon, locIdx[d].lat])[1])
            .on('mousemove', (ev, d) => showTip(ev,
                `<strong>${d}</strong><br>${visits[d]} flights`))
            .on('mouseleave', hideTip);

        // Labels only for well-visited hubs to avoid clutter
        const maxVisits = d3.max(Object.values(visits)) || 1;
        const hubThreshold = Math.max(6, maxVisits * 0.18);
        const hubs = cities.filter(c => visits[c] >= hubThreshold);
        gLabels.selectAll('text.city-label')
            .data(hubs, d => d)
            .join('text')
            .attr('class', 'city-label')
            .attr('x', d => projection([locIdx[d].lon, locIdx[d].lat])[0] + 6)
            .attr('y', d => projection([locIdx[d].lon, locIdx[d].lat])[1] + 3)
            .text(d => d);
    }

    function showTip(ev, html) {
        const r = container.getBoundingClientRect();
        tip.html(html).style('opacity', 1)
            .style('left', (ev.clientX - r.left + 14) + 'px')
            .style('top', (ev.clientY - r.top + 14) + 'px');
    }
    function hideTip() { tip.style('opacity', 0); }

    // ---- Zoom / pan ---------------------------------------------------------
    const zoom = d3.zoom().scaleExtent([1, 12]).on('zoom', (ev) => {
        zoomLayer.attr('transform', ev.transform);
        // keep strokes/dots crisp as you zoom in
        gRoutes.selectAll('path.route').attr('stroke-width', d => strokeWidth(d.count) / ev.transform.k);
        gCities.selectAll('circle.city').attr('r', d => cityRadius(FV.countCityVisits(currentRoutes)[d]) / Math.sqrt(ev.transform.k));
        gLabels.attr('font-size', (12 / ev.transform.k) + 'px');
        gCountries.attr('stroke-width', 0.5 / ev.transform.k);
    });
    svg.call(zoom);

    let currentRoutes = routesAll;
    function update(routes) { currentRoutes = routes; render(routes); }

    function redraw() {
        const { w, h } = size();
        svg.attr('viewBox', `0 0 ${w} ${h}`);
        fitProjection();
        drawBasemap();
        update(currentRoutes);
    }

    // ---- Boot ---------------------------------------------------------------
    d3.json((window.baseURL || '') + '/assets/data/countries-110m.json')
        .then(topo => { world = topo; redraw(); })
        .catch(err => { console.warn('world map failed to load, drawing routes only', err); redraw(); });

    FV.wireFilterHandlers(routesAll, update);
    window.addEventListener('resize', () => { redraw(); });
    document.getElementById('reset-view')?.addEventListener('click', () => {
        svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity);
    });
})();

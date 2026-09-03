// Force-directed network graph of flight routes.
// Nodes = cities (size = # flights touching the city),
// edges = unique city-pairs (thickness = times flown, color = dominant airline).
// Depends on: d3 v7, FV (flight-views-common.js), and globals
// `flightRoutesData`, `locationsData`.

(function () {
    const container = document.getElementById('network-container');
    if (!container || typeof d3 === 'undefined') {
        console.error('flight-network: missing container or d3');
        return;
    }

    // Data is declared as top-level `const` by the host page, which creates a
    // global lexical binding (not a window property) — read the bare globals.
    const routesAll = (typeof flightRoutesData !== 'undefined') ? flightRoutesData : [];
    const colorMap = FV.airlineColorMap(routesAll);

    FV.populateFilters(routesAll);
    FV.renderLegend(document.getElementById('legend-content'), routesAll, colorMap);

    const svg = d3.select(container).append('svg')
        .attr('width', '100%').attr('height', '100%');
    const zoomLayer = svg.append('g');
    const gLinks = zoomLayer.append('g');
    const gNodes = zoomLayer.append('g');
    const gLabels = zoomLayer.append('g');

    const tip = d3.select(container).append('div').attr('class', 'fv-tooltip');

    function size() {
        const r = container.getBoundingClientRect();
        return { w: r.width, h: r.height };
    }

    const nodeRadius = v => Math.min(4 + Math.sqrt(v) * 2.4, 26);
    const linkWidth = c => Math.min(0.8 + c * 0.7, 7);

    let simulation = null;
    let currentRoutes = routesAll;

    // Preserve node positions across filter changes so the graph doesn't jump
    const posCache = {};

    function buildGraph(routes) {
        const visits = FV.countCityVisits(routes);
        const edges = FV.uniqueEdges(routes);
        const nodes = Object.keys(visits).map(name => ({
            id: name,
            visits: visits[name],
            x: posCache[name]?.x,
            y: posCache[name]?.y
        }));
        const links = edges.map(e => ({
            source: e.source, target: e.target,
            count: e.count, planned: e.planned, airline: e.dominantAirline
        }));
        return { nodes, links };
    }

    function render(routes) {
        currentRoutes = routes;
        const { w, h } = size();
        const { nodes, links } = buildGraph(routes);

        const link = gLinks.selectAll('line').data(links, d =>
            [d.source, d.target].sort ? [d.source.id || d.source, d.target.id || d.target].sort().join('|') : '')
            .join('line')
            .attr('stroke', d => FV.colorFor(d.airline, colorMap))
            .attr('stroke-width', d => linkWidth(d.count))
            .attr('stroke-opacity', d => d.planned ? 0.35 : 0.6)
            .attr('stroke-dasharray', d => d.planned ? '4 5' : null)
            .style('cursor', 'pointer')
            .on('mousemove', (ev, d) => showTip(ev,
                `<strong>${d.source.id || d.source} ↔ ${d.target.id || d.target}</strong>` +
                `<br>${d.count}× flown${d.planned ? ' · planned' : ''}` +
                `<br><span class="fv-tip-sub">${d.airline || '—'}</span>`))
            .on('mouseleave', hideTip);

        const node = gNodes.selectAll('circle').data(nodes, d => d.id)
            .join('circle')
            .attr('r', d => nodeRadius(d.visits))
            .attr('fill', '#0b1220')
            .attr('stroke', '#7aa2ff')
            .attr('stroke-width', 1.4)
            .style('cursor', 'grab')
            .on('mousemove', (ev, d) => showTip(ev,
                `<strong>${d.id}</strong><br>${d.visits} flights`))
            .on('mouseleave', hideTip)
            .call(d3.drag()
                .on('start', dragstart)
                .on('drag', dragged)
                .on('end', dragend));

        // Label only the bigger hubs
        const maxV = d3.max(nodes, n => n.visits) || 1;
        const labelThreshold = Math.max(6, maxV * 0.16);
        const label = gLabels.selectAll('text').data(
            nodes.filter(n => n.visits >= labelThreshold), d => d.id)
            .join('text')
            .attr('class', 'net-label')
            .text(d => d.id);

        if (simulation) simulation.stop();
        simulation = d3.forceSimulation(nodes)
            .force('link', d3.forceLink(links).id(d => d.id)
                .distance(d => 40 + 60 / Math.sqrt(d.count))
                .strength(0.25))
            .force('charge', d3.forceManyBody().strength(-180))
            .force('center', d3.forceCenter(w / 2, h / 2))
            .force('collide', d3.forceCollide().radius(d => nodeRadius(d.visits) + 4))
            .on('tick', () => {
                link.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
                    .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
                node.attr('cx', d => d.x).attr('cy', d => d.y);
                label.attr('x', d => d.x + nodeRadius(d.visits) + 3).attr('y', d => d.y + 4);
                nodes.forEach(n => { posCache[n.id] = { x: n.x, y: n.y }; });
            });
    }

    function dragstart(ev, d) {
        if (!ev.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x; d.fy = d.y;
    }
    function dragged(ev, d) { d.fx = ev.x; d.fy = ev.y; }
    function dragend(ev, d) {
        if (!ev.active) simulation.alphaTarget(0);
        d.fx = null; d.fy = null;
    }

    function showTip(ev, html) {
        const r = container.getBoundingClientRect();
        tip.html(html).style('opacity', 1)
            .style('left', (ev.clientX - r.left + 14) + 'px')
            .style('top', (ev.clientY - r.top + 14) + 'px');
    }
    function hideTip() { tip.style('opacity', 0); }

    const zoom = d3.zoom().scaleExtent([0.2, 8]).on('zoom', ev => {
        zoomLayer.attr('transform', ev.transform);
    });
    svg.call(zoom);

    render(routesAll);
    FV.wireFilterHandlers(routesAll, render);
    window.addEventListener('resize', () => {
        if (simulation) {
            const { w, h } = size();
            simulation.force('center', d3.forceCenter(w / 2, h / 2));
            simulation.alpha(0.3).restart();
        }
    });
    document.getElementById('reset-view')?.addEventListener('click', () => {
        svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity);
        for (const k in posCache) delete posCache[k];
        render(currentRoutes);
    });
})();

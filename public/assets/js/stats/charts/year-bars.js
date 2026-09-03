/* ==========================================================================
   Distance and legs per year.

   Data: FlightMetrics.byYear(legs) -> [{ year, km, flights }]

   Dual encoding: bars carry distance (left scale), a dot-and-line overlay
   carries leg count (right scale). Two scales are a real readability risk, so
   each axis is tinted to its own series, both are unit-labelled, a legend is
   always present, and the peak year is direct-labelled — identity never rests
   on color alone.

   Years with no flights are kept as empty slots on the x axis so the gap
   years in 2000-2026 stay visible; the leg line breaks across them rather
   than interpolating through.
   ========================================================================== */

window.StatsCharts = window.StatsCharts || {};

window.StatsCharts.yearBars = (function () {
    'use strict';

    function token(name, fallback) {
        var v = getComputedStyle(document.documentElement)
            .getPropertyValue(name).trim();
        return v || fallback;
    }

    function reduceMotion() {
        return window.matchMedia &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    function uid(p) { return p + '-' + Math.random().toString(36).slice(2, 9); }

    function fmtInt(n) { return Math.round(n).toLocaleString('en-US'); }

    function fmtCompact(n) {
        if (n >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M';
        if (n >= 1e4) return Math.round(n / 1e3) + 'k';
        if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
        return String(Math.round(n));
    }

    // Number formatting comes from window.FlightFormat when the page provides
    // it (stats-page.js passes it as opts.format), so figures here match the
    // KPI tiles exactly. opts.formatKm overrides; the local fallback keeps the
    // module standalone.
    function kmFormatter(opts) {
        if (typeof opts.formatKm === 'function') return opts.formatKm;
        var F = opts.format || window.FlightFormat;
        if (F && typeof F.formatKm === 'function') {
            return function (n) { return F.formatKm(n); };
        }
        return function (n) { return fmtInt(n) + ' km'; };
    }

    function compactFormatter(opts) {
        var F = opts.format || window.FlightFormat;
        if (F && typeof F.formatCompact === 'function') return F.formatCompact;
        return fmtCompact;
    }

    function getTip(container) {
        var tip = container.__statsTip;
        if (!tip || !tip.isConnected) {
            tip = document.createElement('div');
            tip.className = 'stats-tooltip';
            tip.setAttribute('role', 'status');
            document.body.appendChild(tip);
            container.__statsTip = tip;
        }
        return tip;
    }

    function showTip(tip, html, event) {
        tip.innerHTML = html;
        tip.style.opacity = '1';
        var r = tip.getBoundingClientRect();
        var pad = 10;
        var left = Math.min(Math.max(pad, event.clientX - r.width / 2),
            window.innerWidth - r.width - pad);
        var top = event.clientY - r.height - 16;
        if (top < pad) top = event.clientY + 20;
        tip.style.left = left + 'px';
        tip.style.top = top + 'px';
    }

    function hideTip(tip) { if (tip) tip.style.opacity = '0'; }

    function autoResize(container, redraw) {
        container.__statsRedraw = redraw;
        if (container.__statsRO || typeof ResizeObserver === 'undefined') return;
        var last = container.clientWidth;
        var ro = new ResizeObserver(function () {
            var w = container.clientWidth;
            if (!w || Math.abs(w - last) < 10) return;
            last = w;
            if (container.__statsRedraw) container.__statsRedraw();
        });
        ro.observe(container);
        container.__statsRO = ro;
    }

    // Top-rounded bar anchored to the baseline.
    function barPath(bx, by, bw, bh, r) {
        r = Math.max(0, Math.min(r, bw / 2, bh));
        if (bh <= 0.6) return 'M' + bx + ',' + (by + bh) + 'h' + bw;   // hairline for ~0 km
        return 'M' + bx + ',' + (by + bh) +
            'V' + (by + r) +
            'a' + r + ',' + r + ' 0 0 1 ' + r + ',' + -r +
            'H' + (bx + bw - r) +
            'a' + r + ',' + r + ' 0 0 1 ' + r + ',' + r +
            'V' + (by + bh) + 'Z';
    }

    function legendRow(items) {
        var el = document.createElement('div');
        el.className = 'stats-legend';
        items.forEach(function (it) {
            var row = document.createElement('div');
            row.className = 'stats-legend-item';
            var sw = document.createElement('span');
            sw.className = 'stats-legend-swatch';
            sw.style.background = it.color;
            if (it.round) sw.style.borderRadius = '50%';
            var label = document.createElement('span');
            label.textContent = it.label;
            row.appendChild(sw);
            row.appendChild(label);
            el.appendChild(row);
        });
        return el;
    }

    function render(container, data, opts) {
        if (!container) return;
        opts = opts || {};
        var tip = getTip(container);
        hideTip(tip);
        container.innerHTML = '';

        var rows = (data || []).filter(function (d) { return d && isFinite(d.year); })
            .slice().sort(function (a, b) { return a.year - b.year; });

        if (!rows.length) {
            container.innerHTML = '<div class="panel-placeholder">No yearly data.</div>';
            return;
        }

        autoResize(container, function () { render(container, data, opts); });

        var fmtKm = kmFormatter(opts);
        var short = compactFormatter(opts);

        // Continuous year axis, so gap years read as gaps.
        var y0 = rows[0].year, y1 = rows[rows.length - 1].year;
        var byYear = {};
        rows.forEach(function (d) { byYear[d.year] = d; });
        var slots = [];
        for (var yr = y0; yr <= y1; yr++) {
            var d = byYear[yr];
            slots.push({ year: yr, km: d ? d.km : 0, flights: d ? d.flights : 0, has: !!d });
        }

        var peak = rows.reduce(function (a, b) { return b.km > a.km ? b : a; }, rows[0]);

        /* ---------- geometry ---------- */

        var W = Math.max(300, container.clientWidth || opts.width || 720);
        var narrow = W < 560;
        var H = Math.round(Math.min(390, Math.max(258, W * 0.40)));
        var m = {
            top: narrow ? 24 : 28,
            right: narrow ? 26 : 42,
            bottom: narrow ? 26 : 30,
            left: narrow ? 38 : 52
        };
        var iw = W - m.left - m.right;
        var ih = H - m.top - m.bottom;

        var C = {
            text: token('--text', '#e5e7eb'),
            dim: token('--text-dim', '#94a3b8'),
            faint: token('--text-faint', '#64748b'),
            grid: token('--grid-line', 'rgba(255,255,255,0.06)'),
            border: token('--border', 'rgba(255,255,255,0.08)'),
            a: token('--accent-a', '#667eea'),
            b: token('--accent-b', '#764ba2')
        };
        var aBright = d3.color(C.a).brighter(0.5).formatHex();
        var bBright = d3.color(C.b).brighter(1.45).formatHex();

        var x = d3.scaleBand()
            .domain(slots.map(function (d) { return d.year; }))
            .range([0, iw])
            .paddingInner(0.3)
            .paddingOuter(0.24);

        // Headroom above the tallest bar is deliberate: the peak-year callout
        // lives inside the plot, pinned to the top, and must never sit on a mark.
        var yKm = d3.scaleLinear()
            .domain([0, d3.max(slots, function (d) { return d.km; }) * (narrow ? 1.36 : 1.26)]).nice()
            .range([ih, 0]);

        var yFl = d3.scaleLinear()
            .domain([0, d3.max(slots, function (d) { return d.flights; }) * 1.18]).nice()
            .range([ih, 0]);

        var ids = { bar: uid('yb-bar'), peak: uid('yb-peak') };

        var svg = d3.select(container).append('svg')
            .attr('viewBox', '0 0 ' + W + ' ' + H)
            .attr('preserveAspectRatio', 'xMidYMid meet')
            .attr('width', '100%')
            .style('height', 'auto')
            .attr('role', 'img')
            .attr('aria-label',
                'Distance and number of legs flown each year from ' + y0 + ' to ' + y1 +
                '. Busiest year ' + peak.year + ' with ' + fmtInt(peak.km) +
                ' kilometres across ' + peak.flights + ' legs.');

        svg.append('title').text('Distance and legs per year, ' + y0 + '-' + y1);

        var defs = svg.append('defs');
        [[ids.bar, C.a, 0.95, 0.42], [ids.peak, aBright, 1, 0.6]].forEach(function (spec) {
            var gr = defs.append('linearGradient')
                .attr('id', spec[0])
                .attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 1);
            gr.append('stop').attr('offset', '0%')
                .attr('stop-color', spec[1]).attr('stop-opacity', spec[2]);
            gr.append('stop').attr('offset', '100%')
                .attr('stop-color', C.b).attr('stop-opacity', spec[3]);
        });

        var g = svg.append('g').attr('transform', 'translate(' + m.left + ',' + m.top + ')');

        /* ---------- left (km) grid + axis ---------- */

        var kmTicks = yKm.ticks(narrow ? 3 : 4);
        g.append('g').selectAll('line').data(kmTicks).enter().append('line')
            .attr('x1', 0).attr('x2', iw)
            .attr('y1', function (d) { return yKm(d); })
            .attr('y2', function (d) { return yKm(d); })
            .attr('stroke', C.grid).attr('stroke-width', 1);

        g.append('g').selectAll('text').data(kmTicks).enter().append('text')
            .attr('x', -9)
            .attr('y', function (d) { return yKm(d); })
            .attr('dy', '0.32em')
            .attr('text-anchor', 'end')
            .attr('fill', C.faint)
            .attr('font-size', narrow ? 9.5 : 10.5)
            .style('font-variant-numeric', 'tabular-nums')
            .text(function (d) { return d === 0 ? '0' : short(d); });

        // Axis titles sit outside the plot when there is margin for them and
        // inside the top-left / top-right corners when there is not, so
        // neither ever clips.
        g.append('text')
            .attr('x', narrow ? 0 : -9).attr('y', -14)
            .attr('text-anchor', narrow ? 'start' : 'end')
            .attr('fill', aBright).attr('font-size', narrow ? 9 : 10)
            .attr('letter-spacing', '0.08em')
            .text('KM');

        /* ---------- right (legs) axis ---------- */

        var flTicks = yFl.ticks(narrow ? 3 : 4);
        g.append('g').selectAll('text').data(flTicks).enter().append('text')
            .attr('x', iw + 9)
            .attr('y', function (d) { return yFl(d); })
            .attr('dy', '0.32em')
            .attr('text-anchor', 'start')
            .attr('fill', bBright)
            .attr('opacity', 0.85)
            .attr('font-size', narrow ? 9.5 : 10.5)
            .style('font-variant-numeric', 'tabular-nums')
            .text(function (d) { return d; });

        g.append('text')
            .attr('x', narrow ? iw : iw + 9).attr('y', -14)
            .attr('text-anchor', narrow ? 'end' : 'start')
            .attr('fill', bBright).attr('font-size', narrow ? 9 : 10)
            .attr('letter-spacing', '0.08em')
            .text('LEGS');

        /* ---------- x baseline + year labels ---------- */

        g.append('line')
            .attr('x1', 0).attr('x2', iw).attr('y1', ih).attr('y2', ih)
            .attr('stroke', C.border).attr('stroke-width', 1);

        // Label the peak year and the last year first, then fill in evenly
        // spaced years only where they clear everything already placed —
        // otherwise the forced labels collide with the regular ones.
        var minGap = narrow ? 26 : 42;
        var placed = [];
        var tryPlace = function (d) {
            var px = x(d.year) + x.bandwidth() / 2;
            for (var i = 0; i < placed.length; i++) {
                if (Math.abs(placed[i].px - px) < minGap) return;
            }
            placed.push({ px: px, d: d });
        };
        slots.forEach(function (d) { if (d.year === peak.year) tryPlace(d); });
        tryPlace(slots[slots.length - 1]);
        var stride = Math.max(1, Math.round(minGap / x.step()));
        for (var si = 0; si < slots.length; si += stride) tryPlace(slots[si]);

        g.append('g').attr('transform', 'translate(0,' + ih + ')')
            .selectAll('text')
            .data(placed.map(function (p) { return p.d; }))
            .enter().append('text')
            .attr('x', function (d) { return x(d.year) + x.bandwidth() / 2; })
            .attr('y', 16)
            .attr('text-anchor', 'middle')
            .attr('fill', function (d) { return d.year === peak.year ? C.text : C.faint; })
            .attr('font-size', narrow ? 9.5 : 10.5)
            .attr('font-weight', function (d) { return d.year === peak.year ? 600 : 400; })
            .style('font-variant-numeric', 'tabular-nums')
            .text(function (d) { return narrow ? "'" + String(d.year).slice(2) : d.year; });

        /* ---------- bars ---------- */

        var bw = x.bandwidth();
        var bars = g.append('g').selectAll('path')
            .data(slots.filter(function (d) { return d.has; }))
            .enter().append('path')
            .attr('class', 'yb-bar')
            .attr('fill', function (d) {
                return 'url(#' + (d.year === peak.year ? ids.peak : ids.bar) + ')';
            })
            .attr('stroke', function (d) { return d.year === peak.year ? aBright : 'none'; })
            .attr('stroke-width', function (d) { return d.year === peak.year ? 1 : 0; })
            .attr('stroke-opacity', 0.55)
            .attr('d', function (d) {
                var top = yKm(d.km);
                return barPath(x(d.year), top, bw, ih - top, 4);
            });

        /* ---------- legs overlay (line + dots), broken across gap years ---------- */

        var cx = function (d) { return x(d.year) + bw / 2; };
        var flLine = d3.line()
            .defined(function (d) { return d.has; })
            .x(cx)
            .y(function (d) { return yFl(d.flights); })
            .curve(d3.curveMonotoneX);

        var flPath = g.append('path')
            .datum(slots)
            .attr('d', flLine)
            .attr('fill', 'none')
            .attr('stroke', bBright)
            .attr('stroke-width', 2)
            .attr('stroke-linecap', 'round')
            .attr('opacity', 0.9);

        var dotR = Math.max(3, Math.min(4.5, bw * 0.28));
        var dots = g.append('g').selectAll('circle')
            .data(slots.filter(function (d) { return d.has; }))
            .enter().append('circle')
            .attr('cx', cx)
            .attr('cy', function (d) { return yFl(d.flights); })
            .attr('r', dotR)
            .attr('fill', bBright)
            .attr('stroke', token('--bg', '#0a0e1a'))   // 2px surface ring
            .attr('stroke-width', 2);

        /* ---------- peak-year direct label ---------- */

        var peakX = cx({ year: peak.year });
        var peakTop = yKm(peak.km);
        var labelY = narrow ? 9 : 11;
        var lineH = narrow ? 12 : 14;

        // Estimated half-width of the wider of the two label lines, used only
        // to keep it off the plot edges.
        var halfW = (short(peak.km) + ' km · ' + peak.flights + ' legs').length *
            (narrow ? 4.6 : 5.1) / 2;
        var anchor = 'middle', lx = peakX;
        if (peakX - halfW < 0) { anchor = 'start'; lx = 0; }
        else if (peakX + halfW > iw) { anchor = 'end'; lx = iw; }

        var callout = g.append('g').attr('class', 'yb-callout');
        var leaderTop = labelY + lineH + 6;
        if (peakTop - 6 > leaderTop) {
            callout.append('line')
                .attr('x1', peakX).attr('x2', peakX)
                .attr('y1', peakTop - 5).attr('y2', leaderTop)
                .attr('stroke', aBright).attr('stroke-width', 1).attr('opacity', 0.45);
        }
        var ct = callout.append('text')
            .attr('x', lx).attr('y', labelY)
            .attr('text-anchor', anchor)
            .attr('fill', C.text)
            .attr('font-size', narrow ? 10.5 : 12)
            .attr('font-weight', 600)
            .style('font-variant-numeric', 'tabular-nums')
            .text(peak.year + ' peak');
        ct.append('tspan')
            .attr('x', lx).attr('dy', lineH)
            .attr('fill', C.dim).attr('font-size', narrow ? 9.5 : 10.5).attr('font-weight', 400)
            .text(short(peak.km) + ' km · ' + peak.flights + ' legs');

        /* ---------- hover: full-height hit slot per year ---------- */

        var hover = g.append('g');
        slots.forEach(function (d) {
            hover.append('rect')
                .attr('x', x(d.year) - x.step() * x.paddingInner() / 2)
                .attr('y', 0)
                .attr('width', x.step())
                .attr('height', ih)
                .attr('fill', 'transparent')
                .style('cursor', d.has ? 'pointer' : 'default')
                .on('mouseenter mousemove touchstart', function (event) {
                    bars.attr('opacity', function (b) { return b.year === d.year ? 1 : 0.42; });
                    dots.attr('opacity', function (b) { return b.year === d.year ? 1 : 0.4; });
                    flPath.attr('opacity', 0.35);
                    showTip(tip,
                        '<div style="font-weight:600">' + d.year +
                        (d.year === peak.year ? ' <span style="color:' + aBright + '">· peak</span>' : '') +
                        '</div>' +
                        (d.has
                            ? '<div style="color:' + C.dim + '">' + fmtKm(d.km) + '</div>' +
                              '<div style="color:' + C.dim + '">' + d.flights +
                              (d.flights === 1 ? ' leg' : ' legs') + '</div>'
                            : '<div style="color:' + C.faint + '">no flights</div>'),
                        event.touches ? event.touches[0] : event);
                })
                .on('mouseleave touchend', function () {
                    bars.attr('opacity', 1);
                    dots.attr('opacity', 1);
                    flPath.attr('opacity', 0.9);
                    hideTip(tip);
                });
        });

        /* ---------- legend ---------- */

        container.appendChild(legendRow([
            { color: 'linear-gradient(180deg,' + C.a + ',' + C.b + ')', label: 'Distance (km, left)' },
            { color: bBright, label: 'Legs flown (right)', round: true }
        ]));

        /* ---------- entrance ---------- */

        if (!reduceMotion()) {
            bars.attr('d', function (d) { return barPath(x(d.year), ih, bw, 0, 4); })
                .transition().duration(720).delay(function (d, i) { return i * 18; })
                .ease(d3.easeCubicOut)
                .attr('d', function (d) {
                    var top = yKm(d.km);
                    return barPath(x(d.year), top, bw, ih - top, 4);
                });
            flPath.attr('opacity', 0).transition().delay(420).duration(600).attr('opacity', 0.9);
            dots.attr('opacity', 0).transition().delay(520).duration(500).attr('opacity', 1);
            callout.attr('opacity', 0).transition().delay(760).duration(400).attr('opacity', 1);
        }
    }

    return { render: render };
})();

// Alias so the orchestrator can reach it by either naming convention.
window.StatsCharts['year-bars'] = window.StatsCharts.yearBars;


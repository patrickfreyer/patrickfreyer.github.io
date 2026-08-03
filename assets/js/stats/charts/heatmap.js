/* ==========================================================================
   Month x year travel-intensity heatmap.

   Data: FlightMetrics.monthYearMatrix(legs)
         -> [{ year, monthIndex, km, flights }]
   That metric returns a DENSE grid (every month of every year in the span,
   empty ones as km 0 / flights 0), so a cell counts as flown only when
   flights > 0. A sparse array of only-flown cells renders identically.
   monthIndex is always 0-11: the 12 legs with an unknown month are excluded
   upstream and must NOT be bucketed into January.

   Three cell states, deliberately distinguishable without color alone:
     no data   -> unfilled, hairline outline
     0 km      -> lowest ramp step + a center dot (a flight happened, no
                  distance: the self-flown Seattle loop)
     km > 0    -> single-hue sequential ramp

   opts.fillGapYears (default true) keeps rows for years with no flights at
   all, so the gaps in the 2000-2026 span stay visible instead of collapsing.
   opts.note renders a footnote (e.g. the unknown-month exclusion).
   ========================================================================== */

window.StatsCharts = window.StatsCharts || {};

window.StatsCharts.heatmap = (function () {
    'use strict';

    var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
        'August', 'September', 'October', 'November', 'December'];
    var M3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var M2 = ['Ja', 'Fe', 'Mr', 'Ap', 'My', 'Jn', 'Jl', 'Au', 'Se', 'Oc', 'No', 'De'];
    var M1 = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

    function token(name, fallback) {
        var v = getComputedStyle(document.documentElement)
            .getPropertyValue(name).trim();
        return v || fallback;
    }

    function reduceMotion() {
        return window.matchMedia &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    function fmtInt(n) { return Math.round(n).toLocaleString('en-US'); }

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

    function render(container, data, opts) {
        if (!container) return;
        opts = opts || {};
        var tip = getTip(container);
        hideTip(tip);
        container.innerHTML = '';

        // FlightMetrics.monthYearMatrix hands back a DENSE grid: every month of
        // every year in the span, with the empty ones as km 0 / flights 0. So
        // "has data" is `flights > 0`, not "the cell exists in the array" —
        // otherwise every empty month would render as a flown 0 km cell and the
        // no-data state would disappear. A sparse array works identically.
        var span = (data || []).filter(function (d) {
            return d && isFinite(d.year) &&
                d.monthIndex !== null && d.monthIndex !== undefined &&
                d.monthIndex >= 0 && d.monthIndex <= 11;
        });
        var cells = span.filter(function (d) { return d.flights > 0 || d.km > 0; });

        if (!cells.length) {
            container.innerHTML = '<div class="panel-placeholder">No monthly data.</div>';
            return;
        }

        autoResize(container, function () { render(container, data, opts); });

        var fmtKm = kmFormatter(opts);
        var fillGaps = opts.fillGapYears !== false;

        var index = {};
        cells.forEach(function (d) { index[d.year + ':' + d.monthIndex] = d; });

        var present = Array.from(new Set(cells.map(function (d) { return d.year; })))
            .sort(function (a, b) { return a - b; });
        // A dense input carries the true year span (including years whose legs
        // all had an unknown month); a sparse one only carries years with data.
        var spanYears = Array.from(new Set(span.map(function (d) { return d.year; })))
            .sort(function (a, b) { return a - b; });

        var years;
        if (opts.years && opts.years.length) {
            // Explicit row list wins.
            years = opts.years.slice().sort(function (a, b) { return a - b; });
        } else if (fillGaps) {
            years = [];
            var lo = Math.min(present[0], spanYears[0]);
            var hi = Math.max(present[present.length - 1], spanYears[spanYears.length - 1]);
            for (var y = lo; y <= hi; y++) years.push(y);
        } else {
            years = present;
        }
        var presentSet = new Set(present);

        var maxKm = d3.max(cells, function (d) { return d.km; }) || 1;
        var busiest = cells.reduce(function (a, b) { return b.flights > a.flights ? b : a; }, cells[0]);
        var farthest = cells.reduce(function (a, b) { return b.km > a.km ? b : a; }, cells[0]);
        var hasZeroKm = cells.some(function (d) { return d.km === 0; });

        /* ---------- geometry ---------- */

        var W = Math.max(300, container.clientWidth || opts.width || 720);
        var narrow = W < 560;
        var rows = years.length;

        var labelW = narrow ? 26 : 36;
        var topH = narrow ? 17 : 20;
        var avail = W - labelW - 4;

        var cellH = Math.max(14, Math.min(22, Math.floor(560 / rows)));
        var cellW = Math.max(14, Math.min(avail / 12, cellH * 3.6));
        var gridW = cellW * 12;
        // Centre the grid, then keep the year labels tight against its left
        // edge instead of stranded at the far left of the svg.
        var offX = labelW + Math.max(0, (avail - gridW) / 2);
        var H = Math.ceil(topH + rows * cellH + 6);

        var C = {
            bg: token('--bg', '#0a0e1a'),
            text: token('--text', '#e5e7eb'),
            dim: token('--text-dim', '#94a3b8'),
            faint: token('--text-faint', '#64748b'),
            a: token('--accent-a', '#667eea'),
            b: token('--accent-b', '#764ba2')
        };

        // Single-hue sequential ramp, dark -> bright, monotone in lightness.
        var low = d3.interpolateRgb(C.bg, C.a)(0.16);
        var mid = d3.interpolateRgb(C.bg, C.a)(0.5);
        var high = d3.color(C.a).brighter(1.05).formatHex();
        var ramp = d3.interpolateRgbBasis([low, mid, C.a, high]);
        // Distance per month is heavily skewed, so compress the top end.
        var t = d3.scalePow().exponent(0.55).domain([0, maxKm]).range([0, 1]).clamp(true);
        var colorFor = function (km) { return ramp(km <= 0 ? 0 : 0.05 + 0.95 * t(km)); };

        var svg = d3.select(container).append('svg')
            .attr('viewBox', '0 0 ' + W + ' ' + H)
            .attr('preserveAspectRatio', 'xMidYMid meet')
            .attr('width', '100%')
            .style('height', 'auto')
            .attr('role', 'img')
            .attr('aria-label',
                'Grid of travel intensity by month and year, ' + years[0] + ' to ' +
                years[rows - 1] + '. Busiest month ' + MONTHS[busiest.monthIndex] + ' ' +
                busiest.year + ' with ' + busiest.flights + ' legs.');

        svg.append('title').text('Travel intensity by month and year');

        /* ---------- month labels ---------- */

        // "J F M A M J J A S O N D" is ambiguous, so only fall back to initials
        // when a two-letter label genuinely will not fit.
        var labels = cellW >= 26 ? M3 : (cellW >= 18 ? M2 : M1);
        svg.append('g').selectAll('text').data(labels).enter().append('text')
            .attr('x', function (d, i) { return offX + i * cellW + cellW / 2; })
            .attr('y', topH - 7)
            .attr('text-anchor', 'middle')
            .attr('fill', C.faint)
            .attr('font-size', narrow ? 9 : 10)
            .attr('letter-spacing', '0.04em')
            .text(function (d) { return d; });

        /* ---------- year labels ---------- */

        svg.append('g').selectAll('text').data(years).enter().append('text')
            .attr('class', 'hm-year')
            .attr('data-year', function (d) { return d; })
            .attr('x', offX - 8)
            .attr('y', function (d, i) { return topH + i * cellH + cellH / 2; })
            .attr('dy', '0.32em')
            .attr('text-anchor', 'end')
            .attr('fill', function (d) { return presentSet.has(d) ? C.faint : 'rgba(100,116,139,0.45)'; })
            .attr('font-size', narrow ? 8.5 : 10)
            .style('font-variant-numeric', 'tabular-nums')
            .text(function (d) { return narrow ? "'" + String(d).slice(2) : d; });

        /* ---------- cells ---------- */

        var grid = [];
        years.forEach(function (yr, ri) {
            for (var mi = 0; mi < 12; mi++) {
                var d = index[yr + ':' + mi];
                grid.push({
                    year: yr, monthIndex: mi, row: ri,
                    km: d ? d.km : null,
                    flights: d ? d.flights : 0,
                    has: !!d
                });
            }
        });

        var pad = cellW > 22 ? 2 : 1.5;
        var rx = Math.min(4, Math.max(2, (cellW - pad) * 0.16));

        var cellG = svg.append('g');
        var rects = cellG.selectAll('rect').data(grid).enter().append('rect')
            .attr('x', function (d) { return offX + d.monthIndex * cellW + pad / 2; })
            .attr('y', function (d) { return topH + d.row * cellH + pad / 2; })
            .attr('width', Math.max(2, cellW - pad))
            .attr('height', Math.max(2, cellH - pad))
            .attr('rx', rx)
            .attr('fill', function (d) { return d.has ? colorFor(d.km) : 'none'; })
            .attr('stroke', function (d) { return d.has ? 'none' : 'rgba(255,255,255,0.055)'; })
            .attr('stroke-width', 1)
            .style('cursor', 'default');

        // Zero-km cells: a flight was logged but covered no distance.
        if (hasZeroKm) {
            cellG.selectAll('circle')
                .data(grid.filter(function (d) { return d.has && d.km === 0; }))
                .enter().append('circle')
                .attr('cx', function (d) { return offX + d.monthIndex * cellW + cellW / 2; })
                .attr('cy', function (d) { return topH + d.row * cellH + cellH / 2; })
                .attr('r', 1.6)
                .attr('fill', C.dim)
                .style('pointer-events', 'none');
        }

        var ring = svg.append('rect')
            .attr('fill', 'none')
            .attr('stroke', C.text)
            .attr('stroke-width', 1.5)
            .attr('rx', rx)
            .attr('opacity', 0)
            .style('pointer-events', 'none');

        rects
            .on('mouseenter mousemove touchstart', function (event, d) {
                ring.attr('x', offX + d.monthIndex * cellW + pad / 2)
                    .attr('y', topH + d.row * cellH + pad / 2)
                    .attr('width', Math.max(2, cellW - pad))
                    .attr('height', Math.max(2, cellH - pad))
                    .attr('opacity', 0.85);
                svg.selectAll('.hm-year')
                    .attr('fill', function (yr) {
                        return yr === d.year ? C.text
                            : (presentSet.has(yr) ? C.faint : 'rgba(100,116,139,0.45)');
                    });
                showTip(tip,
                    '<div style="font-weight:600">' + MONTHS[d.monthIndex] + ' ' + d.year + '</div>' +
                    (d.has
                        ? '<div style="color:' + C.dim + '">' + d.flights +
                          (d.flights === 1 ? ' leg' : ' legs') + ' · ' + fmtKm(d.km) + '</div>'
                        : '<div style="color:' + C.faint + '">no flights</div>'),
                    event.touches ? event.touches[0] : event);
            })
            .on('mouseleave touchend', function () {
                ring.attr('opacity', 0);
                svg.selectAll('.hm-year').attr('fill', function (yr) {
                    return presentSet.has(yr) ? C.faint : 'rgba(100,116,139,0.45)';
                });
                hideTip(tip);
            });

        /* ---------- legend + footnote ---------- */

        var legend = document.createElement('div');
        legend.className = 'stats-legend';
        legend.style.alignItems = 'center';

        var scale = document.createElement('div');
        scale.className = 'stats-legend-item';
        scale.innerHTML =
            '<span style="color:var(--text-faint)">0</span>' +
            '<span style="display:inline-block;width:96px;height:8px;border-radius:4px;' +
            'background:linear-gradient(90deg,' + colorFor(0.0001) + ',' + colorFor(maxKm * 0.35) +
            ',' + colorFor(maxKm) + ')"></span>' +
            '<span>' + fmtKm(maxKm) + ' in a month</span>';
        legend.appendChild(scale);

        var noData = document.createElement('div');
        noData.className = 'stats-legend-item';
        noData.innerHTML =
            '<span class="stats-legend-swatch" style="background:transparent;' +
            'border:1px solid rgba(255,255,255,0.16)"></span><span>No flights</span>';
        legend.appendChild(noData);

        if (hasZeroKm) {
            var zero = document.createElement('div');
            zero.className = 'stats-legend-item';
            zero.innerHTML =
                '<span class="stats-legend-swatch" style="background:' + colorFor(0) +
                ';position:relative"><span style="position:absolute;left:50%;top:50%;' +
                'width:3px;height:3px;margin:-1.5px 0 0 -1.5px;border-radius:50%;' +
                'background:var(--text-dim)"></span></span><span>Flown, 0 km</span>';
            legend.appendChild(zero);
        }

        container.appendChild(legend);

        var foot = document.createElement('div');
        foot.className = 'stats-legend';
        foot.style.marginTop = '6px';
        foot.style.color = 'var(--text-faint)';
        var same = busiest === farthest;
        foot.textContent =
            'Most legs: ' + M3[busiest.monthIndex] + ' ' + busiest.year + ' (' +
            busiest.flights + ')' +
            (same ? '' : ' · Farthest: ' + M3[farthest.monthIndex] + ' ' + farthest.year +
                ' (' + fmtKm(farthest.km) + ')') +
            (opts.note ? ' · ' + opts.note : '');
        container.appendChild(foot);

        /* ---------- entrance ---------- */

        if (!reduceMotion()) {
            rects.attr('opacity', 0)
                .transition()
                .delay(function (d) { return d.row * 14 + d.monthIndex * 4; })
                .duration(380)
                .attr('opacity', 1);
        }
    }

    return { render: render };
})();

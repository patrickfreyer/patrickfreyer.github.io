/* ==========================================================================
   Cumulative distance — the hero chart of /flights/stats/.

   Data: FlightMetrics.cumulative(legs)
         -> [{ year, monthIndex, km, cumulativeKm }]  chronological
   `monthIndex` may be null (unknown month, 2002-2006). Those buckets still
   count toward the running total, so they are kept and placed mid-year
   rather than dropped.

   Plain global module, no bundler. Reads only `d3` and the CSS design tokens.
   render() is idempotent: safe to call again on resize or on new data.
   ========================================================================== */

window.StatsCharts = window.StatsCharts || {};

window.StatsCharts.cumulative = (function () {
    'use strict';

    var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
        'August', 'September', 'October', 'November', 'December'];

    /* ---------- small local helpers (kept in-file so the module has no
                  dependency on sibling chart files) ---------- */

    function token(name, fallback) {
        var v = getComputedStyle(document.documentElement)
            .getPropertyValue(name).trim();
        return v || fallback;
    }

    function reduceMotion() {
        return window.matchMedia &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    function uid(prefix) {
        return prefix + '-' + Math.random().toString(36).slice(2, 9);
    }

    function fmtInt(n) {
        return Math.round(n).toLocaleString('en-US');
    }

    // 1_235_087 -> "1.24M" ; 238_889 -> "239k"
    function fmtCompact(n) {
        if (n >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M';
        if (n >= 1e4) return Math.round(n / 1e3) + 'k';
        if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
        return String(Math.round(n));
    }

    function bucketLabel(d) {
        return d.monthIndex === null || d.monthIndex === undefined
            ? String(d.year)
            : MONTHS[d.monthIndex] + ' ' + d.year;
    }

    /* ---------- tooltip (one per container, parked on <body> because
                  .stats-tooltip is position:fixed) ---------- */

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
        var left = Math.min(
            Math.max(pad, event.clientX - r.width / 2),
            window.innerWidth - r.width - pad
        );
        var top = event.clientY - r.height - 16;
        if (top < pad) top = event.clientY + 20;
        tip.style.left = left + 'px';
        tip.style.top = top + 'px';
    }

    function hideTip(tip) { if (tip) tip.style.opacity = '0'; }

    /* ---------- re-render on container width change ---------- */

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

    /* ---------- chronology ----------

       FlightMetrics.cumulative sorts unknown-month buckets LAST inside their
       year and accumulates cumulativeKm in exactly that order, so the x
       positions have to follow the same convention or the running total would
       appear to go backwards. (2025 really does mix a null-month bucket with
       eleven dated ones.) After positioning, x is clamped to be strictly
       increasing so the area can never fold back on itself. ---------- */

    function monthKey(d) {
        return (d.monthIndex === null || d.monthIndex === undefined) ? 12 : d.monthIndex;
    }

    function chronological(a, b) {
        return a.year - b.year || monthKey(a) - monthKey(b);
    }

    function xOf(d) {
        var m = monthKey(d);
        return d.year + (m === 12 ? 11.5 : m + 0.5) / 12;
    }

    function assignX(rows) {
        var prev = -Infinity;
        rows.forEach(function (d) {
            var v = xOf(d);
            if (v <= prev) v = prev + 1 / 365;
            d._x = v;
            prev = v;
        });
    }

    function render(container, data, opts) {
        if (!container) return;
        opts = opts || {};
        var tip = getTip(container);
        hideTip(tip);
        container.innerHTML = '';

        var series = (data || []).slice()
            .filter(function (d) { return d && isFinite(d.cumulativeKm); })
            .sort(chronological);

        if (!series.length) {
            container.innerHTML = '<div class="panel-placeholder">No distance data.</div>';
            return;
        }

        autoResize(container, function () { render(container, data, opts); });

        var fmtKm = kmFormatter(opts);
        var short = compactFormatter(opts);

        /* ---------- geometry (units == CSS px, so labels stay legible at
                      every width; the viewBox still scales the whole thing) ---------- */

        var W = Math.max(300, container.clientWidth || opts.width || 720);
        var narrow = W < 560;
        var H = Math.round(Math.min(430, Math.max(268, W * 0.42)));
        var m = {
            top: narrow ? 22 : 28,
            right: narrow ? 14 : 20,
            bottom: narrow ? 26 : 30,
            left: narrow ? 40 : 56
        };
        var iw = W - m.left - m.right;
        var ih = H - m.top - m.bottom;

        var C = {
            text: token('--text', '#e5e7eb'),
            dim: token('--text-dim', '#94a3b8'),
            faint: token('--text-faint', '#64748b'),
            grid: token('--grid-line', 'rgba(255,255,255,0.06)'),
            a: token('--accent-a', '#667eea'),
            b: token('--accent-b', '#764ba2')
        };
        // Bright tint of --accent-a for the top line, derived from the token
        // rather than hard-coded so a theme change carries through.
        var stroke = d3.color(C.a).brighter(0.55).formatHex();

        // Start the area from zero at the top of the first flown year so it
        // rises off the baseline instead of floating.
        var first = series[0];
        assignX(series);
        var pts = [{ year: first.year, monthIndex: null, km: 0, cumulativeKm: 0, _synthetic: true, _x: first.year }]
            .concat(series);

        var xMin = pts[0]._x;
        var xMax = series[series.length - 1]._x;
        var total = series[series.length - 1].cumulativeKm;

        var x = d3.scaleLinear().domain([xMin, xMax]).range([0, iw]);
        var y = d3.scaleLinear().domain([0, total * 1.06]).nice().range([ih, 0]);

        /* ---------- svg root ---------- */

        var ids = {
            fill: uid('cum-fill'),
            glow: uid('cum-glow'),
            clip: uid('cum-clip')
        };

        var svg = d3.select(container).append('svg')
            .attr('viewBox', '0 0 ' + W + ' ' + H)
            .attr('preserveAspectRatio', 'xMidYMid meet')
            .attr('width', '100%')
            .style('height', 'auto')
            .attr('role', 'img')
            .attr('aria-label',
                'Cumulative flight distance from ' + first.year + ' to ' +
                series[series.length - 1].year + ', reaching ' + fmtInt(total) + ' kilometres.');

        svg.append('title').text('Cumulative distance flown, ' + first.year + '-' +
            series[series.length - 1].year + ': ' + fmtInt(total) + ' km');

        var defs = svg.append('defs');

        var grad = defs.append('linearGradient')
            .attr('id', ids.fill)
            .attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 1);
        grad.append('stop').attr('offset', '0%').attr('stop-color', C.a).attr('stop-opacity', 0.55);
        grad.append('stop').attr('offset', '45%').attr('stop-color', C.a).attr('stop-opacity', 0.22);
        grad.append('stop').attr('offset', '100%').attr('stop-color', C.b).attr('stop-opacity', 0.02);

        var f = defs.append('filter')
            .attr('id', ids.glow)
            .attr('x', '-20%').attr('y', '-40%')
            .attr('width', '140%').attr('height', '180%');
        f.append('feGaussianBlur').attr('stdDeviation', 4).attr('result', 'blur');
        var merge = f.append('feMerge');
        merge.append('feMergeNode').attr('in', 'blur');
        merge.append('feMergeNode').attr('in', 'SourceGraphic');

        var g = svg.append('g').attr('transform', 'translate(' + m.left + ',' + m.top + ')');

        /* ---------- y grid + labels ---------- */

        var yTicks = y.ticks(narrow ? 3 : 5).filter(function (t) { return t <= total * 1.06; });
        var yg = g.append('g').attr('class', 'cum-grid');
        yg.selectAll('line').data(yTicks).enter().append('line')
            .attr('x1', 0).attr('x2', iw)
            .attr('y1', function (d) { return y(d); })
            .attr('y2', function (d) { return y(d); })
            .attr('stroke', C.grid)
            .attr('stroke-width', 1);

        yg.selectAll('text').data(yTicks).enter().append('text')
            .attr('x', -10)
            .attr('y', function (d) { return y(d); })
            .attr('dy', '0.32em')
            .attr('text-anchor', 'end')
            .attr('fill', C.faint)
            .attr('font-size', narrow ? 9.5 : 11)
            .style('font-variant-numeric', 'tabular-nums')
            .text(function (d) { return d === 0 ? '0' : short(d); });

        g.append('text')
            .attr('x', -10).attr('y', -10)
            .attr('text-anchor', 'end')
            .attr('fill', C.faint)
            .attr('font-size', narrow ? 9 : 10)
            .attr('letter-spacing', '0.08em')
            .text('KM');

        /* ---------- x axis (year ticks) ---------- */

        var y0 = Math.ceil(xMin), y1 = Math.floor(xMax);
        var maxLabels = Math.max(3, Math.floor(iw / (narrow ? 46 : 74)));
        var step = Math.max(1, Math.ceil((y1 - y0) / maxLabels));
        step = [1, 2, 5, 10].filter(function (s) { return s >= step; })[0] || step;
        var xTicks = d3.range(y0, y1 + 1, step);
        if (xTicks[xTicks.length - 1] !== y1 &&
            x(y1) - x(xTicks[xTicks.length - 1]) > (narrow ? 34 : 52)) xTicks.push(y1);

        var xg = g.append('g').attr('transform', 'translate(0,' + ih + ')');
        xg.append('line')
            .attr('x1', 0).attr('x2', iw).attr('y1', 0).attr('y2', 0)
            .attr('stroke', token('--border', 'rgba(255,255,255,0.08)'))
            .attr('stroke-width', 1);
        xg.selectAll('text').data(xTicks).enter().append('text')
            .attr('x', function (d) { return x(d); })
            .attr('y', 17)
            .attr('text-anchor', 'middle')
            .attr('fill', C.faint)
            .attr('font-size', narrow ? 9.5 : 11)
            .style('font-variant-numeric', 'tabular-nums')
            .text(function (d) { return narrow ? "'" + String(d).slice(2) : d; });

        /* ---------- million-km reference line ---------- */

        if (total > 1e6) {
            var refY = y(1e6);
            var ref = g.append('g').attr('opacity', 0.75);
            ref.append('line')
                .attr('x1', 0).attr('x2', iw).attr('y1', refY).attr('y2', refY)
                .attr('stroke', 'rgba(147,167,255,0.34)')
                .attr('stroke-width', 1)
                .attr('stroke-dasharray', '4 5');
            // At narrow widths the y-axis already reads "1M" right next to this
            // line, so the caption would only add clutter.
            if (!narrow) {
                ref.append('text')
                    .attr('x', 2).attr('y', refY - 6)
                    .attr('fill', 'rgba(147,167,255,0.72)')
                    .attr('font-size', 10)
                    .attr('letter-spacing', '0.06em')
                    .text('1 MILLION KM');
            }
        }

        /* ---------- area + line ---------- */

        var area = d3.area()
            .x(function (d) { return x(d._x); })
            .y0(ih)
            .y1(function (d) { return y(d.cumulativeKm); })
            .curve(d3.curveMonotoneX);

        var line = d3.line()
            .x(function (d) { return x(d._x); })
            .y(function (d) { return y(d.cumulativeKm); })
            .curve(d3.curveMonotoneX);

        var areaPath = g.append('path')
            .datum(pts)
            .attr('d', area)
            .attr('fill', 'url(#' + ids.fill + ')');

        var linePath = g.append('path')
            .datum(pts)
            .attr('d', line)
            .attr('fill', 'none')
            .attr('stroke', stroke)
            .attr('stroke-width', 2)
            .attr('stroke-linecap', 'round')
            .attr('stroke-linejoin', 'round')
            .attr('filter', 'url(#' + ids.glow + ')');

        /* ---------- end cap + total ---------- */

        var lastD = series[series.length - 1];
        var lx = x(lastD._x), ly = y(lastD.cumulativeKm);

        var cap = g.append('g');
        cap.append('circle')
            .attr('cx', lx).attr('cy', ly).attr('r', 8)
            .attr('fill', C.a).attr('opacity', 0.22);
        cap.append('circle')
            .attr('cx', lx).attr('cy', ly).attr('r', 3.5)
            .attr('fill', '#fff')
            .attr('stroke', stroke).attr('stroke-width', 2);

        var capLabel = cap.append('text')
            .attr('x', lx - 8)
            .attr('y', ly - (narrow ? 12 : 16))
            .attr('text-anchor', 'end')
            .attr('fill', C.text)
            .attr('font-size', narrow ? 12 : 14)
            .attr('font-weight', 600)
            .style('font-variant-numeric', 'tabular-nums')
            .text(short(total) + ' km');
        if (!narrow) {
            capLabel.append('tspan')
                .attr('x', lx - 8).attr('dy', '1.35em')
                .attr('fill', C.faint)
                .attr('font-size', 10)
                .attr('font-weight', 400)
                .attr('letter-spacing', '0.06em')
                .text('TOTAL TO DATE');
        }

        /* ---------- hover: guideline + focus dot + tooltip ---------- */

        var focus = g.append('g').attr('opacity', 0).style('pointer-events', 'none');
        focus.append('line')
            .attr('class', 'cum-guide')
            .attr('y1', 0).attr('y2', ih)
            .attr('stroke', 'rgba(255,255,255,0.26)')
            .attr('stroke-width', 1)
            .attr('stroke-dasharray', '3 4');
        var focusHalo = focus.append('circle')
            .attr('r', 9).attr('fill', C.a).attr('opacity', 0.28);
        var focusDot = focus.append('circle')
            .attr('r', 4)
            .attr('fill', '#fff')
            .attr('stroke', stroke)
            .attr('stroke-width', 2);

        var bisect = d3.bisector(function (d) { return d._x; }).left;

        function pick(event) {
            var mx = d3.pointer(event, g.node())[0];
            var xv = x.invert(Math.max(0, Math.min(iw, mx)));
            var i = bisect(series, xv);
            var a = series[Math.max(0, i - 1)], b = series[Math.min(series.length - 1, i)];
            return (!b || (a && Math.abs(a._x - xv) <= Math.abs(b._x - xv))) ? a : b;
        }

        g.append('rect')
            .attr('width', iw).attr('height', ih)
            .attr('fill', 'transparent')
            .style('cursor', 'crosshair')
            .on('mousemove touchmove', function (event) {
                event.preventDefault();
                var d = pick(event);
                if (!d) return;
                var px = x(d._x), py = y(d.cumulativeKm);
                focus.attr('opacity', 1);
                focus.select('.cum-guide').attr('x1', px).attr('x2', px);
                focusHalo.attr('cx', px).attr('cy', py);
                focusDot.attr('cx', px).attr('cy', py);
                var pct = Math.round(d.cumulativeKm / total * 100);
                showTip(tip,
                    '<div style="font-weight:600">' + bucketLabel(d) + '</div>' +
                    '<div style="color:' + C.dim + '">' + fmtKm(d.cumulativeKm) +
                    ' cumulative <span style="color:' + C.faint + '">(' + pct + '%)</span></div>' +
                    (d.km ? '<div style="color:' + C.faint + '">+' + fmtKm(d.km) + ' this period</div>' : ''),
                    event.touches ? event.touches[0] : event);
            })
            .on('mouseleave touchend', function () {
                focus.attr('opacity', 0);
                hideTip(tip);
            });

        /* ---------- entrance animation ---------- */

        if (!reduceMotion()) {
            var len = linePath.node().getTotalLength();
            linePath
                .attr('stroke-dasharray', len + ' ' + len)
                .attr('stroke-dashoffset', len)
                .transition().duration(1150).ease(d3.easeCubicOut)
                .attr('stroke-dashoffset', 0)
                .on('end', function () { linePath.attr('stroke-dasharray', null); });
            areaPath.attr('opacity', 0)
                .transition().delay(150).duration(900).attr('opacity', 1);
            cap.attr('opacity', 0)
                .transition().delay(950).duration(400).attr('opacity', 1);
        }
    }

    return { render: render };
})();

/* ==========================================================================
   KPI sparkline — a stroke and nothing else.

   render(container, values, opts)
     values  plain array of numbers (nulls / non-finite entries are skipped)
     opts    { color, glow, fill, endDot, label, height, smooth }

   No axes, no labels, no tooltip: the KPI tile carries the number, this only
   carries the shape. Drawn in an 80x24 user-space box with
   preserveAspectRatio="none" so it stretches to whatever the tile gives it;
   every stroke is vector-effect="non-scaling-stroke", so nothing thickens or
   smears when the box is not 80x24. The end dot is a zero-length round-capped
   stroke, which keeps it a true circle at any aspect ratio.

   aria: labelled only when opts.label is given, otherwise hidden from the
   accessibility tree (the tile's own value is the accessible content).
   ========================================================================== */

window.StatsCharts = window.StatsCharts || {};

window.StatsCharts.sparkline = (function () {
    'use strict';

    var VB_W = 80, VB_H = 24;

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

    function render(container, values, opts) {
        if (!container) return;
        opts = opts || {};
        container.innerHTML = '';

        var vals = (values || []).filter(function (v) { return v !== null && isFinite(v); })
            .map(Number);
        if (!vals.length) return;

        var accent = token('--accent-a', '#667eea');
        var color = opts.color || (window.d3 ? d3.color(accent).brighter(0.55).formatHex() : accent);
        var showGlow = opts.glow !== false;
        var showFill = opts.fill !== false;
        var showDot = opts.endDot !== false;

        var pad = 3.2;                       // room for the 2px stroke + end dot
        var innerH = VB_H - pad * 2;
        var min = Math.min.apply(null, vals);
        var max = Math.max.apply(null, vals);
        var span = max - min;

        var xAt = function (i) {
            return vals.length === 1 ? VB_W / 2 : (i / (vals.length - 1)) * VB_W;
        };
        var yAt = function (v) {
            if (span <= 0) return VB_H / 2;                 // flat series sits centred
            return pad + innerH - ((v - min) / span) * innerH;
        };

        var ids = { fill: uid('spark'), };

        var svg = d3.select(container).append('svg')
            .attr('viewBox', '0 0 ' + VB_W + ' ' + VB_H)
            .attr('preserveAspectRatio', 'none')
            .attr('width', '100%')
            .attr('height', opts.height || '100%')
            .style('overflow', 'visible');

        if (opts.label) {
            svg.attr('role', 'img').attr('aria-label', opts.label);
            svg.append('title').text(opts.label);
        } else {
            svg.attr('aria-hidden', 'true').attr('focusable', 'false');
        }

        var line = d3.line()
            .x(function (d, i) { return xAt(i); })
            .y(function (d) { return yAt(d); })
            .curve(opts.smooth === false ? d3.curveLinear : d3.curveMonotoneX);

        if (showFill && vals.length > 1) {
            var grad = svg.append('defs').append('linearGradient')
                .attr('id', ids.fill)
                .attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 1);
            grad.append('stop').attr('offset', '0%')
                .attr('stop-color', color).attr('stop-opacity', 0.26);
            grad.append('stop').attr('offset', '65%')
                .attr('stop-color', color).attr('stop-opacity', 0.05);
            grad.append('stop').attr('offset', '100%')
                .attr('stop-color', color).attr('stop-opacity', 0);

            var area = d3.area()
                .x(function (d, i) { return xAt(i); })
                .y0(VB_H)
                .y1(function (d) { return yAt(d); })
                .curve(opts.smooth === false ? d3.curveLinear : d3.curveMonotoneX);

            svg.append('path')
                .datum(vals)
                .attr('d', area)
                .attr('fill', 'url(#' + ids.fill + ')');
        }

        if (showGlow) {
            svg.append('path')
                .datum(vals)
                .attr('d', line)
                .attr('fill', 'none')
                .attr('stroke', color)
                .attr('stroke-width', 5)
                .attr('stroke-opacity', 0.18)
                .attr('stroke-linecap', 'round')
                .attr('stroke-linejoin', 'round')
                .attr('vector-effect', 'non-scaling-stroke');
        }

        svg.append('path')
            .datum(vals)
            .attr('d', line)
            .attr('fill', 'none')
            .attr('stroke', color)
            .attr('stroke-width', 2)
            .attr('stroke-linecap', 'round')
            .attr('stroke-linejoin', 'round')
            .attr('vector-effect', 'non-scaling-stroke');

        if (showDot) {
            var lx = xAt(vals.length - 1), ly = yAt(vals[vals.length - 1]);
            // Zero-length round-capped stroke == a circle that ignores the
            // non-uniform scale (a real <circle> would render as an ellipse).
            svg.append('path')
                .attr('d', 'M' + lx + ',' + ly + 'h0')
                .attr('stroke', color)
                .attr('stroke-width', 8)
                .attr('stroke-opacity', 0.25)
                .attr('stroke-linecap', 'round')
                .attr('vector-effect', 'non-scaling-stroke');
            svg.append('path')
                .attr('d', 'M' + lx + ',' + ly + 'h0')
                .attr('stroke', '#fff')
                .attr('stroke-width', 3.4)
                .attr('stroke-linecap', 'round')
                .attr('vector-effect', 'non-scaling-stroke');
        }

        if (!reduceMotion()) {
            svg.attr('opacity', 0).transition().duration(520).attr('opacity', 1);
        }
    }

    return { render: render };
})();

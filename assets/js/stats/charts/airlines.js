/* assets/js/stats/charts/airlines.js
 *
 * Airline mix over time — stacked columns of km per year, top N airlines plus a
 * muted "Other" residual.
 *
 * Data: window.FlightMetrics.airlineShareOverTime(legs)
 *       -> [{ year, airline, km }]
 *
 * Stacked COLUMNS rather than a stacked area, deliberately: 6 of the 27 calendar
 * years in 2000-2026 have no flights at all, and an area chart would draw a
 * confident slope straight across those gaps. Columns leave a gap as a gap.
 *
 * Colors come from the globe/map palette (window.FV.BASE_COLORS with its cyclic
 * first-appearance assignment) so an airline is the same color here as its arc
 * on the globe. Pass opts.colorMap (preferred) or opts.routes to lock the
 * assignment to the raw route order; otherwise first appearance in `data` is
 * used as a fallback.
 *
 * 'Unknown' / 'XXX' legs are excluded (spec: unknowns count in totals but never
 * appear as a ranked airline).
 *
 * Plain global script. Registers window.StatsCharts.airlines.
 */

/* ---- shared chart utilities (identical guarded block in every chart module) ---- */
(function () {
    'use strict';
    if (window.StatsChartUtil) return;

    var FALLBACK = {
        '--bg': '#0a0e1a',
        '--panel': 'rgba(255,255,255,0.03)',
        '--border': 'rgba(255,255,255,0.08)',
        '--text': '#e5e7eb',
        '--text-dim': '#94a3b8',
        '--text-faint': '#64748b',
        '--accent-a': '#667eea',
        '--accent-b': '#764ba2'
    };
    var FONT = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
    var STYLE_ID = 'sc-chart-styles';
    var CSS = [
        '.sc-fig{margin:0;padding:0;font-family:' + FONT + ';color:var(--text,#e5e7eb);}',
        '.sc-fig svg{display:block;width:100%;height:auto;}',
        '.sc-fig text{font-family:' + FONT + ';font-variant-numeric:tabular-nums;}',
        '.sc-note{margin:9px 2px 0;font-size:11px;line-height:1.5;color:var(--text-faint,#64748b);}',
        '.sc-legend{display:flex;flex-wrap:wrap;gap:7px 16px;margin:11px 0 0;padding:0;list-style:none;}',
        '.sc-legend li{display:flex;align-items:baseline;gap:7px;font-size:11.5px;line-height:1.4;color:var(--text-dim,#94a3b8);font-variant-numeric:tabular-nums;}',
        '.sc-key{width:10px;height:10px;border-radius:3px;flex:0 0 auto;transform:translateY(1px);}',
        '.sc-key-name{color:var(--text,#e5e7eb);}',
        '.sc-tip{position:fixed;left:0;top:0;z-index:9999;pointer-events:none;opacity:0;',
        'transition:opacity .12s ease;background:rgba(10,14,26,.97);',
        'border:1px solid rgba(122,162,255,.38);border-radius:8px;padding:8px 10px;',
        'font:12px/1.5 ' + FONT + ';color:#e5e7eb;max-width:290px;',
        'box-shadow:0 10px 28px rgba(0,0,0,.55);font-variant-numeric:tabular-nums;}',
        '.sc-tip b{color:#fff;font-weight:600;}',
        '.sc-tip i{font-style:normal;color:#94a3b8;}',
        '.sc-tip-rows{display:grid;grid-template-columns:auto auto;gap:1px 12px;margin-top:5px;}',
        '.sc-tip-rows span:nth-child(even){text-align:right;}',
        '.sc-hit{fill:transparent;}',
        /* collapsible data table — every value stays reachable without hover */
        '.sc-details{margin:11px 0 0;font-size:11.5px;}',
        '.sc-details summary{cursor:pointer;color:var(--text-dim,#94a3b8);font-size:11px;}',
        '.sc-details summary:hover{color:var(--text,#e5e7eb);}',
        '.sc-scroll{overflow-x:auto;margin-top:8px;}',
        '.sc-details table{border-collapse:collapse;width:100%;font-size:11px;font-variant-numeric:tabular-nums;}',
        '.sc-details th,.sc-details td{padding:3px 10px 3px 0;text-align:right;white-space:nowrap;',
        'border-bottom:1px solid var(--border,rgba(255,255,255,.08));}',
        '.sc-details th:first-child,.sc-details td:first-child{text-align:left;}',
        '.sc-details th{color:var(--text-dim,#94a3b8);font-weight:500;}',
        '.sc-details td{color:var(--text,#e5e7eb);}',
        /* occasion split */
        '.sc-occ-groups{margin:14px 0 0;display:flex;flex-direction:column;gap:2px;}',
        '.sc-occ-g{border-top:1px solid var(--border,rgba(255,255,255,.08));padding:9px 0 3px;}',
        '.sc-occ-top{display:flex;align-items:baseline;gap:9px;flex-wrap:wrap;}',
        '.sc-occ-name{color:var(--text,#e5e7eb);font-weight:600;font-size:12.5px;display:flex;align-items:baseline;gap:7px;}',
        '.sc-occ-meta{color:var(--text-dim,#94a3b8);font-size:11.5px;font-variant-numeric:tabular-nums;}',
        '.sc-occ-sub{display:flex;gap:2px;margin:8px 0 0;height:6px;}',
        '.sc-occ-sub i{display:block;height:100%;border-radius:3px;}',
        '.sc-occ-chips{display:flex;flex-wrap:wrap;gap:3px 14px;margin-top:6px;font-size:11px;line-height:1.5;',
        'color:var(--text-dim,#94a3b8);font-variant-numeric:tabular-nums;}',
        '.sc-occ-chips b{color:var(--text,#e5e7eb);font-weight:500;}',
        /* country / continent coverage */
        '.sc-cov-sum{font-size:11.5px;line-height:1.5;color:var(--text-dim,#94a3b8);margin:0 0 12px;}',
        '.sc-cov-sum b{color:var(--text,#e5e7eb);font-variant-numeric:tabular-nums;}',
        '.sc-cov-scale{display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin:0 0 14px;',
        'font-size:10.5px;color:var(--text-faint,#64748b);font-variant-numeric:tabular-nums;}',
        '.sc-cov-sw{display:inline-flex;align-items:center;justify-content:center;min-width:36px;',
        'height:17px;border-radius:4px;font-size:10px;padding:0 5px;}',
        '.sc-cov-c{border-top:1px solid var(--border,rgba(255,255,255,.08));padding:10px 0 12px;}',
        '.sc-cov-head{display:flex;align-items:baseline;gap:9px;flex-wrap:wrap;}',
        '.sc-cov-name{font-size:12.5px;font-weight:600;color:var(--text,#e5e7eb);}',
        '.sc-cov-meta{font-size:11px;color:var(--text-dim,#94a3b8);font-variant-numeric:tabular-nums;}',
        '.sc-cov-bar{height:4px;border-radius:2px;background:rgba(255,255,255,.06);margin:8px 0 10px;}',
        '.sc-cov-bar i{display:block;height:100%;border-radius:2px;',
        'background:linear-gradient(90deg,var(--accent-a,#667eea),var(--accent-b,#764ba2));}',
        '.sc-cov-chips{display:flex;flex-wrap:wrap;gap:5px;}',
        '.sc-cov-chip{display:inline-flex;align-items:baseline;gap:7px;padding:3px 9px;',
        'border-radius:5px;font-size:11.5px;line-height:1.4;white-space:nowrap;}',
        '.sc-cov-chip b{font-weight:600;font-variant-numeric:tabular-nums;opacity:.8;}',
        /* Entrance motion is purely additive: the mark is drawn at its FINAL
           geometry and a CSS animation plays it in. If the animation is disabled,
           throttled or never runs, the resting state is already correct — unlike a
           JS rAF loop, which can strand a bar mid-growth. */
        '@keyframes sc-grow-x{from{transform:scaleX(0)}to{transform:scaleX(1)}}',
        '@keyframes sc-fade-in{from{opacity:0}to{opacity:1}}',
        '.sc-grow{transform-box:fill-box;transform-origin:left center;',
        'animation:sc-grow-x .52s cubic-bezier(.22,.68,.32,1) both;}',
        '.sc-fade{animation:sc-fade-in .45s ease both;}',
        '@media (prefers-reduced-motion:reduce){',
        '.sc-tip{transition:none;}',
        '.sc-grow,.sc-fade{animation:none;}}'
    ].join('');

    function ensureStyles() {
        if (document.getElementById(STYLE_ID)) return;
        var s = document.createElement('style');
        s.id = STYLE_ID;
        s.textContent = CSS;
        (document.head || document.documentElement).appendChild(s);
    }

    function token(name) {
        var v = '';
        try {
            v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        } catch (e) { /* jsdom / detached */ }
        return v || FALLBACK[name] || '';
    }

    var _cv = null;
    function measure(text, size, weight) {
        if (!_cv) _cv = document.createElement('canvas').getContext('2d');
        if (!_cv) return String(text).length * size * 0.55;
        _cv.font = (weight || 400) + ' ' + size + 'px ' + FONT;
        return _cv.measureText(String(text)).width;
    }

    /* Truncate to fit maxW, appending an ellipsis. Returns {text, truncated}. */
    function fit(text, maxW, size, weight) {
        text = String(text == null ? '' : text);
        if (maxW <= 0) return { text: '', truncated: text.length > 0 };
        if (measure(text, size, weight) <= maxW) return { text: text, truncated: false };
        var lo = 0, hi = text.length;
        while (lo < hi) {
            var mid = (lo + hi + 1) >> 1;
            if (measure(text.slice(0, mid) + '…', size, weight) <= maxW) lo = mid; else hi = mid - 1;
        }
        return { text: text.slice(0, lo).replace(/[\s·]+$/, '') + '…', truncated: true };
    }

    var _tipEl = null;
    function tipEl() {
        if (_tipEl && _tipEl.isConnected) return _tipEl;
        _tipEl = document.createElement('div');
        _tipEl.className = 'sc-tip';
        _tipEl.setAttribute('role', 'tooltip');
        document.body.appendChild(_tipEl);
        return _tipEl;
    }
    function place(el, ev) {
        var pad = 14;
        var r = el.getBoundingClientRect();
        var x = ev.clientX + pad;
        var y = ev.clientY + pad;
        if (x + r.width > window.innerWidth - 6) x = ev.clientX - r.width - pad;
        if (y + r.height > window.innerHeight - 6) y = ev.clientY - r.height - pad;
        el.style.transform = 'translate(' + Math.max(6, x) + 'px,' + Math.max(6, y) + 'px)';
    }
    var tip = {
        show: function (html, ev) {
            var el = tipEl();
            el.innerHTML = html;
            el.style.opacity = '1';
            place(el, ev);
        },
        move: function (ev) { if (_tipEl) place(_tipEl, ev); },
        hide: function () { if (_tipEl) _tipEl.style.opacity = '0'; }
    };

    /* Attach hover/focus tooltip behaviour to an element. */
    function hover(node, htmlFn) {
        node.addEventListener('mouseenter', function (ev) { tip.show(htmlFn(), ev); });
        node.addEventListener('mousemove', function (ev) { tip.move(ev); });
        node.addEventListener('mouseleave', tip.hide);
    }

    function nf(n) {
        if (n == null || isNaN(n)) return '–';
        return Math.round(n).toLocaleString('en-US');
    }
    function km(n) { return nf(n) + ' km'; }
    function kmShort(n) {
        if (n == null || isNaN(n)) return '–';
        if (n >= 1000) return (n / 1000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, '') + 'k km';
        return Math.round(n) + ' km';
    }
    function plural(n, one, many) { return nf(n) + ' ' + (Math.abs(n) === 1 ? one : (many || one + 's')); }
    function pct(part, whole) { return whole ? (part / whole * 100) : 0; }
    function pctStr(part, whole) {
        var p = pct(part, whole);
        return (p >= 10 || p === 0 ? Math.round(p) : p.toFixed(1)) + '%';
    }
    function reducedMotion() {
        try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
    }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
    }

    var _uid = 0;
    function uid(p) { _uid += 1; return 'sc-' + p + '-' + _uid; }

    /* Measure the container, draw once, and re-draw on a real width change.
       Idempotent: safe to call repeatedly on the same container. */
    function responsive(container, draw) {
        if (!container) return;
        ensureStyles();
        if (container.__scRO) { container.__scRO.disconnect(); container.__scRO = null; }
        if (container.__scT) { clearTimeout(container.__scT); container.__scT = null; }
        tip.hide();
        container.textContent = '';

        var w = width(container);
        draw(container, w);

        if (typeof ResizeObserver === 'function') {
            var ro = new ResizeObserver(function () {
                var nw = width(container);
                if (Math.abs(nw - w) < 12) return;
                clearTimeout(container.__scT);
                container.__scT = setTimeout(function () {
                    responsive(container, draw);
                }, 150);
            });
            ro.observe(container);
            container.__scRO = ro;
        }
    }

    function width(container) {
        var w = container.clientWidth || 0;
        if (!w) {
            try { w = Math.round(container.getBoundingClientRect().width); } catch (e) { w = 0; }
        }
        if (!w && container.parentElement) w = container.parentElement.clientWidth || 0;
        return Math.max(260, Math.min(1600, w || 640));
    }

    /* <figure> wrapper + accessible SVG root sized in real CSS pixels, so text
       is never scaled down by a viewBox fit. */
    function figure(host, label) {
        var fig = document.createElement('figure');
        fig.className = 'sc-fig';
        fig.setAttribute('role', 'group');
        if (label) fig.setAttribute('aria-label', label);
        host.appendChild(fig);
        return fig;
    }
    function svgRoot(parent, w, h, title, desc) {
        var NS = 'http://www.w3.org/2000/svg';
        var svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
        svg.setAttribute('preserveAspectRatio', 'xMinYMin meet');
        svg.setAttribute('width', w);
        svg.setAttribute('height', h);
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', title || '');
        var t = document.createElementNS(NS, 'title');
        t.textContent = title || '';
        svg.appendChild(t);
        if (desc) {
            var d = document.createElementNS(NS, 'desc');
            d.textContent = desc;
            svg.appendChild(d);
        }
        parent.appendChild(svg);
        return svg;
    }
    function el(parent, name, attrs, text) {
        var NS = 'http://www.w3.org/2000/svg';
        var n = document.createElementNS(NS, name);
        if (attrs) Object.keys(attrs).forEach(function (k) {
            if (attrs[k] != null) n.setAttribute(k, attrs[k]);
        });
        if (text != null) n.textContent = text;
        parent.appendChild(n);
        return n;
    }
    function note(fig, text) {
        var p = document.createElement('p');
        p.className = 'sc-note';
        p.textContent = text;
        fig.appendChild(p);
        return p;
    }
    /* Legend list. items: [{name, color, meta}] */
    function legend(fig, items, label) {
        var ul = document.createElement('ul');
        ul.className = 'sc-legend';
        if (label) ul.setAttribute('aria-label', label);
        items.forEach(function (it) {
            var li = document.createElement('li');
            var sw = document.createElement('span');
            sw.className = 'sc-key';
            sw.style.background = it.color;
            sw.setAttribute('aria-hidden', 'true');
            li.appendChild(sw);
            var nm = document.createElement('span');
            nm.className = 'sc-key-name';
            nm.textContent = it.name;
            li.appendChild(nm);
            if (it.meta) {
                var m = document.createElement('span');
                m.textContent = it.meta;
                li.appendChild(m);
            }
            ul.appendChild(li);
        });
        fig.appendChild(ul);
        return ul;
    }
    /* Relative luminance, for picking ink on a colored fill. */
    function luminance(hex) {
        var m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
        if (!m) return 0;
        var v = parseInt(m[1], 16);
        var c = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map(function (x) {
            x /= 255;
            return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    }
    function inkOn(hex) { return luminance(hex) > 0.33 ? '#0a0e1a' : '#e5e7eb'; }

    /* Rounded-end bar path: square at the baseline, r-rounded at the data end. */
    function hBarPath(x, y, w, h, r) {
        w = Math.max(0, w);
        r = Math.max(0, Math.min(r, w, h / 2));
        if (w <= 0.5) return 'M' + x + ',' + y + 'h0';
        return 'M' + x + ',' + y +
            'H' + (x + w - r) + 'a' + r + ',' + r + ' 0 0 1 ' + r + ',' + r +
            'V' + (y + h - r) + 'a' + r + ',' + r + ' 0 0 1 ' + (-r) + ',' + r +
            'H' + x + 'Z';
    }
    function vBarPath(x, y, w, h, r) {
        h = Math.max(0, h);
        r = Math.max(0, Math.min(r, h, w / 2));
        if (h <= 0.5) return 'M' + x + ',' + (y + h) + 'h0';
        return 'M' + x + ',' + (y + h) +
            'V' + (y + r) + 'a' + r + ',' + r + ' 0 0 1 ' + r + ',' + (-r) +
            'H' + (x + w - r) + 'a' + r + ',' + r + ' 0 0 1 ' + r + ',' + r +
            'V' + (y + h) + 'Z';
    }
    /* accent-a -> accent-b sweep across each bar's own box (identical for every
       bar, so it decorates without encoding anything). */
    function barGradient(svg, id) {
        var defs = el(svg, 'defs');
        var g = el(defs, 'linearGradient', { id: id, x1: '0', y1: '0', x2: '1', y2: '0' });
        el(g, 'stop', { offset: '0%', 'stop-color': token('--accent-a') });
        el(g, 'stop', { offset: '100%', 'stop-color': token('--accent-b') });
        return 'url(#' + id + ')';
    }

    window.StatsChartUtil = {
        FONT: FONT, token: token, ensureStyles: ensureStyles,
        measure: measure, fit: fit, tip: tip, hover: hover,
        nf: nf, km: km, kmShort: kmShort, plural: plural, pct: pct, pctStr: pctStr,
        reducedMotion: reducedMotion, esc: esc, uid: uid,
        responsive: responsive, width: width,
        figure: figure, svgRoot: svgRoot, el: el, note: note, legend: legend,
        luminance: luminance, inkOn: inkOn,
        hBarPath: hBarPath, vBarPath: vBarPath, barGradient: barGradient
    };
})();

(function () {
    'use strict';

    window.StatsCharts = window.StatsCharts || {};

    var FALLBACK_BASE = [
        '#FFFF00', '#FF8C00', '#00BFFF', '#FFFFFF', '#FF1493',
        '#00FF00', '#FF4500', '#00FFFF', '#FFD700', '#FF69B4',
        '#00CED1', '#FF6347'
    ];
    var OTHER = 'Other';
    /* Deliberately achromatic: "Other" is a residual bucket, not an entity, so
       it must not read as a 9th categorical hue. */
    var OTHER_COLOR = '#5a6478';

    function isUnknown(name) {
        if (!name) return true;
        var n = String(name).trim();
        return !n || n === 'Unknown' || n === 'XXX' || n === 'unknown';
    }

    /* airline -> color, matching flight-views-common.js / earth.js */
    function colorMapFor(order, opts) {
        if (opts && opts.colorMap) return opts.colorMap;
        var FV = window.FV;
        if (opts && opts.routes && FV && FV.airlineColorMap) return FV.airlineColorMap(opts.routes);
        var base = (FV && FV.BASE_COLORS) || FALLBACK_BASE;
        var map = {};
        order.forEach(function (a, i) { map[a] = base[i % base.length]; });
        return map;
    }

    function prepare(data, opts) {
        var topN = (opts && opts.topN) || 8;
        var rows = (data || []).filter(function (d) {
            return d && !isUnknown(d.airline) && Number(d.year) && (d.km > 0);
        });

        /* first-appearance order (fallback color assignment) + totals */
        var order = [];
        var totals = {};
        rows.forEach(function (d) {
            var a = String(d.airline);
            if (totals[a] === undefined) { totals[a] = 0; order.push(a); }
            totals[a] += d.km;
        });
        var colors = colorMapFor(order, opts);

        var ranked = Object.keys(totals).sort(function (a, b) { return totals[b] - totals[a]; });
        var top = ranked.slice(0, topN);
        var folded = ranked.slice(topN);
        var isTop = {};
        top.forEach(function (a) { isTop[a] = true; });

        /* year -> series -> km */
        var byYear = {};
        rows.forEach(function (d) {
            var y = Number(d.year);
            var key = isTop[String(d.airline)] ? String(d.airline) : OTHER;
            byYear[y] = byYear[y] || {};
            byYear[y][key] = (byYear[y][key] || 0) + d.km;
        });

        var years = Object.keys(byYear).map(Number);
        var y0 = Math.min.apply(null, years);
        var y1 = Math.max.apply(null, years);
        var allYears = [];
        for (var y = y0; y <= y1; y += 1) allYears.push(y);

        /* stack order: biggest at the baseline, Other always on top */
        var series = top.map(function (a) {
            return { key: a, color: (colors[a] || (window.FV && window.FV.DEFAULT_COLOR) || '#00FF00'), km: totals[a] };
        });
        var otherKm = folded.reduce(function (s, a) { return s + totals[a]; }, 0);
        if (otherKm > 0) {
            series.push({ key: OTHER, color: OTHER_COLOR, km: otherKm, count: folded.length });
        }

        var columns = allYears.map(function (yr) {
            var vals = byYear[yr] || {};
            var total = series.reduce(function (s, ser) { return s + (vals[ser.key] || 0); }, 0);
            return { year: yr, vals: vals, total: total };
        });

        return {
            series: series, columns: columns, years: allYears,
            maxTotal: Math.max.apply(null, columns.map(function (c) { return c.total; }).concat([1])),
            grandTotal: series.reduce(function (s, ser) { return s + ser.km; }, 0),
            foldedCount: folded.length
        };
    }

    function draw(host, W, model, opts) {
        var U = window.StatsChartUtil;
        var narrow = W < 540;
        var textCol = U.token('--text');
        var dimCol = U.token('--text-dim');
        var faintCol = U.token('--text-faint');
        var borderCol = U.token('--border');
        var bg = U.token('--bg') || '#0a0e1a';

        var fig = U.figure(host, 'Airline mix by year, measured in kilometres flown');

        var M = { t: 24, r: 4, b: 24, l: narrow ? 34 : 44 };
        var plotH = narrow ? 190 : 280;
        var H = M.t + plotH + M.b;
        var plotW = Math.max(80, W - M.l - M.r);

        var x = d3.scaleBand().domain(model.years).range([M.l, M.l + plotW]).paddingInner(0.28).paddingOuter(0.12);
        var y = d3.scaleLinear().domain([0, model.maxTotal]).nice(4).range([M.t + plotH, M.t]);
        var barW = Math.min(24, x.bandwidth());
        var ticks = y.ticks(4);

        var svg = U.svgRoot(fig, W, H,
            'Airline mix by year',
            'Stacked columns of kilometres flown per year, split by airline. ' +
            'The tallest year is ' + peakYear(model).year + ' at ' + U.km(peakYear(model).total) + '.');

        /* y axis: hairline solid gridlines, one step off the surface */
        ticks.forEach(function (t) {
            var yy = Math.round(y(t)) + 0.5;
            U.el(svg, 'line', {
                x1: M.l, x2: M.l + plotW, y1: yy, y2: yy,
                stroke: t === 0 ? borderCol : 'rgba(255,255,255,0.05)', 'stroke-width': 1
            });
            U.el(svg, 'text', {
                x: M.l - 7, y: yy + 3.5, 'text-anchor': 'end',
                fill: faintCol, 'font-size': 10
            }, t === 0 ? '0' : shortK(t));
        });
        U.el(svg, 'text', {
            x: 0, y: 11, fill: faintCol, 'font-size': 10.5, 'letter-spacing': '0.08em'
        }, 'KM FLOWN');

        /* x labels — thin out until they fit */
        var labelStep = Math.max(1, Math.ceil((U.measure('2000', 10) + 9) / Math.max(1, x.step())));
        var lastYear = model.years[model.years.length - 1];
        model.years.forEach(function (yr, i) {
            var show = (i % labelStep === 0) || yr === lastYear;
            /* avoid a collision between the stepped label and the pinned last one */
            if (show && yr !== lastYear && (model.years.length - 1 - i) < labelStep * 0.7) show = false;
            if (!show) return;
            var pos = clampLabel(x(yr) + x.bandwidth() / 2, U.measure(String(yr), 10), W);
            U.el(svg, 'text', {
                x: pos.x, y: M.t + plotH + 15,
                'text-anchor': pos.anchor, fill: faintCol, 'font-size': 10
            }, String(yr));
        });

        var peak = peakYear(model);

        model.columns.forEach(function (col) {
            var cx = x(col.year) + (x.bandwidth() - barW) / 2;
            if (col.total <= 0) return;

            /* build segments bottom-up */
            var stack = [];
            var cum = 0;
            model.series.forEach(function (ser) {
                var v = col.vals[ser.key] || 0;
                if (v <= 0) return;
                stack.push({ ser: ser, v: v, y0: cum, y1: cum + v });
                cum += v;
            });

            stack.forEach(function (s, idx) {
                var yTop = y(s.y1);
                var yBot = y(s.y0);
                var top = yTop;
                var h = yBot - yTop;
                /* 2px surface gap between touching segments (1px shaved each side) */
                if (idx < stack.length - 1) { top += 1; h -= 1; }
                if (idx > 0) { h -= 1; }
                h = Math.max(1.5, h);
                var isTopSeg = idx === stack.length - 1;
                var d = isTopSeg && h >= 5
                    ? U.vBarPath(cx, top, barW, h, 4)
                    : 'M' + cx + ',' + top + 'h' + barW + 'v' + h + 'h' + (-barW) + 'Z';
                var p = U.el(svg, 'path', {
                    d: d, fill: s.ser.color, 'shape-rendering': 'crispEdges', class: 'sc-fade'
                });
                p.style.animationDelay = Math.min(600, (col.year - model.years[0]) * 22) + 'ms';
                U.el(p, 'title', {}, s.ser.key + ' · ' + col.year + ' · ' + U.km(s.v));
            });

            /* one direct label: the peak year's total */
            if (col.year === peak.year) {
                var lab = shortK(col.total) + ' km';
                var lp = clampLabel(cx + barW / 2, U.measure(lab, 10.5, 600), W);
                U.el(svg, 'text', {
                    x: lp.x, y: y(col.total) - 7, 'text-anchor': lp.anchor,
                    fill: textCol, 'font-size': 10.5, 'font-weight': 600
                }, lab);
            }

            /* full-column hit target: comfortably bigger than any one segment */
            var band = U.el(svg, 'rect', {
                x: x(col.year), y: M.t, width: x.bandwidth(), height: plotH,
                fill: 'transparent', class: 'sc-hit'
            });
            band.addEventListener('mouseenter', function () { band.setAttribute('fill', 'rgba(255,255,255,0.045)'); });
            band.addEventListener('mouseleave', function () { band.setAttribute('fill', 'transparent'); });
            U.hover(band, function () {
                var rowsHtml = stack.slice().reverse().map(function (s) {
                    return '<span><span class="sc-key" style="display:inline-block;background:' +
                        s.ser.color + ';margin-right:6px"></span>' + U.esc(s.ser.key) + '</span>' +
                        '<span>' + U.km(s.v) + ' <i>' + U.pctStr(s.v, col.total) + '</i></span>';
                }).join('');
                return '<b>' + col.year + '</b> <i>' + U.km(col.total) + ' across ' +
                    stack.length + ' airline' + (stack.length === 1 ? '' : 's') + '</i>' +
                    '<div class="sc-tip-rows">' + rowsHtml + '</div>';
            });
        });

        /* baseline */
        U.el(svg, 'line', {
            x1: M.l, x2: M.l + plotW, y1: M.t + plotH + 0.5, y2: M.t + plotH + 0.5,
            stroke: borderCol, 'stroke-width': 1
        });

        /* Legend for two or more series. A single series needs none — the card
           title already names what is plotted. */
        if (model.series.length > 1) {
            U.legend(fig, model.series.map(function (ser) {
                return {
                    name: ser.key === OTHER
                        ? 'Other (' + ser.count + ' airlines)'
                        : ser.key,
                    color: ser.color,
                    meta: shortK(ser.km) + ' km · ' + U.pctStr(ser.km, model.grandTotal)
                };
            }), 'Airlines shown in this chart');
        }

        var shown = model.series.length - (model.foldedCount ? 1 : 0);
        U.note(fig, (shown === 1
            ? 'One airline has recorded distance'
            : 'Top ' + shown + ' airlines by distance are shown individually') +
            (model.foldedCount ? '; the remaining ' + model.foldedCount + ' fold into Other' : '') +
            '. Legs with no recorded airline are excluded here but still count in the totals above.');

        table(fig, model);
    }

    /* A label centred on a band near either edge runs outside the viewBox and
       gets cut. Pin it to the edge and flip the anchor instead. */
    function clampLabel(cx, textW, W) {
        var half = textW / 2;
        if (cx - half < 0) return { x: 0, anchor: 'start' };
        if (cx + half > W) return { x: W, anchor: 'end' };
        return { x: cx, anchor: 'middle' };
    }

    function peakYear(model) {
        return model.columns.reduce(function (best, c) {
            return c.total > best.total ? c : best;
        }, { year: model.years[0], total: 0 });
    }

    function shortK(n) {
        if (n >= 1000) return Math.round(n / 1000) + 'k';
        return String(Math.round(n));
    }

    /* Collapsible table so no value is hover-gated. */
    function table(fig, model) {
        var U = window.StatsChartUtil;
        var det = document.createElement('details');
        det.className = 'sc-details';
        var sum = document.createElement('summary');
        sum.textContent = 'Show the numbers';
        det.appendChild(sum);
        var wrap = document.createElement('div');
        wrap.className = 'sc-scroll';
        var html = '<table><thead><tr><th>Airline</th><th>Total km</th><th>Share</th><th>First</th><th>Last</th></tr></thead><tbody>';
        model.series.forEach(function (ser) {
            var first = null, last = null;
            model.columns.forEach(function (c) {
                if ((c.vals[ser.key] || 0) > 0) { if (first === null) first = c.year; last = c.year; }
            });
            html += '<tr><td>' + U.esc(ser.key) + '</td><td>' + U.nf(ser.km) + '</td><td>' +
                U.pctStr(ser.km, model.grandTotal) + '</td><td>' + (first || '–') + '</td><td>' + (last || '–') + '</td></tr>';
        });
        html += '</tbody></table>';
        wrap.innerHTML = html;
        det.appendChild(wrap);
        fig.appendChild(det);
    }

    window.StatsCharts.airlines = {
        render: function (container, data, opts) {
            var U = window.StatsChartUtil;
            opts = opts || {};
            U.ensureStyles();
            var model;
            try {
                model = prepare(data, opts);
            } catch (e) {
                model = null;
            }
            if (!model || !model.series.length || !model.years.length) {
                container.textContent = '';
                var p = document.createElement('p');
                p.className = 'sc-note';
                p.textContent = 'No airline data available.';
                container.appendChild(p);
                return;
            }
            U.responsive(container, function (host, W) { draw(host, W, model, opts); });
        }
    };
})();

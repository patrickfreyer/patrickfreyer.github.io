/* assets/js/stats/charts/occasion.js
 *
 * Work / Study / Personal split.
 *
 * Data: window.FlightMetrics.occasionSplit(legs)
 *       -> [{ group, km, flights, breakdown: [{ label, km, flights }] }]
 *
 * FORM CHOICE — two aligned 100% stacked bars, not a donut:
 *   1. There are two measures worth showing (distance and legs) and they tell
 *      different stories; two aligned bars compare cleanly against each other,
 *      two donuts do not.
 *   2. Study is ~7% of legs. In a donut that slice is too thin to label, so the
 *      Warwick/Yale chapter Patrick cares about would be hover-only. On a bar
 *      the segment still has a measurable width to label, and where it doesn't
 *      the value moves outside instead of being clipped.
 *   3. Part-to-whole across three groups at a glance is exactly what a single
 *      stacked bar is for; a donut adds angle-judging for no gain.
 *
 * The original sub-labels (Warwick, Yale, School, Rowing, Pilots License, ...)
 * are surfaced BOTH in the tooltip and printed under each group, so that chapter
 * is legible without hovering.
 *
 * Plain global script. Registers window.StatsCharts.occasion.
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

    /* Fixed entity order + fixed colors: a filter that drops a group must never
       repaint the survivors. Validated as a dark-mode categorical trio
       (lightness band, chroma floor, protan/deutan separation, contrast). */
    var GROUPS = [
        { key: 'Work', color: '#667eea' },
        { key: 'Study', color: '#0d9488' },
        { key: 'Personal', color: '#dd6b20' },
        { key: 'Unknown', color: '#5a6478' }
    ];

    function hexRgba(hex, a) {
        var m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
        if (!m) return hex;
        var v = parseInt(m[1], 16);
        return 'rgba(' + [(v >> 16) & 255, (v >> 8) & 255, v & 255].join(',') + ',' + a + ')';
    }

    function segPath(x, y, w, h, rl, rr) {
        w = Math.max(0.5, w);
        rl = Math.max(0, Math.min(rl, w / 2, h / 2));
        rr = Math.max(0, Math.min(rr, w / 2, h / 2));
        var d = 'M' + (x + rl) + ',' + y + 'H' + (x + w - rr);
        d += rr ? 'a' + rr + ',' + rr + ' 0 0 1 ' + rr + ',' + rr : '';
        d += 'V' + (y + h - rr);
        d += rr ? 'a' + rr + ',' + rr + ' 0 0 1 ' + (-rr) + ',' + rr : '';
        d += 'H' + (x + rl);
        d += rl ? 'a' + rl + ',' + rl + ' 0 0 1 ' + (-rl) + ',' + (-rl) : '';
        d += 'V' + (y + rl);
        d += rl ? 'a' + rl + ',' + rl + ' 0 0 1 ' + rl + ',' + (-rl) : '';
        return d + 'Z';
    }

    function prepare(data) {
        var byKey = {};
        (data || []).forEach(function (d) {
            if (!d || !d.group) return;
            byKey[String(d.group)] = d;
        });
        var rows = [];
        GROUPS.forEach(function (g) {
            var d = byKey[g.key];
            if (!d || (!(d.km > 0) && !(d.flights > 0))) return;
            var bd = (d.breakdown || [])
                .filter(function (b) { return b && (b.km > 0 || b.flights > 0); })
                .slice()
                .sort(function (a, b) { return (b.km || 0) - (a.km || 0); });
            rows.push({
                key: g.key, color: g.color,
                km: d.km || 0, flights: d.flights || 0, breakdown: bd
            });
        });
        /* any group name the taxonomy doesn't know about still gets shown */
        Object.keys(byKey).forEach(function (k) {
            if (rows.some(function (r) { return r.key === k; })) return;
            var d = byKey[k];
            rows.push({
                key: k, color: '#5a6478', km: d.km || 0, flights: d.flights || 0,
                breakdown: (d.breakdown || []).slice()
            });
        });
        return {
            rows: rows,
            totalKm: rows.reduce(function (s, r) { return s + r.km; }, 0),
            totalFlights: rows.reduce(function (s, r) { return s + r.flights; }, 0)
        };
    }

    function draw(host, W, model, opts) {
        var U = window.StatsChartUtil;
        var narrow = W < 480;
        var textCol = U.token('--text');
        var dimCol = U.token('--text-dim');
        var faintCol = U.token('--text-faint');

        var fig = U.figure(host, 'Flights split into work, study and personal travel');

        var barH = narrow ? 20 : 24;
        var labelH = 17;
        /* every row reserves a band under the bar for any segment whose label
           could not fit inside it, so an outside label is never clipped */
        var outBand = 18;
        var rowGap = narrow ? 12 : 14;
        var measures = [
            { id: 'km', caption: 'BY DISTANCE', total: model.totalKm, fmt: U.km, get: function (r) { return r.km; } },
            { id: 'flights', caption: 'BY LEGS', total: model.totalFlights, fmt: function (n) { return U.plural(n, 'leg'); }, get: function (r) { return r.flights; } }
        ];
        var rowH = labelH + barH + outBand + rowGap;
        var H = measures.length * rowH - rowGap + 2;

        var svg = U.svgRoot(fig, W, H,
            'Work, study and personal split',
            model.rows.map(function (r) {
                return r.key + ': ' + U.km(r.km) + ' across ' + U.plural(r.flights, 'leg');
            }).join('; '));

        measures.forEach(function (m, mi) {
            var top = mi * rowH;
            U.el(svg, 'text', {
                x: 0, y: top + 10, fill: faintCol, 'font-size': 10.5, 'letter-spacing': '0.08em'
            }, m.caption);
            U.el(svg, 'text', {
                x: W, y: top + 10, fill: dimCol, 'font-size': 11, 'text-anchor': 'end'
            }, m.fmt(m.total));

            var barY = top + labelH;
            var last = model.rows.length - 1;
            var outside = [];

            /* Lay the segments out so (a) a tiny group still reads as a
               deliberate sliver rather than a hairline artifact and (b) the
               widths sum to exactly W, so nothing overflows the right edge. */
            var MIN_SEG = 3;
            var raws = model.rows.map(function (r) {
                return m.total ? (m.get(r) / m.total) * W : 0;
            });
            var deficit = 0, flexTotal = 0;
            raws.forEach(function (v) {
                if (v < MIN_SEG) deficit += MIN_SEG - v; else flexTotal += v;
            });
            var widths = raws.map(function (v) {
                if (v < MIN_SEG) return MIN_SEG;
                return flexTotal > 0 ? v - deficit * (v / flexTotal) : v;
            });
            /* absorb float drift into the widest segment */
            var drift = W - widths.reduce(function (s, v) { return s + v; }, 0);
            var widest = widths.indexOf(Math.max.apply(null, widths));
            widths[widest] += drift;

            var cx = 0;
            model.rows.forEach(function (r, i) {
                var v = m.get(r);
                var raw = widths[i];
                var x0 = cx;
                cx += raw;
                /* 2px surface gap between touching segments */
                var gapL = i > 0 ? 1 : 0;
                var gapR = i < last ? 1 : 0;
                var w = Math.max(1.5, raw - gapL - gapR);
                var px = x0 + gapL;

                var p = U.el(svg, 'path', {
                    d: segPath(px, barY, w, barH, i === 0 ? 4 : 0, i === last ? 4 : 0),
                    fill: r.color
                });
                U.el(p, 'title', {}, r.key + ' — ' + m.fmt(v) + ' (' + U.pctStr(v, m.total) + ')');

                /* label inside only if it genuinely fits with padding */
                var ink = U.inkOn(r.color);
                var pctTxt = U.pctStr(v, m.total);
                var full = r.key + ' ' + pctTxt;
                var fits = null;
                if (U.measure(full, 11.5, 600) + 16 <= w) fits = full;
                else if (U.measure(pctTxt, 11, 600) + 12 <= w) fits = pctTxt;
                if (fits) {
                    U.el(svg, 'text', {
                        x: px + w / 2, y: barY + barH / 2 + 4, 'text-anchor': 'middle',
                        fill: ink, 'font-size': fits === full ? 11.5 : 11, 'font-weight': 600
                    }, fits);
                } else {
                    outside.push({ r: r, x: px + w / 2, txt: r.key + ' ' + pctTxt });
                }

                U.hover(p, function () {
                    var bd = r.breakdown.length
                        ? '<div class="sc-tip-rows">' + r.breakdown.map(function (b) {
                            return '<span><i>' + U.esc(b.label) + '</i></span><span>' +
                                U.nf(b.flights) + ' legs · ' + U.km(b.km) + '</span>';
                        }).join('') + '</div>'
                        : '';
                    return '<b>' + U.esc(r.key) + '</b> <i>' + pctTxt + ' ' +
                        (m.id === 'km' ? 'of distance' : 'of legs') + '</i>' +
                        '<div class="sc-tip-rows">' +
                        '<span><i>Distance</i></span><span>' + U.km(r.km) + '</span>' +
                        '<span><i>Legs</i></span><span>' + U.nf(r.flights) + '</span>' +
                        '</div>' + bd;
                });
            });

            /* Anything that could not fit inside gets a leader + label in the
               reserved band below. Resolve overlaps by walking left to right and
               pushing each label clear of the previous one, then clamping the
               whole run inside the plot. */
            outside.forEach(function (o) { o.w = U.measure(o.txt, 10.5, 500); });
            outside.sort(function (a, b) { return a.x - b.x; });
            var cursor = 0;
            outside.forEach(function (o) {
                o.lx = Math.max(cursor + o.w / 2, o.x);
                cursor = o.lx + o.w / 2 + 8;
            });
            var over = cursor - 8 - W;
            if (over > 0) {
                for (var k = outside.length - 1, limit = W; k >= 0; k -= 1) {
                    outside[k].lx = Math.min(outside[k].lx, limit - outside[k].w / 2);
                    limit = outside[k].lx - outside[k].w / 2 - 8;
                }
            }
            outside.forEach(function (o) {
                o.lx = Math.max(o.w / 2, Math.min(W - o.w / 2, o.lx));
                U.el(svg, 'line', {
                    x1: o.x, x2: o.lx, y1: barY + barH + 1, y2: barY + barH + 6,
                    stroke: o.r.color, 'stroke-width': 1.5
                });
                U.el(svg, 'text', {
                    x: o.lx, y: barY + barH + 16, 'text-anchor': 'middle',
                    fill: dimCol, 'font-size': 10.5
                }, o.txt);
            });
        });

        U.legend(fig, model.rows.map(function (r) {
            return {
                name: r.key, color: r.color,
                meta: U.pctStr(r.km, model.totalKm) + ' of distance · ' + U.plural(r.flights, 'leg')
            };
        }), 'Occasion groups');

        /* Group detail: the original sub-labels, printed rather than hover-gated */
        var wrap = document.createElement('div');
        wrap.className = 'sc-occ-groups';
        model.rows.forEach(function (r) {
            if (!r.breakdown.length) return;
            var card = document.createElement('div');
            card.className = 'sc-occ-g';

            var head = document.createElement('div');
            head.className = 'sc-occ-top';
            head.innerHTML =
                '<span class="sc-occ-name"><span class="sc-key" style="background:' + r.color +
                '" aria-hidden="true"></span>' + U.esc(r.key) + '</span>' +
                '<span class="sc-occ-meta">' + U.km(r.km) + ' · ' + U.plural(r.flights, 'leg') + '</span>';
            card.appendChild(head);

            /* A one-entry breakdown would draw a full-width bar for a group that
               may be 0.7% of the total — misleading at a glance, and it says
               nothing the chip below does not. Only bar a real split. */
            if (r.breakdown.length > 1) {
                var subMax = r.breakdown.reduce(function (s, b) { return s + (b.km || 0); }, 0) || 1;
                var sub = document.createElement('div');
                sub.className = 'sc-occ-sub';
                sub.setAttribute('role', 'img');
                sub.setAttribute('aria-label', r.key + ' broken down by original label: ' +
                    r.breakdown.map(function (b) { return b.label + ' ' + U.pctStr(b.km, subMax); }).join(', '));
                var alphas = [1, 0.66, 0.44, 0.3, 0.22];
                r.breakdown.forEach(function (b, i) {
                    var seg = document.createElement('i');
                    seg.style.width = Math.max(1.2, (b.km || 0) / subMax * 100) + '%';
                    seg.style.background = hexRgba(r.color, alphas[Math.min(i, alphas.length - 1)]);
                    sub.appendChild(seg);
                });
                card.appendChild(sub);
            }

            var chips = document.createElement('div');
            chips.className = 'sc-occ-chips';
            chips.innerHTML = r.breakdown.map(function (b) {
                return '<span><b>' + U.esc(b.label) + '</b> ' + U.plural(b.flights, 'leg') +
                    ' · ' + U.kmShort(b.km) + '</span>';
            }).join('');
            card.appendChild(chips);
            wrap.appendChild(card);
        });
        if (wrap.children.length) fig.appendChild(wrap);

        U.note(fig, 'Three groups at the top level; the original occasion labels are kept ' +
            'underneath, so the Warwick and Yale years stay legible as their own chapter.');
    }

    window.StatsCharts.occasion = {
        render: function (container, data, opts) {
            var U = window.StatsChartUtil;
            U.ensureStyles();
            var model = prepare(data);
            if (!model.rows.length) {
                container.textContent = '';
                var p = document.createElement('p');
                p.className = 'sc-note';
                p.textContent = 'No occasion data available.';
                container.appendChild(p);
                return;
            }
            U.responsive(container, function (host, W) { draw(host, W, model, opts || {}); });
        }
    };
})();

/* assets/js/stats/charts/cities.js
 *
 * Cities (airports) by total distance flown — the ranking Patrick asked for.
 * Bar length encodes total km; leg count and country ride alongside as context.
 *
 * Data: window.FlightMetrics.citiesByDistance(legs, n)
 *       -> [{ city, country, km, flights }]
 *
 * Plain global script. Registers window.StatsCharts.cities.
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

    /* staggered grow-in; the path already holds its final geometry */
    function grow(node, i) {
        node.setAttribute('class', 'sc-grow');
        node.style.animationDelay = (i * 45) + 'ms';
        return node;
    }

    function countryOf(d) {
        var c = d && d.country;
        if (!c || c === 'Unknown' || c === 'XXX') return null;
        return String(c);
    }

    function draw(host, W, rows, opts) {
        var U = window.StatsChartUtil;
        var narrow = W < 540;
        var max = Math.max.apply(null, rows.map(function (d) { return d.km || 0; }).concat([1]));
        var maxLegs = Math.max.apply(null, rows.map(function (d) { return d.flights || 0; }).concat([1]));

        var textCol = U.token('--text');
        var dimCol = U.token('--text-dim');
        var faintCol = U.token('--text-faint');
        var borderCol = U.token('--border');

        var fig = U.figure(host, 'Cities ranked by total distance flown through them');

        var RANK_W = narrow ? 24 : 30;
        var GAP = 10;
        var rowH = narrow ? 48 : 34;
        var barH = narrow ? 9 : 13;
        var headH = narrow ? 20 : 22;
        var H = headH + rowH * rows.length + 4;

        var citySize = narrow ? 12.5 : 13;
        var metaSize = narrow ? 11 : 12;

        var tipStr = U.km(max);
        var tipReserve = narrow ? 0 : Math.ceil(U.measure(tipStr, metaSize, 600)) + 14;
        var legStr = U.plural(maxLegs, 'leg');
        var legW = narrow ? 0 : Math.ceil(U.measure(legStr, metaSize, 400)) + 6;
        var labelW = narrow
            ? W - RANK_W
            : Math.max(120, Math.min(260, Math.round(W * 0.30)));
        var trackX = RANK_W + labelW + GAP;
        var trackW = narrow
            ? Math.max(60, W - RANK_W)
            : Math.max(60, W - trackX - tipReserve - legW - GAP);

        var svg = U.svgRoot(fig, W, H,
            'Cities by total distance',
            'Horizontal bars ranked by the total distance of every leg touching each city; ' +
            'leg count and country shown alongside.');
        var fill = U.barGradient(svg, U.uid('citygrad'));

        U.el(svg, 'text', {
            x: 0, y: headH - 8, fill: faintCol, 'font-size': 10.5, 'letter-spacing': '0.08em'
        }, 'CITY');
        if (!narrow) {
            U.el(svg, 'text', {
                x: W, y: headH - 8, fill: faintCol, 'font-size': 10.5,
                'text-anchor': 'end', 'letter-spacing': '0.08em'
            }, 'LEGS');
        }
        U.el(svg, 'line', {
            x1: 0, x2: W, y1: headH - 2, y2: headH - 2, stroke: borderCol, 'stroke-width': 1
        });

        rows.forEach(function (d, i) {
            var top = headH + i * rowH;
            var g = U.el(svg, 'g');
            var bw = Math.max(2, trackW * ((d.km || 0) / max));
            var country = countryOf(d);
            var city = String(d.city == null ? '—' : d.city);

            U.el(g, 'text', {
                x: 0, y: top + (narrow ? 13 : rowH / 2 + 4),
                fill: faintCol, 'font-size': narrow ? 11 : 12
            }, String(i + 1));

            /* city (bright) + country (dim) on one line, truncated to the column */
            var cityW = U.measure(city, citySize, 500);
            var cFitted = U.fit(city, labelW - 2, citySize, 500);
            var tx = U.el(g, 'text', {
                x: RANK_W, y: top + (narrow ? 13 : rowH / 2 + 4.5),
                'font-size': citySize
            });
            U.el(tx, 'tspan', { fill: textCol, 'font-weight': 500 }, cFitted.text);
            if (country && !cFitted.truncated) {
                var room = labelW - 2 - cityW - 7;
                var cf = U.fit(country, room, metaSize, 400);
                if (room > 26) {
                    U.el(tx, 'tspan', {
                        fill: faintCol, 'font-size': metaSize, dx: 7
                    }, cf.text);
                }
            }

            if (narrow) {
                U.el(g, 'text', {
                    x: RANK_W, y: top + 29, fill: dimCol, 'font-size': metaSize
                    /* the country already rides beside the city name above —
                       repeating it here read as duplicated text at 390px */
                }, U.km(d.km) + ' · ' + U.plural(d.flights, 'leg'));
                grow(U.el(g, 'path', {
                    d: U.hBarPath(RANK_W, top + 34, bw, barH, 4), fill: fill
                }), i);
            } else {
                grow(U.el(g, 'path', {
                    d: U.hBarPath(trackX, top + (rowH - barH) / 2, bw, barH, 4),
                    fill: fill
                }), i);
                U.el(g, 'text', {
                    x: trackX + bw + 8, y: top + rowH / 2 + 4.5,
                    fill: textCol, 'font-size': metaSize, 'font-weight': 600
                }, U.km(d.km));
                U.el(g, 'text', {
                    x: W, y: top + rowH / 2 + 4.5, fill: dimCol,
                    'font-size': metaSize, 'text-anchor': 'end'
                }, U.plural(d.flights, 'leg'));
            }


            var hit = U.el(g, 'rect', { x: 0, y: top, width: W, height: rowH, class: 'sc-hit' });
            U.el(hit, 'title', {}, city + (country ? ', ' + country : ''));
            U.hover(hit, function () {
                return '<b>' + U.esc(city) + '</b>' +
                    (country ? ' <i>' + U.esc(country) + '</i>' : '') +
                    '<div class="sc-tip-rows">' +
                    '<span><i>Total distance</i></span><span>' + U.km(d.km) + '</span>' +
                    '<span><i>Legs</i></span><span>' + U.nf(d.flights) + '</span>' +
                    '<span><i>Average leg</i></span><span>' + U.km((d.km || 0) / Math.max(1, d.flights)) + '</span>' +
                    '</div>';
            });
        });

        U.note(fig, 'Distance counts every leg departing from or arriving at the city, ' +
            'so a round trip contributes twice.');
    }

    window.StatsCharts.cities = {
        render: function (container, data, opts) {
            var U = window.StatsChartUtil;
            opts = opts || {};
            var rows = (data || []).filter(function (d) { return d && d.city && (d.km > 0); });
            if (!rows.length) {
                U.ensureStyles();
                container.textContent = '';
                var p = document.createElement('p');
                p.className = 'sc-note';
                p.textContent = 'No city distances available.';
                container.appendChild(p);
                return;
            }
            rows = rows.slice().sort(function (a, b) { return b.km - a.km; }).slice(0, opts.max || 8);
            U.responsive(container, function (host, W) { draw(host, W, rows, opts); });
        }
    };
})();

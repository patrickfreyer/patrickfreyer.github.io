/* ==========================================================================
   stats-page.js — orchestrator for /flights/stats/

   Jekyll globals -> FlightData.normalize -> FlightMetrics.* -> StatsCharts.*

   Renders the KPI figures, the scale strip and the records section itself
   (those are DOM, not charts) and dispatches everything else to the chart
   modules. Every external module is treated as optional: a missing or broken
   one degrades to a placeholder in its own panel and a console warning. One
   absent module must never blank the page.

   Loaded as a plain global script, after d3 and the stats modules.
   ========================================================================== */

(function () {
    'use strict';

    var LOG = '[stats-page]';
    var EARTH_EQUATOR_KM = 40075;
    var MOON_KM = 384400;

    /* ---------------------------------------------------------------- utils */

    function $(id) { return document.getElementById(id); }

    function warn() {
        var args = Array.prototype.slice.call(arguments);
        args.unshift(LOG);
        console.warn.apply(console, args);
    }

    function isNum(v) { return typeof v === 'number' && isFinite(v); }

    function firstNum() {
        for (var i = 0; i < arguments.length; i++) {
            var v = Number(arguments[i]);
            if (arguments[i] !== null && arguments[i] !== undefined &&
                arguments[i] !== '' && isFinite(v)) return v;
        }
        return null;
    }

    function firstStr() {
        for (var i = 0; i < arguments.length; i++) {
            var v = arguments[i];
            if (typeof v === 'string' && v.trim()) return v.trim();
        }
        return null;
    }

    // flight-data.js uses 'Unknown' as its sentinel and the source data uses
    // 'XXX'. Neither belongs on screen as if it were a real label.
    function known(s) {
        if (typeof s !== 'string') return null;
        var t = s.trim();
        if (!t || t.toUpperCase() === 'XXX' || t.toLowerCase() === 'unknown') return null;
        return t;
    }

    function esc(s) {
        return String(s === null || s === undefined ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // Visitor-facing copy stays plain; the module-level reason goes to the
    // title attribute and the console so integration can still debug it.
    function placeholder(el, message, detail) {
        if (!el) return;
        el.innerHTML = '<div class="panel-placeholder"' +
            (detail ? ' title="' + esc(detail) + '"' : '') + '>' +
            esc(message) + '</div>';
    }

    /* ------------------------------------------------------- formatting shim

       format.js is written by a different agent, so probe for a few plausible
       names before falling back to a local implementation. Never throw, never
       print "NaN" or "undefined" at the user.                                */

    function fmtFn(names) {
        var F = window.FlightFormat;
        if (!F) return null;
        for (var i = 0; i < names.length; i++) {
            if (typeof F[names[i]] === 'function') return F[names[i]];
        }
        return null;
    }

    function viaFormat(names, args, fallback) {
        var fn = fmtFn(names);
        if (fn) {
            try {
                var out = fn.apply(window.FlightFormat, args);
                if (typeof out === 'string' && out) return out;
                if (isNum(out)) return String(out);
            } catch (err) {
                warn('FlightFormat.' + names[0] + '() threw, using fallback:', err);
            }
        }
        return fallback();
    }

    function fmtInt(v) {
        var n = Number(v);
        if (!isFinite(n)) return '—';
        return viaFormat(['integer', 'int', 'number', 'formatNumber', 'count'], [n], function () {
            return Math.round(n).toLocaleString('en-US');
        });
    }

    function fmtDec(v, digits) {
        var n = Number(v);
        if (!isFinite(n)) return '—';
        var d = digits === undefined ? 1 : digits;
        return viaFormat(['decimal', 'formatDecimal', 'formatNumber', 'number'], [n, d], function () {
            return n.toLocaleString('en-US', {
                minimumFractionDigits: d, maximumFractionDigits: d
            });
        });
    }

    function fmtKm(v) {
        var n = Number(v);
        if (!isFinite(n)) return '—';
        return viaFormat(['km', 'formatKm', 'distance', 'formatDistance'], [n], function () {
            return fmtInt(n) + ' km';
        });
    }

    function fmtLat(lat) {
        var n = Number(lat);
        if (!isFinite(n)) return null;
        return Math.abs(n).toFixed(2) + '° ' + (n >= 0 ? 'N' : 'S');
    }

    function plural(n, one, many) {
        return fmtInt(n) + ' ' + (Math.abs(Number(n)) === 1 ? one : (many || one + 's'));
    }

    /* -------------------------------------------------------------- sparkline

       Small, self-contained SVG sparks so a KPI tile always reads as finished.
       If a dedicated spark chart module turns up it wins.                    */

    var sparkUid = 0;

    function svgWrap(inner, defs) {
        return '<svg viewBox="0 0 100 30" preserveAspectRatio="none" role="presentation" ' +
            'focusable="false">' + (defs || '') + inner + '</svg>';
    }

    function sparkGradient(id) {
        return '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0%" stop-color="#a5b4fc"/>' +
            '<stop offset="100%" stop-color="#667eea" stop-opacity="0.22"/>' +
            '</linearGradient></defs>';
    }

    function sparkBars(values) {
        var vals = (values || []).map(function (v) { return Math.max(0, Number(v) || 0); });
        if (!vals.length) return '';
        var id = 'sk' + (++sparkUid);
        var max = Math.max.apply(null, vals) || 1;
        var step = 100 / vals.length;
        var bw = Math.max(0.7, step * 0.66);
        var bars = vals.map(function (v, i) {
            var h = Math.max(0.8, (v / max) * 30);
            var x = i * step + (step - bw) / 2;
            return '<rect x="' + x.toFixed(2) + '" y="' + (30 - h).toFixed(2) +
                '" width="' + bw.toFixed(2) + '" height="' + h.toFixed(2) +
                '" fill="url(#' + id + ')"/>';
        }).join('');
        return svgWrap(bars, sparkGradient(id));
    }

    function sparkArea(values) {
        var vals = (values || []).map(function (v) { return Math.max(0, Number(v) || 0); });
        if (vals.length < 2) return sparkBars(vals);
        var id = 'sk' + (++sparkUid);
        var max = Math.max.apply(null, vals) || 1;
        var pts = vals.map(function (v, i) {
            return [(i / (vals.length - 1)) * 100, 30 - (v / max) * 29];
        });
        var line = pts.map(function (p, i) {
            return (i ? 'L' : 'M') + p[0].toFixed(2) + ' ' + p[1].toFixed(2);
        }).join(' ');
        var area = line + ' L 100 30 L 0 30 Z';
        return svgWrap(
            '<path d="' + area + '" fill="url(#' + id + ')" opacity="0.5"/>' +
            '<path d="' + line + '" fill="none" stroke="#a5b4fc" stroke-width="1.6" ' +
            'stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>',
            sparkGradient(id)
        );
    }

    // One tick per calendar year in the span; lit if a flight happened that year.
    function sparkTicks(flags) {
        if (!flags || !flags.length) return '';
        var step = 100 / flags.length;
        var bw = Math.max(0.7, step * 0.5);
        return svgWrap(flags.map(function (on, i) {
            var h = on ? 30 : 8;
            var x = i * step + (step - bw) / 2;
            return '<rect x="' + x.toFixed(2) + '" y="' + (30 - h) + '" width="' + bw.toFixed(2) +
                '" height="' + h + '" fill="' + (on ? '#8ea2ff' : 'rgba(148,163,184,0.28)') + '"/>';
        }).join(''));
    }

    function paintSpark(kpiId, markup, emptyNote) {
        var host = $(kpiId);
        var slot = host && host.querySelector('.kpi-spark');
        if (!slot) return;
        if (markup) { slot.innerHTML = markup; }
        else { placeholder(slot, emptyNote || 'no trend data'); }
    }

    /* ----------------------------------------------------- module dispatchers */

    function metric(name, args) {
        var M = window.FlightMetrics;
        if (!M || typeof M[name] !== 'function') {
            warn('FlightMetrics.' + name + '() unavailable');
            return { ok: false, reason: 'FlightMetrics.' + name + '() is not available yet' };
        }
        try {
            return { ok: true, value: M[name].apply(M, args) };
        } catch (err) {
            warn('FlightMetrics.' + name + '() threw:', err);
            return { ok: false, reason: 'FlightMetrics.' + name + '() failed: ' + err.message };
        }
    }

    // A metric can legitimately return an object of arrays (countryCoverage).
    // Treat "every array in it is empty" as nothing to draw, so a panel says so
    // rather than sitting blank at full height.
    function isEmpty(data) {
        if (data === null || data === undefined) return true;
        if (Array.isArray(data)) return data.length === 0;
        if (typeof data !== 'object') return false;
        var arrays = Object.keys(data).map(function (k) { return data[k]; })
            .filter(Array.isArray);
        if (!arrays.length) return false;
        return arrays.every(function (a) { return a.length === 0; });
    }

    function chartModule(names) {
        var C = window.StatsCharts;
        if (!C) return null;
        for (var i = 0; i < names.length; i++) {
            var m = C[names[i]];
            if (m && typeof m.render === 'function') return { name: names[i], mod: m };
        }
        return null;
    }

    var CHART_SPECS = [
        { el: 'chart-cumulative', names: ['cumulative'], metric: 'cumulative', args: [] },
        { el: 'chart-years', names: ['year-bars', 'yearBars', 'years', 'byYear'], metric: 'byYear', args: [] },
        { el: 'chart-pairs', names: ['pairs', 'cityPairs', 'topCityPairs'], metric: 'topCityPairs', args: [12] },
        { el: 'chart-cities', names: ['cities', 'citiesByDistance'], metric: 'citiesByDistance', args: [12] },
        { el: 'chart-heatmap', names: ['heatmap', 'monthYear', 'monthYearHeatmap'], metric: 'monthYearMatrix', args: [] },
        { el: 'chart-airlines', names: ['airlines', 'airlineShare', 'airlineShareOverTime'], metric: 'airlineShareOverTime', args: [] },
        { el: 'chart-occasion', names: ['occasion', 'occasionSplit'], metric: 'occasionSplit', args: [] },
        { el: 'chart-coverage', names: ['coverage', 'countryCoverage'], metric: 'countryCoverage', args: [] }
    ];

    function renderCharts(legs, opts) {
        CHART_SPECS.forEach(function (spec) {
            var el = $(spec.el);
            if (!el) { warn('container #' + spec.el + ' missing from the page'); return; }

            var found = chartModule(spec.names);
            if (!found) {
                placeholder(el, 'This chart is unavailable.',
                    'StatsCharts.' + spec.names[0] + ' did not load');
                warn('StatsCharts.' + spec.names[0] + ' unavailable for #' + spec.el);
                return;
            }

            var m = metric(spec.metric, [legs].concat(spec.args));
            if (!m.ok) { placeholder(el, 'This chart is unavailable.', m.reason); return; }

            if (isEmpty(m.value)) {
                placeholder(el, 'No data to plot yet for this view.');
                return;
            }
            var data = m.value;

            try {
                el.innerHTML = '';
                found.mod.render(el, data, opts);
                if (!el.childNodes.length) {
                    placeholder(el, 'This chart is unavailable.',
                        'StatsCharts.' + found.name + ' rendered nothing');
                    warn('StatsCharts.' + found.name + '.render() produced no output');
                }
            } catch (err) {
                placeholder(el, 'This chart is unavailable.',
                    'StatsCharts.' + found.name + '.render() threw: ' + err.message);
                warn('StatsCharts.' + found.name + '.render() threw:', err);
            }
        });
    }

    /* -------------------------------------------------------------- header */

    function renderHeader(totals, byYear) {
        var el = $('header-range');
        if (!el) return;

        var years = (byYear || []).map(function (r) { return Number(r.year); })
            .filter(isFinite).sort(function (a, b) { return a - b; });

        var from = null, to = null;
        var span = totals && totals.yearSpan;
        if (Array.isArray(span) && span.length >= 2) { from = span[0]; to = span[1]; }
        else if (span && typeof span === 'object') {
            from = firstNum(span.from, span.start, span.min);
            to = firstNum(span.to, span.end, span.max);
        }
        if (from === null && years.length) { from = years[0]; to = years[years.length - 1]; }

        var bits = [];
        if (from !== null && to !== null) bits.push(from + ' – ' + to);
        if (totals && isNum(Number(totals.flights))) bits.push(plural(totals.flights, 'leg'));
        if (totals && isNum(Number(totals.cities))) bits.push(plural(totals.cities, 'city', 'cities'));

        el.innerHTML = bits.length
            ? bits.map(esc).join('<span class="sep">·</span>')
            : 'Flight history';
    }

    /* ----------------------------------------------------------- KPI figures */

    function setKpi(id, value, unit) {
        var host = $(id);
        if (!host) { warn('KPI container #' + id + ' missing from the page'); return; }
        var v = host.querySelector('.kpi-value');
        var u = host.querySelector('.kpi-unit');
        if (v) v.textContent = value;
        if (u && unit) u.textContent = unit;
    }

    function renderKpis(totals, byYear, legs) {
        if (!totals) {
            ['kpi-distance', 'kpi-flights', 'kpi-countries', 'kpi-years'].forEach(function (id) {
                setKpi(id, '—');
                paintSpark(id, null, 'metrics unavailable');
            });
            return;
        }

        setKpi('kpi-distance', fmtInt(totals.km), 'kilometers');
        setKpi('kpi-flights', fmtInt(totals.flights), 'legs logged');

        var countries = firstNum(totals.countries);
        var continents = firstNum(totals.continents);
        setKpi('kpi-countries', countries === null ? '—' : fmtInt(countries),
            continents ? 'across ' + plural(continents, 'continent') : 'landed in');

        setKpi('kpi-years', fmtInt(totals.years), 'with a flight');

        renderSparks(byYear, legs);
    }

    // StatsCharts.sparkline takes a plain array of numbers. The built-ins below
    // are the fallback for when that module has not loaded.
    function renderSparks(byYear, legs) {
        var rows = (byYear || []).slice().sort(function (a, b) {
            return Number(a.year) - Number(b.year);
        });
        var ids = ['kpi-distance', 'kpi-flights', 'kpi-countries', 'kpi-years'];

        if (!rows.length) {
            ids.forEach(function (id) { paintSpark(id, null, 'per-year data unavailable'); });
            return;
        }

        var lo = Number(rows[0].year), hi = Number(rows[rows.length - 1].year);
        var flights = {};
        rows.forEach(function (r) { flights[Number(r.year)] = Number(r.flights) || 0; });

        // One entry per calendar year in the span, so gap years read as gaps.
        var flags = [], y;
        for (y = lo; y <= hi; y++) flags.push(flights[y] > 0);

        var yearsSoFar = [], running = 0;
        flags.forEach(function (on) { if (on) running++; yearsSoFar.push(running); });

        var countries = cumulativeCountries(legs).map(function (p) { return p.y; });

        var specs = [
            { id: 'kpi-distance', label: 'Distance flown per year',
              values: rows.map(function (r) { return Number(r.km) || 0; }), builtin: sparkBars },
            { id: 'kpi-flights', label: 'Flights per year',
              values: rows.map(function (r) { return Number(r.flights) || 0; }), builtin: sparkBars },
            { id: 'kpi-countries', label: 'Countries reached, running total',
              values: countries, builtin: sparkArea,
              empty: 'country data pending enrichment' },
            { id: 'kpi-years', label: 'Years with a flight, running total',
              values: yearsSoFar, builtin: function () { return sparkTicks(flags); } }
        ];

        var spark = chartModule(['sparkline', 'kpiSpark', 'spark']);

        specs.forEach(function (spec) {
            var host = $(spec.id);
            var slot = host && host.querySelector('.kpi-spark');
            if (!slot) return;

            if (!spec.values.length) {
                placeholder(slot, spec.empty || 'no trend data');
                return;
            }
            if (spark) {
                try {
                    slot.innerHTML = '';
                    spark.mod.render(slot, spec.values, { label: spec.label, endDot: true });
                    if (slot.childNodes.length) return;
                } catch (err) {
                    warn('StatsCharts.' + spark.name + ' threw for #' + spec.id +
                        ', falling back to the built-in spark:', err);
                }
            }
            slot.innerHTML = spec.builtin(spec.values);
        });
    }

    // Distinct countries reached, accumulated year by year. Derived here rather
    // than in flight-metrics.js because it exists purely to shape a sparkline.
    function cumulativeCountries(legs) {
        if (!Array.isArray(legs) || !legs.length) return [];
        var byYear = {};
        legs.forEach(function (leg) {
            var y = Number(leg && leg.year);
            if (!isFinite(y)) return;
            [leg.originLoc, leg.destLoc].forEach(function (loc) {
                var c = known(loc && loc.country);
                if (!c) return;
                (byYear[y] = byYear[y] || {})[c] = true;
            });
        });
        var years = Object.keys(byYear).map(Number).sort(function (a, b) { return a - b; });
        if (!years.length) return [];
        var seen = {}, out = [], total = 0;
        years.forEach(function (y) {
            Object.keys(byYear[y]).forEach(function (c) {
                if (!seen[c]) { seen[c] = true; total++; }
            });
            out.push({ x: y, y: total });
        });
        // A single country the whole way through draws as a solid block, which
        // reads as a bug rather than as "not enriched yet".
        return total < 2 ? [] : out;
    }

    /* ------------------------------------------------------------ scale strip */

    function renderScaleStrip(scale, totals) {
        var el = $('scale-strip');
        if (!el) { warn('#scale-strip missing from the page'); return; }

        if (!scale) {
            placeholder(el, 'Distance comparisons are unavailable.',
                'FlightMetrics.scaleComparisons() is not available');
            return;
        }

        var km = totals ? Number(totals.km) : NaN;
        var laps = firstNum(scale.equatorLaps, isFinite(km) ? km / EARTH_EQUATOR_KM : null);
        var moon = firstNum(scale.moonRatio, scale.moon, isFinite(km) ? km / MOON_KM : null);
        var days = firstNum(scale.daysAirborne);
        var hours = firstNum(scale.hoursAirborne);
        if (days === null && hours !== null) days = hours / 24;

        var items = [
            {
                label: 'Around the equator',
                value: laps === null ? '—' : fmtDec(laps, 1),
                unit: '×',
                note: 'One lap is ' + fmtInt(EARTH_EQUATOR_KM) + ' km.'
            },
            {
                label: 'Toward the Moon',
                value: moon === null ? '—' : fmtDec(moon, 1),
                unit: '×',
                note: fmtInt(MOON_KM) + ' km each way.'
            },
            {
                label: 'Time in the air',
                value: days === null ? '—' : fmtDec(days, 0),
                unit: days !== null && Math.round(days) === 1 ? 'day' : 'days',
                note: hours === null
                    ? 'Estimated from distance flown.'
                    : 'About ' + fmtInt(hours) + ' hours, at cruise speed plus half an hour a leg.'
            }
        ];

        el.innerHTML = items.map(function (it) {
            return '<div class="scale-item">' +
                '<div class="scale-label">' + esc(it.label) + '</div>' +
                '<div class="scale-value">' + esc(it.value) +
                '<span class="unit">' + esc(it.unit) + '</span></div>' +
                '<div class="scale-note">' + esc(it.note) + '</div>' +
                '</div>';
        }).join('');
    }

    /* ---------------------------------------------------------------- records */

    function routeLabel(leg) {
        if (!leg) return null;
        var a = firstStr(leg.origin, leg.from, leg.a, leg.originLoc && leg.originLoc.name);
        var b = firstStr(leg.destination, leg.to, leg.b, leg.destLoc && leg.destLoc.name);
        if (a && b) return a + ' → ' + b;
        return firstStr(leg.pair, leg.label, a, b);
    }

    function whenLabel(leg) {
        if (!leg) return null;
        var m = known(leg.monthLabel) || known(leg.month);
        var y = firstNum(leg.year);
        if (m && y !== null) return m + ' ' + y;
        if (y !== null) return String(y);
        return m;
    }

    // records.northernmost / .southernmost may be a place object or a whole leg.
    function placeOf(rec, prefer) {
        if (!rec) return null;
        if (typeof rec === 'string') return { name: rec };

        var direct = firstStr(rec.city, rec.name, rec.location && rec.location.name,
            rec.loc && rec.loc.name);
        if (direct) {
            return {
                name: direct,
                lat: firstNum(rec.lat, rec.latitude, rec.loc && rec.loc.lat),
                country: known(rec.country) || known(rec.loc && rec.loc.country),
                year: firstNum(rec.year)
            };
        }

        var candidates = [rec.originLoc, rec.destLoc].filter(Boolean);
        if (!candidates.length) return null;
        candidates.sort(function (a, b) {
            var d = Number(b.lat) - Number(a.lat);
            return prefer === 'south' ? -d : d;
        });
        var c = candidates[0];
        return {
            name: firstStr(c.name), lat: firstNum(c.lat),
            country: known(c.country), year: firstNum(rec.year)
        };
    }

    function card(label, value, sub) {
        return '<div class="record-card">' +
            '<div class="record-label">' + esc(label) + '</div>' +
            '<div class="record-value">' + esc(value || '—') + '</div>' +
            (sub ? '<div class="record-sub">' + esc(sub) + '</div>' : '') +
            '</div>';
    }

    function selfFlownCard(leg, totalFlights) {
        var origin = firstStr(leg && leg.origin, leg && leg.originLoc && leg.originLoc.name, 'Seattle');
        var when = whenLabel(leg) || 'March 2024';
        var occasion = firstStr(leg && leg.occasionLabel, leg && leg.occasion, 'Pilots License');
        var crew = (leg && Array.isArray(leg.travelers) ? leg.travelers : [])
            .filter(function (t) { return t && t !== 'Patrick'; });

        var companion = crew.length
            ? (crew.length === 1 && crew[0] === 'Sofya'
                ? ', Sofya in the right-hand seat'
                : ', with ' + crew.join(' and '))
            : '';

        var others = firstNum(totalFlights);
        var opener = others !== null
            ? 'All ' + fmtInt(others - 1) + ' other legs in this log were flown by an airline.'
            : 'Every other leg in this log was flown by an airline.';

        var copy = opener + ' This one was flown by Patrick: a training circuit out of ' +
            origin + ' for his pilot’s license' + companion +
            ', touching down exactly where it lifted off. It adds nothing to the total ' +
            'distance and is comfortably the best entry on the list.';

        var chips = [when, occasion, origin + ' → ' + origin, '0 km logged']
            .filter(Boolean)
            .map(function (c) { return '<span class="record-chip">' + esc(c) + '</span>'; })
            .join('');

        return '<div class="record-hero">' +
            '<div class="record-hero-mark">✈️</div>' +
            '<div class="record-hero-body">' +
            '<div class="record-hero-label">The one he flew himself</div>' +
            '<h3 class="record-hero-title">' + esc(origin + ' → ' + origin + ', ' + when) + '</h3>' +
            '<p class="record-hero-copy">' + esc(copy) + '</p>' +
            '<div class="record-hero-meta">' + chips + '</div>' +
            '</div></div>';
    }

    function renderRecords(records, legs, totals) {
        var el = $('records');
        if (!el) { warn('#records missing from the page'); return; }

        var selfFlown = records && records.selfFlown;
        if (!selfFlown && Array.isArray(legs)) {
            selfFlown = legs.filter(function (l) { return l && l.isSelfFlown; })[0] || null;
        }

        if (!records) {
            var only = selfFlown
                ? '<div class="records-grid">' + selfFlownCard(selfFlown, totals && totals.flights) + '</div>'
                : '';
            el.innerHTML = '<div class="panel-placeholder" ' +
                'title="FlightMetrics.records() is not available">' +
                'Records are unavailable.</div>' + only;
            return;
        }

        var html = [];

        var longest = records.longest;
        html.push(card('Longest leg', routeLabel(longest),
            [longest && isNum(Number(longest.km)) ? fmtKm(longest.km) : null, whenLabel(longest)]
                .filter(Boolean).join(' · ')));

        var shortest = records.shortest;
        html.push(card('Shortest leg', routeLabel(shortest),
            [shortest && isNum(Number(shortest.km)) ? fmtKm(shortest.km) : null, whenLabel(shortest)]
                .filter(Boolean).join(' · ')));

        var big = records.biggestYear;
        html.push(card('Busiest year',
            big ? String(firstNum(big.year, big) || '—') : null,
            big ? [isNum(Number(big.flights)) ? plural(big.flights, 'leg') : null,
                isNum(Number(big.km)) ? fmtKm(big.km) : null].filter(Boolean).join(' · ') : ''));

        var north = placeOf(records.northernmost, 'north');
        html.push(card('Northernmost', north && north.name,
            [north && fmtLat(north.lat), north && north.country].filter(Boolean).join(' · ')));

        var south = placeOf(records.southernmost, 'south');
        html.push(card('Southernmost', south && south.name,
            [south && fmtLat(south.lat), south && south.country].filter(Boolean).join(' · ')));

        if (totals && isNum(Number(totals.airlines))) {
            html.push(card('Airlines flown', fmtInt(totals.airlines), 'distinct carriers'));
        } else if (totals && isNum(Number(totals.cities))) {
            html.push(card('Cities touched', fmtInt(totals.cities), 'distinct cities in the log'));
        }

        if (selfFlown) html.push(selfFlownCard(selfFlown, totals && totals.flights));
        else warn('no self-flown leg found; the pilot-license callout is omitted');

        el.innerHTML = '<div class="records-grid">' + html.join('') + '</div>';
    }

    /* ------------------------------------------------------------------ notice */

    function notice(message) {
        var page = document.querySelector('.stats-page');
        var header = document.querySelector('.stats-header');
        if (!page) return;
        var div = document.createElement('div');
        div.className = 'stats-notice';
        div.innerHTML = '<span aria-hidden="true">⚠️</span><span>' + esc(message) + '</span>';
        if (header && header.nextSibling) page.insertBefore(div, header.nextSibling);
        else page.appendChild(div);
    }

    /* -------------------------------------------------------------------- boot */

    var state = { legs: [], opts: null, lastWidth: 0 };

    function chartOpts(routes) {
        var colorMap = null;
        try {
            if (window.FV && typeof window.FV.airlineColorMap === 'function') {
                colorMap = window.FV.airlineColorMap(routes || []);
            }
        } catch (err) { warn('could not build the airline color map:', err); }

        var css = getComputedStyle(document.documentElement);
        var token = function (n, fallback) {
            var v = css.getPropertyValue(n);
            return (v && v.trim()) || fallback;
        };

        return {
            colorMap: colorMap,
            colorFor: function (airline) {
                if (!colorMap) return token('--accent-a', '#667eea');
                return window.FV.colorFor(airline, colorMap);
            },
            format: window.FlightFormat || null,
            width: window.innerWidth,
            compact: window.innerWidth < 640,
            theme: {
                bg: token('--bg', '#0a0e1a'),
                panel: token('--panel', 'rgba(255,255,255,0.03)'),
                border: token('--border', 'rgba(255,255,255,0.08)'),
                text: token('--text', '#e5e7eb'),
                textDim: token('--text-dim', '#94a3b8'),
                textFaint: token('--text-faint', '#64748b'),
                accentA: token('--accent-a', '#667eea'),
                accentB: token('--accent-b', '#764ba2'),
                grid: token('--grid-line', 'rgba(255,255,255,0.06)')
            }
        };
    }

    // The page declares its Jekyll data with `const`, which lands in the global
    // lexical environment and is therefore NOT a property of window. It has to
    // be read by bare identifier, exactly as flight-map.js and flight-network.js
    // do; the window.* lookup is only a fallback for a `var`-style host page.
    function jekyllGlobal(name) {
        try {
            /* eslint-disable-next-line no-undef */
            if (name === 'flightRoutesData') return flightRoutesData;
            /* eslint-disable-next-line no-undef */
            if (name === 'locationsData') return locationsData;
        } catch (err) { /* not declared on this page */ }
        return window[name];
    }

    function boot() {
        var routes = jekyllGlobal('flightRoutesData');
        var locations = jekyllGlobal('locationsData');

        if (!Array.isArray(routes) || !routes.length) {
            warn('flightRoutesData is missing or empty');
            notice('Flight data did not load, so this page has nothing to show.');
            renderKpis(null);
            renderScaleStrip(null);
            renderRecords(null, [], null);
            renderCharts([], chartOpts([]));
            return;
        }

        if (!Array.isArray(locations)) {
            warn('locationsData is missing; distances cannot be computed');
            locations = [];
        }

        var legs = [];
        var FD = window.FlightData;
        if (FD && typeof FD.normalize === 'function') {
            try {
                var res = FD.normalize(routes, locations) || {};
                legs = Array.isArray(res.legs) ? res.legs : [];
                (res.warnings || []).forEach(function (w) { warn('data:', w); });
            } catch (err) {
                warn('FlightData.normalize() threw:', err);
                notice('Flight data could not be prepared, so the figures below are unavailable.');
            }
        } else {
            warn('FlightData.normalize() unavailable');
            notice('The flight-data module has not loaded, so the figures below are unavailable.');
        }

        // Deliberately no local fallback normalization: a page of confidently
        // wrong numbers is worse than a page of honest placeholders. Zeros are
        // a number too, so an empty leg set renders as unavailable, not as 0 km.
        if (!legs.length) {
            warn('normalization produced no legs; rendering the unavailable state');
            if (!document.querySelector('.stats-notice')) {
                notice('Flight data could not be prepared, so the figures below are unavailable.');
            }
            renderHeader(null, []);
            renderKpis(null);
            renderScaleStrip(null);
            renderRecords(null, [], null);
            renderCharts([], chartOpts(routes));
            return;
        }

        state.legs = legs;
        state.opts = chartOpts(routes);
        state.lastWidth = window.innerWidth;

        var totals = metric('totals', [legs]);
        var scale = metric('scaleComparisons', [legs]);
        var byYear = metric('byYear', [legs]);
        var records = metric('records', [legs]);

        var totalsVal = totals.ok ? totals.value : null;
        var byYearVal = byYear.ok && Array.isArray(byYear.value) ? byYear.value : [];

        renderHeader(totalsVal, byYearVal);
        renderKpis(totalsVal, byYearVal, legs);
        renderScaleStrip(scale.ok ? scale.value : null, totalsVal);
        renderRecords(records.ok ? records.value : null, legs, totalsVal);
        renderCharts(legs, state.opts);

        state.rerender = function () {
            state.opts = chartOpts(routes);
            renderKpis(totalsVal, byYearVal, legs);
            renderCharts(legs, state.opts);
        };
    }

    var resizeTimer = null;
    window.addEventListener('resize', function () {
        if (!state.rerender) return;
        // Width only: mobile browsers fire resize on scroll as the URL bar hides.
        if (window.innerWidth === state.lastWidth) return;
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
            state.lastWidth = window.innerWidth;
            try { state.rerender(); }
            catch (err) { warn('re-render after resize failed:', err); }
        }, 200);
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();

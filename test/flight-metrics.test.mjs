// node --test test/
//
// Asserts every row of the verified-baseline table in
// docs/superpowers/specs/2026-08-02-flight-stats-redesign-design.md against the
// REAL _data/*.yaml, so a future data edit that breaks a metric fails loudly.
//
// The site has no node_modules of its own. YAML is read with js-yaml when it can
// be resolved from a sibling scratch install; otherwise a minimal parser for
// these two flat files takes over (both paths are cross-checked below when
// js-yaml is available).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(HERE, '..');

const FlightData = require(path.join(SITE, 'assets/js/stats/flight-data.js'));
const FlightMetrics = require(path.join(SITE, 'assets/js/stats/flight-metrics.js'));
const FlightFormat = require(path.join(SITE, 'assets/js/stats/format.js'));

// ---------------------------------------------------------------- YAML loading

const JS_YAML_CANDIDATES = [
    'js-yaml',
    path.resolve(SITE, '../geotest/node_modules/js-yaml'),
    path.resolve(SITE, 'node_modules/js-yaml')
];

function loadJsYaml() {
    for (const c of JS_YAML_CANDIDATES) {
        try { return require(c); } catch (_) { /* keep looking */ }
    }
    return null;
}

// Minimal parser for the two flat "list of maps" YAML files in _data/. Handles
// `- key: value` / `  key: value`, quoted strings, numbers, and inline flow
// arrays. Full-line `#` comments and `### 2000` year separators are skipped.
function parseFlatYamlList(text) {
    const out = [];
    let cur = null;
    for (const raw of text.split('\n')) {
        const line = raw.replace(/\s+$/, '');
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        let body = t;
        if (t.startsWith('- ')) { cur = {}; out.push(cur); body = t.slice(2).trim(); }
        if (!cur) continue;
        const i = body.indexOf(':');
        if (i === -1) continue;
        cur[body.slice(0, i).trim()] = parseScalar(body.slice(i + 1).trim());
    }
    return out;
}

function parseScalar(v) {
    if (v === '' || v === '~' || v === 'null') return null;
    if (v.startsWith('[')) {
        const inner = v.slice(1, v.lastIndexOf(']')).trim();
        if (!inner) return [];
        return inner.split(',').map(s => parseScalar(s.trim()));
    }
    const q = v[0];
    if ((q === '"' || q === "'") && v[v.length - 1] === q) return v.slice(1, -1);
    if (v === 'true') return true;
    if (v === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
    return v;
}

const jsYaml = loadJsYaml();

function readData(name) {
    const text = fs.readFileSync(path.join(SITE, '_data', name), 'utf8');
    return jsYaml ? jsYaml.load(text) : parseFlatYamlList(text);
}

const rawRoutes = readData('flightRoutes.yaml');
const rawLocations = readData('heroLocations.yaml');

const { legs, warnings } = FlightData.normalize(rawRoutes, rawLocations);
const totals = FlightMetrics.totals(legs);
const scale = FlightMetrics.scaleComparisons(legs);
const records = FlightMetrics.records(legs);

// Country/continent enrichment of heroLocations.yaml is a separate workstream.
const ENRICHED = rawLocations.some(l => l && l.country);

function close(actual, expected, tol, label) {
    assert.ok(
        Math.abs(actual - expected) <= tol,
        `${label}: expected ${expected} +/-${tol}, got ${actual}`
    );
}

// ------------------------------------------------------------------ YAML guard

test('fallback YAML parser agrees with js-yaml', { skip: !jsYaml }, () => {
    const routesText = fs.readFileSync(path.join(SITE, '_data/flightRoutes.yaml'), 'utf8');
    const locsText = fs.readFileSync(path.join(SITE, '_data/heroLocations.yaml'), 'utf8');
    assert.deepStrictEqual(parseFlatYamlList(routesText), jsYaml.load(routesText));
    assert.deepStrictEqual(parseFlatYamlList(locsText), jsYaml.load(locsText));
});

// ----------------------------------------------------------------- normalize()

test('normalize: real data resolves cleanly, never NaN', () => {
    assert.equal(rawRoutes.length, 433, 'raw route count');
    assert.equal(legs.length, 433, 'normalized leg count');
    assert.deepEqual(warnings, [], 'no missing-location warnings on real data');
    for (const l of legs) {
        assert.ok(Number.isFinite(l.km), `${l.origin} -> ${l.destination} km must be finite`);
        assert.ok(l.km >= 0, `${l.origin} -> ${l.destination} km must be >= 0`);
        assert.ok(l.originLoc && l.destLoc, `${l.origin} -> ${l.destination} has both endpoints`);
    }
});

test('normalize: airlineLabel maps XXX -> Unknown (case-insensitively)', () => {
    // Case-insensitivity is asserted against the function, not the data: the
    // data originally held 31 'XXX' + 2 lowercase 'xxx' legs and was later
    // normalized to 33 'XXX', so a data-shape assertion here would keep moving.
    // The guarantee that matters is that either spelling collapses to Unknown.
    assert.equal(FlightData.airlineLabelOf('XXX'), 'Unknown');
    assert.equal(FlightData.airlineLabelOf('xxx'), 'Unknown');
    assert.equal(FlightData.airlineLabelOf('xXx'), 'Unknown');
    assert.equal(FlightData.airlineLabelOf(''), 'Unknown');
    assert.equal(FlightData.airlineLabelOf(undefined), 'Unknown');
    assert.equal(FlightData.airlineLabelOf('Lufthansa'), 'Lufthansa');

    const unknown = legs.filter(l => l.airlineLabel === 'Unknown');
    assert.equal(unknown.length, 33, 'all 33 placeholder-airline legs collapse to Unknown');
    for (const l of unknown) {
        assert.equal(String(l.airline).toUpperCase(), 'XXX',
            'the only Unknown-airline source value is the XXX placeholder');
    }
    assert.ok(!legs.some(l => l.airlineLabel === 'XXX' || l.airlineLabel === 'xxx'),
        'no leg is labelled XXX/xxx');
});

test('normalize: unparseable month -> null monthLabel / monthIndex', () => {
    const xxxMonth = legs.filter(l => l.month === 'XXX');
    assert.equal(xxxMonth.length, 12, '12 legs carry month XXX');
    for (const l of xxxMonth) {
        assert.equal(l.monthLabel, null);
        assert.equal(l.monthIndex, null);
    }
    // The Denver -> Toronto 2025 leg has the literal value "Air Canada" in the
    // month field. Whether or not the source-data fix has landed, it must never
    // surface as a month label.
    assert.ok(!legs.some(l => l.monthLabel === 'Air Canada'), 'no leg labelled Air Canada');
    for (const l of legs) {
        const validName = FlightFormat.MONTHS.includes(l.month);
        assert.equal(l.monthIndex === null, !validName,
            `${l.origin} -> ${l.destination} month "${l.month}": monthIndex null iff not a month name`);
    }
});

test('normalize: self-loop and self-flown flags', () => {
    const loops = legs.filter(l => l.isSelfLoop);
    assert.equal(loops.length, 1, 'exactly one self-loop');
    assert.equal(loops[0].origin, 'Seattle');
    assert.equal(loops[0].km, 0, 'self-loop distance is 0, not NaN');
    const selfFlown = legs.filter(l => l.isSelfFlown);
    assert.equal(selfFlown.length, 1);
    assert.equal(selfFlown[0].airline, 'Patrick');
});

test('normalize: occasionGroup taxonomy', () => {
    const g = FlightData.occasionGroupOf;
    assert.equal(g('Work'), 'Work');
    assert.equal(g('Projects'), 'Work');
    assert.equal(g('Warwick'), 'Study');
    assert.equal(g('Yale'), 'Study');
    assert.equal(g('School'), 'Study');
    assert.equal(g('Private'), 'Personal');
    assert.equal(g('Rowing'), 'Personal');
    assert.equal(g('Pilots License'), 'Personal');
    assert.equal(g(undefined), 'Unknown');
    assert.equal(g(''), 'Unknown');
    for (const l of legs) {
        assert.ok(['Work', 'Study', 'Personal', 'Unknown'].includes(l.occasionGroup));
        assert.equal(typeof l.occasionLabel, 'string');
    }
});

test('normalize: haversine uses R = 6371 and is symmetric', () => {
    assert.equal(FlightData.EARTH_RADIUS_KM, 6371);
    const a = { lat: 40.7128, lon: -74.0060 };  // New York
    const b = { lat: 22.3193, lon: 114.1694 };  // Hong Kong
    close(FlightData.haversine(a, b), 12955, 1, 'New York -> Hong Kong haversine');
    close(FlightData.haversine(a, b), FlightData.haversine(b, a), 1e-9, 'symmetry');
    assert.equal(FlightData.haversine(a, a), 0, 'identical coords -> 0');
});

// ---------------------------------------- graceful degradation (required)

test('normalize: unknown city is excluded with a warning, never NaN', () => {
    const originalWarn = console.warn;
    const captured = [];
    console.warn = (...args) => captured.push(args.join(' '));
    let result;
    try {
        result = FlightData.normalize([
            { origin: 'Munich', destination: 'Denver', airline: 'Lufthansa', year: 2025, month: 'May', occasion: 'Work' },
            { origin: 'Munich', destination: 'Atlantis', airline: 'Lufthansa', year: 2025, month: 'May', occasion: 'Work' }
        ], rawLocations);
    } finally {
        console.warn = originalWarn;
    }

    assert.equal(result.legs.length, 1, 'the resolvable leg survives');
    assert.equal(result.excluded.length, 1, 'the unresolvable leg is excluded');
    assert.equal(result.excluded[0].destination, 'Atlantis');
    assert.ok(result.warnings.length >= 1, 'a warning is returned');
    assert.ok(result.warnings.some(w => w.type === 'missing-location' && w.cities.includes('Atlantis')));
    assert.ok(captured.some(m => m.includes('Atlantis')), 'console.warn was called for Atlantis');

    const t = FlightMetrics.totals(result.legs);
    assert.ok(Number.isFinite(t.km), 'total km stays finite');
    assert.ok(!Number.isNaN(t.km));
    assert.equal(t.flights, 1);
    for (const l of result.legs) assert.ok(Number.isFinite(l.km));
});

// -------------------------------------------------------------------- totals()

test('totals: baseline distance, legs, cities, years', () => {
    close(totals.km, 1235077, 1, 'total distance km');
    assert.equal(totals.flights, 433, 'legs');
    assert.equal(totals.cities, 98, 'distinct cities');
    assert.equal(totals.years, 21, 'distinct years');
    assert.equal(totals.yearSpan.min, 2000, 'first year');
    assert.equal(totals.yearSpan.max, 2026, 'last year');
});

// RE-BASELINED 2026-08-03. The spec's table says "Distinct airlines | 44".
// That row is now stale: after this suite flagged three spelling duplicates,
// the source data was deliberately deduped -- AerLingus + Air Lingus -> Aer
// Lingus, Saudi -> Saudia, xxx -> XXX. Raw distinct values went 44 -> 41 and
// real airlines 42 -> 40. The numbers below are the post-dedupe ground truth,
// re-verified against the YAML; nothing has been loosened. Omanair and Ryanair
// are genuinely different carriers and are deliberately NOT merged.
test('totals: 41 distinct airline values / 40 real airlines after dedupe', () => {
    const distinct = new Set(legs.map(l => l.airline));
    assert.equal(distinct.size, 41, 'distinct raw airline values');
    const labelled = new Set(legs.map(l => l.airlineLabel).filter(a => a !== 'Unknown'));
    assert.equal(labelled.size, 40, 'rankable airline labels');
    assert.ok(labelled.has('Lufthansa') && labelled.has('Patrick'));
    // The dedupe must not have re-introduced the old spellings or merged the
    // two genuinely-distinct lookalike carriers.
    for (const gone of ['AerLingus', 'Air Lingus', 'Saudi', 'xxx']) {
        assert.ok(!distinct.has(gone), `duplicate spelling "${gone}" should be gone`);
    }
    assert.ok(labelled.has('Aer Lingus') && labelled.has('Saudia'), 'merged targets present');
    assert.ok(labelled.has('Omanair') && labelled.has('Ryanair'),
        'Omanair and Ryanair are different airlines and must both survive');
});

test('totals: country / continent enrichment', () => {
    if (!ENRICHED) {
        // heroLocations.yaml has no country field yet; degrade, do not crash.
        assert.equal(totals.countries, 0, 'countries degrade to 0 pre-enrichment');
        assert.equal(totals.continents, 0, 'continents degrade to 0 pre-enrichment');
        const cov = FlightMetrics.countryCoverage(legs);
        assert.deepEqual(cov.countries, []);
        assert.deepEqual(cov.continents, []);
        return;
    }
    assert.ok(totals.countries >= 40 && totals.countries <= 55,
        `distinct countries should be ~46, got ${totals.countries}`);
    assert.ok(totals.continents >= 4 && totals.continents <= 7,
        `distinct continents should be 5-6, got ${totals.continents}`);
    const cov = FlightMetrics.countryCoverage(legs);
    assert.equal(cov.countries.length, totals.countries, 'coverage countries match totals');
    assert.equal(cov.continents.length, totals.continents, 'coverage continents match totals');
    for (const c of cov.countries) {
        assert.ok(Number.isFinite(c.km) && c.km >= 0);
        assert.ok(c.flights > 0);
    }
});

// ----------------------------------------------------------- scaleComparisons()

test('scaleComparisons: equator laps, moon ratio, hours airborne', () => {
    close(scale.equatorLaps, 30.8, 0.1, 'equator laps');
    close(scale.moonRatio, 3.2, 0.1, 'distance to the Moon');
    close(scale.hoursAirborne, 1760, 5, 'estimated hours airborne');
    close(scale.daysAirborne, 1760 / 24, 5 / 24, 'estimated days airborne');
    close(scale.daysAirborne * 24, scale.hoursAirborne, 1e-9, 'days/hours consistency');
});

// -------------------------------------------------------------------- records()

test('records: longest leg is New York -> Hong Kong, 12,955 km, 2024', () => {
    const l = records.longest;
    assert.ok(l, 'longest exists');
    assert.deepEqual([l.origin, l.destination].sort(), ['Hong Kong', 'New York']);
    close(l.km, 12955, 1, 'longest leg km');
    assert.equal(l.year, 2024, 'longest leg year');
});

test('records: shortest excludes self-loops', () => {
    const s = records.shortest;
    assert.ok(s, 'shortest exists');
    assert.equal(s.isSelfLoop, false, 'shortest must not be a self-loop');
    assert.ok(s.km > 0, `shortest km must be > 0, got ${s.km}`);
    // Sanity: it really is the minimum among non-self-loops.
    const min = Math.min(...legs.filter(l => !l.isSelfLoop).map(l => l.km));
    close(s.km, min, 1e-9, 'shortest is the true non-self-loop minimum');
});

test('records: northernmost Reykjavik, southernmost Montevideo', () => {
    assert.equal(records.northernmost.name, 'Reykjavik');
    close(records.northernmost.lat, 64.15, 0.02, 'Reykjavik latitude');
    assert.equal(records.southernmost.name, 'Montevideo');
    close(records.southernmost.lat, -34.90, 0.02, 'Montevideo latitude');
});

test('records: biggest year is 2025 with 77 legs and 238,885 km', () => {
    assert.equal(records.biggestYear.year, 2025);
    assert.equal(records.biggestYear.flights, 77, 'legs in 2025');
    close(records.biggestYear.km, 238885, 1, '2025 distance');
});

test('records: selfFlown surfaces the Seattle 2024 pilot-license leg', () => {
    const s = records.selfFlown;
    assert.ok(s, 'selfFlown exists');
    assert.equal(s.origin, 'Seattle');
    assert.equal(s.destination, 'Seattle');
    assert.equal(s.year, 2024);
    assert.equal(s.airline, 'Patrick');
    assert.equal(s.occasion, 'Pilots License');
    assert.equal(s.isSelfFlown, true);
    assert.equal(s.isSelfLoop, true);
    assert.equal(s.km, 0);
});

// ------------------------------------------------------------------- rankings

test('topCityPairs: top count is 19, tied between DUS-MUC and DEN-NYC', () => {
    const top = FlightMetrics.topCityPairs(legs, 10);
    assert.equal(top[0].flights, 19, 'top pair leg count');
    const nineteens = top.filter(p => p.flights === 19).map(p => p.pair);
    assert.equal(nineteens.length, 2, 'exactly two pairs at 19 legs');
    assert.ok(nineteens.includes('Düsseldorf <-> Munich'), 'Düsseldorf <-> Munich is in the tie');
    assert.ok(nineteens.includes('Denver <-> New York'), 'Denver <-> New York is in the tie');
    for (const p of top) {
        assert.notEqual(p.a, p.b, 'a self-loop is not a city pair');
        assert.ok(Number.isFinite(p.km) && p.km > 0);
    }
    // Ranked descending by leg count.
    for (let i = 1; i < top.length; i++) assert.ok(top[i - 1].flights >= top[i].flights);
});

test('citiesByDistance: Frankfurt leads with 391,328 km across 87 legs', () => {
    const top = FlightMetrics.citiesByDistance(legs, 5);
    assert.equal(top[0].city, 'Frankfurt');
    close(top[0].km, 391328, 1, 'Frankfurt total distance');
    assert.equal(top[0].flights, 87, 'legs touching Frankfurt');
    for (let i = 1; i < top.length; i++) assert.ok(top[i - 1].km >= top[i].km, 'ranked by km desc');
});

test('occasionSplit: Work 249, Study 29, Personal 155 (154 pre-fix)', () => {
    const split = FlightMetrics.occasionSplit(legs);
    const by = Object.fromEntries(split.map(g => [g.group, g]));
    assert.equal(by.Work.flights, 249, 'Work legs');
    assert.equal(by.Study.flights, 29, 'Study legs');

    // The spec's source-data fix adds occasion: "Private" to the one leg that
    // has no occasion (Cancun -> Frankfurt 2015), moving it from Unknown into
    // Personal. Assert the invariant that holds either way, plus the exact
    // baseline for whichever state _data is in.
    const unknown = by.Unknown ? by.Unknown.flights : 0;
    assert.equal(by.Personal.flights + unknown, 155, 'Personal + Unknown legs');
    assert.equal(by.Personal.flights, unknown === 1 ? 154 : 155,
        `Personal legs (Unknown = ${unknown}; baseline 154 pre-fix, 155 post-fix)`);

    assert.equal(split.reduce((t, g) => t + g.flights, 0), 433, 'groups cover every leg');
    close(split.reduce((t, g) => t + g.km, 0), totals.km, 0.01, 'group km reconciles to total');

    // Original labels stay available for tooltips.
    const workLabels = by.Work.breakdown.map(b => b.label).sort();
    assert.deepEqual(workLabels, ['Projects', 'Work']);
    const studyLabels = by.Study.breakdown.map(b => b.label).sort();
    assert.deepEqual(studyLabels, ['School', 'Warwick', 'Yale']);
    for (const g of split) {
        assert.equal(g.breakdown.reduce((t, b) => t + b.flights, 0), g.flights,
            `${g.group} breakdown reconciles`);
    }
});

// ------------------------------------------- unknown-value exclusion rules

test('airlineShareOverTime excludes Unknown airlines but not their distance from totals', () => {
    const rows = FlightMetrics.airlineShareOverTime(legs);
    assert.ok(rows.length > 0);
    assert.ok(!rows.some(r => r.airline === 'Unknown' || r.airline === 'XXX'),
        'no Unknown/XXX airline series');
    const shareKm = rows.reduce((t, r) => t + r.km, 0);
    const unknownKm = legs.filter(l => l.airlineLabel === 'Unknown')
        .reduce((t, l) => t + l.km, 0);
    close(shareKm + unknownKm, totals.km, 0.01, 'known + unknown airline km == total');
    // The placeholder-airline legs stay in the totals even though they are not
    // a rankable series: 33 legs carrying 110,875 km.
    close(unknownKm, 110875, 1, 'Unknown-airline distance still counts toward totals');
    for (const r of rows) assert.ok(Number.isFinite(r.year) && Number.isFinite(r.km));
});

test('monthYearMatrix is a dense grid and never buckets an unknown month', () => {
    const matrix = FlightMetrics.monthYearMatrix(legs);
    assert.equal(matrix.length, (2026 - 2000 + 1) * 12, 'dense year x month grid');
    const nullMonth = legs.filter(l => l.monthIndex === null);
    assert.equal(
        matrix.reduce((t, c) => t + c.flights, 0),
        433 - nullMonth.length,
        `matrix holds every leg with a known month (${nullMonth.length} excluded)`
    );
    for (const c of matrix) {
        assert.ok(c.monthIndex >= 0 && c.monthIndex <= 11, 'monthIndex in range');
        assert.ok(Number.isFinite(c.km) && c.km >= 0);
    }
});

// -------------------------------------------------------------- time series

test('cumulative: chronological, monotonic, reconciles to the total', () => {
    const rows = FlightMetrics.cumulative(legs);
    assert.ok(rows.length > 0);
    close(rows[rows.length - 1].cumulativeKm, totals.km, 0.01, 'final cumulative == total km');
    close(rows[rows.length - 1].cumulativeKm, 1235077, 1, 'final cumulative == baseline');
    for (let i = 1; i < rows.length; i++) {
        assert.ok(rows[i].cumulativeKm >= rows[i - 1].cumulativeKm, 'monotonic non-decreasing');
        const prev = rows[i - 1], cur = rows[i];
        const key = r => r.year * 100 + (r.monthIndex === null ? 12 : r.monthIndex);
        assert.ok(key(cur) > key(prev), 'strictly ordered buckets');
    }
    assert.equal(rows.reduce((t, r) => t + r.flights, 0), 433, 'every leg is in a bucket');
});

test('byYear: 21 rows, ascending, reconciles to the total', () => {
    const rows = FlightMetrics.byYear(legs);
    assert.equal(rows.length, 21, 'one row per year flown');
    for (let i = 1; i < rows.length; i++) assert.ok(rows[i].year > rows[i - 1].year);
    assert.equal(rows.reduce((t, r) => t + r.flights, 0), 433);
    close(rows.reduce((t, r) => t + r.km, 0), totals.km, 0.01, 'year km reconciles');
    const y2025 = rows.find(r => r.year === 2025);
    assert.equal(y2025.flights, 77);
    close(y2025.km, 238885, 1, '2025 km');
});

// ----------------------------------------------------------------- format.js

test('format: numbers, distances, months, ratios, compact', () => {
    assert.equal(FlightFormat.formatNumber(1235077), '1,235,077');
    assert.equal(FlightFormat.formatNumber(433), '433');
    assert.equal(FlightFormat.formatKm(1235077), '1,235,077 km');
    assert.equal(FlightFormat.formatKm(1235077, { unit: false }), '1,235,077');
    assert.equal(FlightFormat.formatKm(NaN), '--');
    assert.equal(FlightFormat.formatCompact(1235077), '1.2M');
    assert.equal(FlightFormat.formatCompact(238885), '239k');
    assert.equal(FlightFormat.formatCompact(877), '877');
    assert.equal(FlightFormat.formatMonth(7), 'August');
    assert.equal(FlightFormat.formatMonth(7, { short: true }), 'Aug');
    assert.equal(FlightFormat.formatMonth('August'), 'August');
    assert.equal(FlightFormat.formatMonth('XXX'), 'Unknown');
    assert.equal(FlightFormat.formatMonth(null), 'Unknown');
    assert.equal(FlightFormat.formatRatio(3.2130006), '3.2x');
    assert.equal(FlightFormat.formatRatio(30.8191, { decimals: 1, suffix: '' }), '30.8');
    assert.equal(FlightFormat.formatPercent(0.4237), '42%');
});

test('format: renders the real headline figures', () => {
    assert.equal(FlightFormat.formatKm(Math.round(totals.km)), '1,235,077 km');
    assert.equal(FlightFormat.formatRatio(scale.equatorLaps, { suffix: '' }), '30.8');
    assert.equal(FlightFormat.formatRatio(scale.moonRatio), '3.2x');
    assert.equal(FlightFormat.formatNumber(Math.round(scale.hoursAirborne)), '1,760');
});

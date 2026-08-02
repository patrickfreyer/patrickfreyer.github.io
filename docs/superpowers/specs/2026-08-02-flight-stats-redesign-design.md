# Flight Statistics Page Redesign

Date: 2026-08-02
Status: approved, ready for implementation

## Goal

Rebuild `/flights/stats/` so it is (a) visually consistent with the globe / map /
network views and (b) substantially richer in content. Today it is a white page
of five generic Chart.js canvases while every sibling view is a dark canvas, and
its headline "Countries Visited" number is wrong.

Out of scope: the globe route-realism work (separate spec), CO2 estimates,
per-flight times or aircraft types (the data has no dates or flight numbers).

## Current state

- `flights/stats.html` — 358 lines: markup plus ~240 lines of inline CSS.
- `js/flight-stats.js` — 725-line `FlightStatsCalculator` class mixing distance
  math, aggregation and Chart.js rendering in a single object.
- Chart.js 4.4.0 from cdnjs. The map and network views instead use D3 v7 from
  jsDelivr as a plain global script; the stats page is the odd one out.

### Known defects this redesign fixes

1. `getUniqueCountries()` (`js/flight-stats.js:213`) counts unique **city**
   names and labels the result "Countries Visited". Munich, Frankfurt, Berlin,
   Hamburg, Cologne, Düsseldorf and Stuttgart each count as a country. Reported
   value ~98; the true figure is ~46.
2. `airline: "XXX"` (31 legs, 108,215 km) ranks 3rd by distance and renders as a
   literal "XXX" airline.
3. `month: "XXX"` on 12 legs (2002, 2004, 2006) pollutes the seasonality chart.
4. `Seattle -> Seattle`, `airline: "Patrick"`, `occasion: "Pilots License"`,
   March 2024 — a genuine self-flown flight, but a 0 km self-loop that would
   otherwise win "shortest flight".
5. `Denver -> Toronto`, 2025, has `month: "Air Canada"` — an airline name typed
   into the month field.
6. `Cancun -> Frankfurt`, Condor, July 2015 has no `occasion` field at all.

## Verified baseline figures

Computed from `_data/flightRoutes.yaml` at 433 legs (2026-08-02). Implementation
must reproduce these.

| Metric | Value |
|---|---|
| Total distance | 1,235,077 km |
| Legs | 433 |
| Distinct cities | 98 |
| Distinct countries | ~46 (confirm after enrichment) |
| Distinct years | 21, spanning 2000-2026 |
| Distinct airlines | 44 |
| Equator laps | 30.8 |
| Distance to the Moon | 3.2x |
| Est. hours airborne | ~1,760 (~73 days) at 800 km/h + 30 min/leg |
| Longest leg | New York -> Hong Kong, 12,955 km (2024) |
| Northernmost | Reykjavik (64.15) |
| Southernmost | Montevideo (-34.90) |
| Biggest year | 2025 — 77 legs, 238,885 km |
| Top pair by legs | Düsseldorf <-> Munich, 19x (also Denver <-> New York, 19x) |
| Top city by distance | Frankfurt, 391,328 km across 87 legs |

## Design decisions

### Visual direction — dark "mission control"

Dark canvas `#0a0e1a`, large glowing numerals, sparkline per KPI tile. Airline
colors are imported from `assets/js/flight-views-common.js` (`BASE_COLORS`) so a
Lufthansa series is the same color here as its arc on the globe.

### Charting — D3 v7

Drop Chart.js. Load D3 v7 from jsDelivr as a global script, matching
`flights-map.html` and `flights-network.html`. Rationale: one less dependency,
full control over dark styling, and the heatmap / ranked-pair visuals are
awkward or impossible in Chart.js.

### Country data — enriched at build time, not derived at runtime

Runtime point-in-polygon against the repo's `countries-110m.json` was prototyped
and **rejected**. At 110m resolution it resolves only 98/106 cities and produces
silent, confident errors on exactly the interesting entries:

| City | Auto-resolved | Correct |
|---|---|---|
| Singapore | Malaysia | Singapore |
| Aruba | Venezuela (nearest) | Aruba |
| Valeta | Italy (nearest) | Malta |
| Mauritius | Madagascar (nearest) | Mauritius |
| Phu Quoc | Cambodia (nearest) | Vietnam |

Instead `tools/enrich-locations.mjs` runs the same resolution **once**, offline,
with a nearest-country fallback; a human verifies all 106 entries with specific
attention to the island and coastal cases; and `country` + `continent` are
committed into `_data/heroLocations.yaml` as plain fields. The page reads the
fields directly. No runtime geo dependency, no resolution artifacts, auditable
in a diff.

### Occasion taxonomy — three groups, original preserved

| Group | Source values | Legs |
|---|---|---|
| Work | Work, Projects | 249 |
| Study | Warwick, Yale, School | 29 |
| Personal | Private, Rowing, Pilots License | 154 |

Charts use the three groups; tooltips show the original label so the Warwick and
Yale years stay legible as a distinct chapter.

### Unknown values — count in totals, exclude from rankings

`airline: XXX` and `month: XXX` legs contribute to total distance and flight
counts (they really happened) but never appear as a ranked airline or a
seasonality bucket. This keeps section totals mutually consistent, which
excluding them outright would break.

### Source data fixes

Applied to `_data/flightRoutes.yaml`, each called out in the commit:

- `Denver -> Toronto` 2025: `month: "Air Canada"` -> `month: "December"`. Its
  return leg `Toronto -> Denver` is United/December 2025 and every Denver-Toronto
  leg in the file is United, so the airline is correct and the month was clobbered.
- `Cancun -> Frankfurt` 2015: add `occasion: "Private"` (Condor holiday route).
  Flagged for Patrick to correct if it was work.
- Pilot-license and XXX entries are left untouched — they are genuine.

## Architecture

```
flights/stats.html              markup + Jekyll data injection only
assets/css/flight-stats.css     dark theme, extracted from inline
assets/js/stats/
  flight-data.js      normalization -> enriched legs
  flight-metrics.js   pure metric functions, zero DOM
  format.js           number / unit / label formatting
  charts/
    cumulative.js  year-bars.js  heatmap.js  pairs.js
    cities.js      airlines.js   occasion.js  coverage.js
  stats-page.js       orchestrator: data -> metrics -> charts
tools/enrich-locations.mjs      offline location enrichment
test/flight-metrics.test.mjs    node --test assertions on the table above
```

Splitting pure computation from rendering is the central move: `flight-metrics.js`
is directly testable and every chart becomes a thin renderer.

### Interface contract

Modules are plain globals (matching `flight-views-common.js`), loaded in order.

`window.FlightData.normalize(routes, locations) -> { legs, warnings }`

```js
leg = {
  origin, destination, airline, year, month, occasion, travelers,  // raw
  km,             // great-circle; 0 for self-loops
  airlineLabel,   // 'XXX' -> 'Unknown'
  monthLabel,     // 'XXX' or unparseable -> null
  monthIndex,     // 0-11, or null
  occasionGroup,  // 'Work' | 'Study' | 'Personal' | 'Unknown'
  occasionLabel,  // original value
  isSelfLoop,     // origin === destination
  isSelfFlown,    // airline === 'Patrick'
  originLoc, destLoc  // { name, lat, lon, country, continent }
}
```

A leg whose city is absent from `heroLocations.yaml` is excluded from distance
math and pushed to `warnings` with a console warning — never silently `NaN`.
This is the exact failure mode that would have hit the August Tokyo legs.

`window.FlightMetrics` — all pure, all take the normalized `legs` array:

```js
totals(legs)                 -> { km, flights, countries, continents, cities, years, yearSpan }
scaleComparisons(legs)       -> { equatorLaps, moonRatio, hoursAirborne, daysAirborne }
cumulative(legs)             -> [{ year, monthIndex, km, cumulativeKm }]
byYear(legs)                 -> [{ year, km, flights }]
monthYearMatrix(legs)        -> [{ year, monthIndex, km, flights }]
topCityPairs(legs, n)        -> [{ pair, a, b, flights, km }]
citiesByDistance(legs, n)    -> [{ city, country, km, flights }]
airlineShareOverTime(legs)   -> [{ year, airline, km }]
occasionSplit(legs)          -> [{ group, km, flights, breakdown: [{ label, km, flights }] }]
records(legs)                -> { longest, shortest, northernmost, southernmost, biggestYear, selfFlown }
countryCoverage(legs)        -> { countries: [{ country, continent, flights, km }], continents: [...] }
```

`records.shortest` excludes self-loops. `records.selfFlown` surfaces the
pilot-license leg.

Each chart module exposes `render(containerEl, data, opts)`, owns only its own
SVG, and reads no globals other than `d3` and the shared color map.

## Page layout

1. Hero KPIs — distance, flights, countries, years; sparkline per tile
2. Scale strip — equator laps, distance to the Moon, days airborne
3. Cumulative distance, full width
4. Top city pairs | Cities by total distance
5. Month x year heatmap
6. Airline share over time | Work-Study-Personal split
7. Records — longest, shortest, northernmost, southernmost, biggest year, and a
   callout for the self-flown Seattle flight
8. Country and continent coverage

Responsive: two-up sections collapse to single column under 900px; charts use
viewBox-based scaling rather than fixed pixel heights.

## Testing

The site has no existing test infrastructure. Because `flight-metrics.js` is
pure, add `test/flight-metrics.test.mjs` (`node --test`) asserting every row of
the verified-baseline table, so a future data edit that breaks a metric fails
loudly. Visual QA by headless screenshot at 1440px, 900px and 390px.

## Risks

- **Parallel implementation drift** — four agents building against this contract
  could diverge. Mitigated by the explicit signatures above plus an integration
  pass before deploy.
- **Country enrichment accuracy** — automated resolution is ~93% correct; the
  human verification pass over 106 rows is the actual control, not the script.
- **Deploy is live on push.** GitHub Pages builds `published` straight to
  patrickfreyer.com. Verify locally, push once, confirm the built page.

// Pure metric functions for the flight statistics page. Zero DOM, zero globals
// beyond the module boundary. Every function takes the normalized `legs` array
// produced by FlightData.normalize().
// Plain global script (window.FlightMetrics), also require()-able from Node.
(function (root) {
    'use strict';

    var UNKNOWN = 'Unknown';
    var EQUATOR_KM = 40075;          // WGS84 equatorial circumference
    var MOON_DISTANCE_KM = 384400;   // mean Earth-Moon distance
    var CRUISE_KMH = 800;            // spec: 800 km/h ...
    var TAXI_HOURS = 0.5;            // ... + 30 min per leg

    // ---------------------------------------------------------------- helpers

    function sum(arr, fn) {
        return arr.reduce(function (t, x) { return t + (fn(x) || 0); }, 0);
    }

    // Cities touched by a leg, de-duplicated (a self-loop touches one city).
    function citiesOf(leg) {
        return leg.isSelfLoop ? [leg.originLoc] : [leg.originLoc, leg.destLoc];
    }

    function distinct(legs, fn) {
        var seen = Object.create(null);
        legs.forEach(function (l) {
            var v = fn(l);
            (Array.isArray(v) ? v : [v]).forEach(function (x) {
                if (x !== null && x !== undefined && x !== '') seen[x] = true;
            });
        });
        return Object.keys(seen);
    }

    function isKnownAirline(leg) { return leg.airlineLabel !== UNKNOWN; }

    // Sort helper: descending by `key`, tie-broken by `then` desc then label asc.
    function byDesc(key, then, label) {
        return function (a, b) {
            if (b[key] !== a[key]) return b[key] - a[key];
            if (then && b[then] !== a[then]) return b[then] - a[then];
            if (label) return String(a[label]).localeCompare(String(b[label]));
            return 0;
        };
    }

    function values(map) {
        return Object.keys(map).map(function (k) { return map[k]; });
    }

    // ----------------------------------------------------------------- totals

    // -> { km, flights, countries, continents, cities, years, yearSpan }
    function totals(legs) {
        var years = distinct(legs, function (l) { return l.year; })
            .map(Number).sort(function (a, b) { return a - b; });
        return {
            km: sum(legs, function (l) { return l.km; }),
            flights: legs.length,
            countries: distinct(legs, function (l) {
                return citiesOf(l).map(function (c) { return c.country; });
            }).filter(function (c) { return c !== UNKNOWN; }).length,
            continents: distinct(legs, function (l) {
                return citiesOf(l).map(function (c) { return c.continent; });
            }).filter(function (c) { return c !== UNKNOWN; }).length,
            cities: distinct(legs, function (l) {
                return citiesOf(l).map(function (c) { return c.name; });
            }).length,
            years: years.length,
            yearSpan: years.length
                ? { min: years[0], max: years[years.length - 1], label: years[0] + '-' + years[years.length - 1] }
                : { min: null, max: null, label: '' }
        };
    }

    // -> { equatorLaps, moonRatio, hoursAirborne, daysAirborne }
    function scaleComparisons(legs) {
        var km = sum(legs, function (l) { return l.km; });
        var hours = km / CRUISE_KMH + legs.length * TAXI_HOURS;
        return {
            equatorLaps: km / EQUATOR_KM,
            moonRatio: km / MOON_DISTANCE_KM,
            hoursAirborne: hours,
            daysAirborne: hours / 24
        };
    }

    // -------------------------------------------------------- time series

    // -> [{ year, monthIndex, km, cumulativeKm }] ordered chronologically.
    // Unknown-month legs keep their km (totals must reconcile) and sort last
    // within their year, carrying monthIndex: null.
    function cumulative(legs) {
        var buckets = {};
        legs.forEach(function (l) {
            var key = l.year + '|' + (l.monthIndex === null ? 'x' : l.monthIndex);
            if (!buckets[key]) buckets[key] = { year: l.year, monthIndex: l.monthIndex, km: 0, flights: 0 };
            buckets[key].km += l.km;
            buckets[key].flights += 1;
        });
        var rows = values(buckets).sort(function (a, b) {
            if (a.year !== b.year) return a.year - b.year;
            var am = a.monthIndex === null ? 12 : a.monthIndex;
            var bm = b.monthIndex === null ? 12 : b.monthIndex;
            return am - bm;
        });
        var run = 0;
        return rows.map(function (r) {
            run += r.km;
            return { year: r.year, monthIndex: r.monthIndex, km: r.km, flights: r.flights, cumulativeKm: run };
        });
    }

    // -> [{ year, km, flights }] ascending by year.
    function byYear(legs) {
        var map = {};
        legs.forEach(function (l) {
            if (!map[l.year]) map[l.year] = { year: l.year, km: 0, flights: 0 };
            map[l.year].km += l.km;
            map[l.year].flights += 1;
        });
        return values(map).sort(function (a, b) { return a.year - b.year; });
    }

    // -> [{ year, monthIndex, km, flights }] dense grid across the full year
    // span x 12 months (empty cells are km 0 / flights 0), so a heatmap can
    // render straight from it. Unknown-month legs are never bucketed.
    function monthYearMatrix(legs) {
        var span = totals(legs).yearSpan;
        if (span.min === null) return [];
        var map = {};
        legs.forEach(function (l) {
            if (l.monthIndex === null) return;
            var key = l.year + '|' + l.monthIndex;
            if (!map[key]) map[key] = { year: l.year, monthIndex: l.monthIndex, km: 0, flights: 0 };
            map[key].km += l.km;
            map[key].flights += 1;
        });
        var out = [];
        for (var y = span.min; y <= span.max; y++) {
            for (var m = 0; m < 12; m++) {
                out.push(map[y + '|' + m] || { year: y, monthIndex: m, km: 0, flights: 0 });
            }
        }
        return out;
    }

    // ---------------------------------------------------------- rankings

    // -> [{ pair, a, b, flights, km }] ranked by flights desc, then km desc.
    // Self-loops are not a city pair and are excluded.
    function topCityPairs(legs, n) {
        var map = {};
        legs.forEach(function (l) {
            if (l.isSelfLoop) return;
            var ends = [l.origin, l.destination].sort();
            var key = ends[0] + ' <-> ' + ends[1];
            if (!map[key]) map[key] = { pair: key, a: ends[0], b: ends[1], flights: 0, km: 0 };
            map[key].flights += 1;
            map[key].km += l.km;
        });
        var rows = values(map).sort(byDesc('flights', 'km', 'pair'));
        return n ? rows.slice(0, n) : rows;
    }

    // -> [{ city, country, continent, km, flights }] ranked by km desc.
    // Each leg credits its full distance to both endpoint cities.
    function citiesByDistance(legs, n) {
        var map = {};
        legs.forEach(function (l) {
            citiesOf(l).forEach(function (loc) {
                if (!map[loc.name]) {
                    map[loc.name] = {
                        city: loc.name, country: loc.country, continent: loc.continent,
                        km: 0, flights: 0
                    };
                }
                map[loc.name].km += l.km;
                map[loc.name].flights += 1;
            });
        });
        var rows = values(map).sort(byDesc('km', 'flights', 'city'));
        return n ? rows.slice(0, n) : rows;
    }

    // -> [{ year, airline, km, flights }] long format, Unknown airline excluded.
    function airlineShareOverTime(legs) {
        var map = {};
        legs.filter(isKnownAirline).forEach(function (l) {
            var key = l.year + '|' + l.airlineLabel;
            if (!map[key]) map[key] = { year: l.year, airline: l.airlineLabel, km: 0, flights: 0 };
            map[key].km += l.km;
            map[key].flights += 1;
        });
        return values(map).sort(function (a, b) {
            if (a.year !== b.year) return a.year - b.year;
            if (b.km !== a.km) return b.km - a.km;
            return a.airline.localeCompare(b.airline);
        });
    }

    // -> [{ group, km, flights, breakdown: [{ label, km, flights }] }]
    // Groups ordered Work, Study, Personal, Unknown (only those present).
    function occasionSplit(legs) {
        var ORDER = ['Work', 'Study', 'Personal', UNKNOWN];
        var map = {};
        legs.forEach(function (l) {
            var g = map[l.occasionGroup];
            if (!g) g = map[l.occasionGroup] = { group: l.occasionGroup, km: 0, flights: 0, _b: {} };
            g.km += l.km;
            g.flights += 1;
            var b = g._b[l.occasionLabel];
            if (!b) b = g._b[l.occasionLabel] = { label: l.occasionLabel, km: 0, flights: 0 };
            b.km += l.km;
            b.flights += 1;
        });
        return values(map).map(function (g) {
            return {
                group: g.group, km: g.km, flights: g.flights,
                breakdown: values(g._b).sort(byDesc('flights', 'km', 'label'))
            };
        }).sort(function (a, b) { return ORDER.indexOf(a.group) - ORDER.indexOf(b.group); });
    }

    // ----------------------------------------------------------- records

    // -> { longest, shortest, northernmost, southernmost, biggestYear, selfFlown }
    // `longest` / `shortest` / `selfFlown` are leg objects (or null).
    // `shortest` excludes self-loops (a 0 km Seattle -> Seattle would win).
    // `northernmost` / `southernmost` are location objects + a touch count.
    function records(legs) {
        var real = legs.filter(function (l) { return !l.isSelfLoop; });
        var longest = null, shortest = null;
        real.forEach(function (l) {
            if (!longest || l.km > longest.km) longest = l;
            if (!shortest || l.km < shortest.km) shortest = l;
        });

        var touches = {};
        legs.forEach(function (l) {
            citiesOf(l).forEach(function (loc) {
                if (!touches[loc.name]) touches[loc.name] = { loc: loc, flights: 0 };
                touches[loc.name].flights += 1;
            });
        });
        var north = null, south = null;
        values(touches).forEach(function (t) {
            if (!north || t.loc.lat > north.loc.lat) north = t;
            if (!south || t.loc.lat < south.loc.lat) south = t;
        });
        function asPlace(t) {
            if (!t) return null;
            return {
                name: t.loc.name, city: t.loc.name, lat: t.loc.lat, lon: t.loc.lon,
                country: t.loc.country, continent: t.loc.continent, flights: t.flights
            };
        }

        var yearRows = byYear(legs).slice().sort(byDesc('km', 'flights', 'year'));
        var selfFlown = null;
        legs.forEach(function (l) { if (l.isSelfFlown && !selfFlown) selfFlown = l; });

        return {
            longest: longest,
            shortest: shortest,
            northernmost: asPlace(north),
            southernmost: asPlace(south),
            biggestYear: yearRows.length ? yearRows[0] : null,
            selfFlown: selfFlown
        };
    }

    // -> { countries: [{ country, continent, flights, km }],
    //      continents: [{ continent, countries, flights, km }] }
    // A leg credits its full distance to each distinct country/continent it
    // touches. 'Unknown' entries are dropped (pre-enrichment degradation).
    function countryCoverage(legs) {
        var countries = {};
        var continents = {};
        legs.forEach(function (l) {
            var locs = citiesOf(l);
            var seenC = {}, seenK = {};
            locs.forEach(function (loc) {
                if (loc.country !== UNKNOWN && !seenC[loc.country]) {
                    seenC[loc.country] = true;
                    if (!countries[loc.country]) {
                        countries[loc.country] = {
                            country: loc.country, continent: loc.continent, flights: 0, km: 0
                        };
                    }
                    countries[loc.country].flights += 1;
                    countries[loc.country].km += l.km;
                }
                if (loc.continent !== UNKNOWN && !seenK[loc.continent]) {
                    seenK[loc.continent] = true;
                    if (!continents[loc.continent]) {
                        continents[loc.continent] = {
                            continent: loc.continent, countries: 0, flights: 0, km: 0, _c: {}
                        };
                    }
                    continents[loc.continent].flights += 1;
                    continents[loc.continent].km += l.km;
                    if (loc.country !== UNKNOWN) continents[loc.continent]._c[loc.country] = true;
                }
            });
        });
        return {
            countries: values(countries).sort(byDesc('flights', 'km', 'country')),
            continents: values(continents).map(function (k) {
                return {
                    continent: k.continent, countries: Object.keys(k._c).length,
                    flights: k.flights, km: k.km
                };
            }).sort(byDesc('flights', 'km', 'continent'))
        };
    }

    var api = {
        EQUATOR_KM: EQUATOR_KM,
        MOON_DISTANCE_KM: MOON_DISTANCE_KM,
        CRUISE_KMH: CRUISE_KMH,
        TAXI_HOURS: TAXI_HOURS,
        totals: totals,
        scaleComparisons: scaleComparisons,
        cumulative: cumulative,
        byYear: byYear,
        monthYearMatrix: monthYearMatrix,
        topCityPairs: topCityPairs,
        citiesByDistance: citiesByDistance,
        airlineShareOverTime: airlineShareOverTime,
        occasionSplit: occasionSplit,
        records: records,
        countryCoverage: countryCoverage
    };

    root.FlightMetrics = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

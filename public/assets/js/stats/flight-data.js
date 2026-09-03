// Normalization layer for the flight statistics page.
// Turns raw `flightRoutesData` + `locationsData` into enriched, NaN-free legs.
// Plain global script (window.FlightData), also require()-able from Node.
(function (root) {
    'use strict';

    var EARTH_RADIUS_KM = 6371;
    var UNKNOWN = 'Unknown';

    var MONTHS = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];

    // occasion (raw) -> group. Anything unmapped or missing -> 'Unknown'.
    var OCCASION_GROUPS = {
        'work': 'Work',
        'projects': 'Work',
        'warwick': 'Study',
        'yale': 'Study',
        'school': 'Study',
        'private': 'Personal',
        'rowing': 'Personal',
        'pilots license': 'Personal'
    };

    function toRad(deg) { return deg * Math.PI / 180; }

    // Great-circle distance, R = 6371 km. Returns 0 for identical coordinates.
    function haversine(a, b) {
        var dLat = toRad(b.lat - a.lat);
        var dLon = toRad(b.lon - a.lon);
        var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(s)));
    }

    // Name -> { name, lat, lon, country, continent }. country/continent are
    // added to _data/heroLocations.yaml at build time; absent -> 'Unknown'.
    function locationIndex(locations) {
        var idx = {};
        (locations || []).forEach(function (l) {
            if (!l || !l.name) return;
            idx[l.name] = {
                name: l.name,
                lat: Number(l.lat),
                lon: Number(l.lon),
                country: l.country || UNKNOWN,
                continent: l.continent || UNKNOWN
            };
        });
        return idx;
    }

    function hasCoords(loc) {
        return !!loc && isFinite(loc.lat) && isFinite(loc.lon);
    }

    // 'August' | 'Aug' -> 7. 'XXX', 'Air Canada', '' , null -> null.
    function monthIndexOf(month) {
        if (typeof month === 'number' && month >= 0 && month <= 11) return month;
        if (typeof month !== 'string') return null;
        var needle = month.trim().toLowerCase();
        if (!needle) return null;
        for (var i = 0; i < MONTHS.length; i++) {
            var m = MONTHS[i].toLowerCase();
            if (m === needle || m.slice(0, 3) === needle) return i;
        }
        return null;
    }

    function occasionGroupOf(occasion) {
        if (typeof occasion !== 'string' || !occasion.trim()) return UNKNOWN;
        return OCCASION_GROUPS[occasion.trim().toLowerCase()] || UNKNOWN;
    }

    function airlineLabelOf(airline) {
        if (typeof airline !== 'string' || !airline.trim()) return UNKNOWN;
        var a = airline.trim();
        return a.toUpperCase() === 'XXX' ? UNKNOWN : a;
    }

    /**
     * normalize(routes, locations) -> { legs, warnings, excluded }
     *
     * `legs` contains only fully-resolvable legs, so every `km` is a finite
     * number and downstream metrics can never see NaN. Any leg referencing a
     * city that is missing from `locations` (or that has unusable coordinates)
     * is left out of `legs`, recorded in `excluded`, and reported in `warnings`
     * with a console.warn.
     */
    function normalize(routes, locations) {
        var idx = locationIndex(locations);
        var legs = [];
        var warnings = [];
        var excluded = [];
        var missing = {};

        (routes || []).forEach(function (r, i) {
            if (!r) return;
            var originLoc = idx[r.origin] || null;
            var destLoc = idx[r.destination] || null;
            var bad = [];
            if (!hasCoords(originLoc)) bad.push(r.origin);
            if (!hasCoords(destLoc)) bad.push(r.destination);

            if (bad.length) {
                bad.forEach(function (city) { missing[city] = (missing[city] || 0) + 1; });
                var w = {
                    type: 'missing-location',
                    index: i,
                    cities: bad,
                    route: r.origin + ' -> ' + r.destination,
                    message: 'Leg ' + r.origin + ' -> ' + r.destination +
                        ' excluded: no coordinates for ' + bad.join(', ') +
                        ' in heroLocations.yaml'
                };
                warnings.push(w);
                excluded.push(r);
                if (typeof console !== 'undefined' && console.warn) console.warn('[FlightData] ' + w.message);
                return;
            }

            var isSelfLoop = r.origin === r.destination;
            var mi = monthIndexOf(r.month);
            var year = Number(r.year);

            legs.push({
                // raw
                origin: r.origin,
                destination: r.destination,
                airline: r.airline,
                year: isFinite(year) ? year : null,
                month: r.month,
                occasion: r.occasion,
                travelers: r.travelers || [],
                // derived
                km: isSelfLoop ? 0 : haversine(originLoc, destLoc),
                airlineLabel: airlineLabelOf(r.airline),
                monthLabel: mi === null ? null : MONTHS[mi],
                monthIndex: mi,
                occasionGroup: occasionGroupOf(r.occasion),
                occasionLabel: (typeof r.occasion === 'string' && r.occasion.trim()) ? r.occasion : UNKNOWN,
                isSelfLoop: isSelfLoop,
                isSelfFlown: r.airline === 'Patrick',
                originLoc: originLoc,
                destLoc: destLoc
            });
        });

        var missingNames = Object.keys(missing);
        if (missingNames.length) {
            warnings.push({
                type: 'missing-location-summary',
                cities: missingNames,
                message: missingNames.length + ' city name(s) absent from heroLocations.yaml: ' +
                    missingNames.join(', ') + ' (' + excluded.length + ' leg(s) excluded)'
            });
        }

        return { legs: legs, warnings: warnings, excluded: excluded };
    }

    var api = {
        EARTH_RADIUS_KM: EARTH_RADIUS_KM,
        MONTHS: MONTHS,
        UNKNOWN: UNKNOWN,
        OCCASION_GROUPS: OCCASION_GROUPS,
        normalize: normalize,
        haversine: haversine,
        locationIndex: locationIndex,
        monthIndexOf: monthIndexOf,
        occasionGroupOf: occasionGroupOf,
        airlineLabelOf: airlineLabelOf
    };

    root.FlightData = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

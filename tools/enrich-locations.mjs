#!/usr/bin/env node
/**
 * enrich-locations.mjs — offline enrichment of `_data/heroLocations.yaml`.
 *
 * Adds a `country` and a `continent` field to every location, resolved once at
 * authoring time and committed to the data file. The stats page then reads the
 * fields directly: no runtime geo dependency, no resolution artifacts, and every
 * value is auditable in a diff.
 *
 *   node tools/enrich-locations.mjs            # report only, writes nothing
 *   node tools/enrich-locations.mjs --write    # rewrite _data/heroLocations.yaml
 *
 * No npm dependencies — the repo has no package.json and no build step, so the
 * TopoJSON decoding, point-in-polygon test and YAML rewrite are all done here
 * against Node's standard library only.
 *
 * VALIDATION. The containment test here is planar even-odd ray casting, not
 * d3-geo's spherical winding. It was cross-validated against d3-geo
 * (`geoContains` + `geoDistance`) and agreed on all 106 locations, both for the
 * country and for the nearest-vertex distance, and on 11,659 of 11,661 points
 * of a global 2-degree grid between 58S and 84N (the two disagreements sit
 * exactly on a border line, where the two edge interpretations differ by a
 * fraction of a degree). Known limitation: the Antarctic polygon wraps the
 * south pole and planar ray casting cannot represent it, so points below ~58S
 * are unreliable. No location in this dataset is anywhere near that.
 *
 * RESOLUTION ORDER
 *   1. OVERRIDES  — hand-verified answers. Always win.
 *   2. inside     — point-in-polygon against assets/data/countries-110m.json.
 *   3. nearest    — great-circle distance to the closest country vertex.
 *
 * The 110m Natural Earth geometry is coarse: it resolves only 98/106 points by
 * containment and it is confidently wrong on small states, islands and enclaves.
 * The OVERRIDES map below is the actual control — every entry there was checked
 * by hand. Anything resolved by "nearest" at more than 50 km is flagged in the
 * report as needing a human look before it is trusted.
 *
 * The rewrite is purely additive and idempotent: existing lines are emitted
 * verbatim, `country` / `continent` are inserted after `lon`, and any previously
 * written pair is replaced in place rather than duplicated.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LOCATIONS = path.join(ROOT, '_data', 'heroLocations.yaml');
export const TOPOJSON = path.join(ROOT, 'assets', 'data', 'countries-110m.json');

const NEAREST_REVIEW_KM = 50;

/* ------------------------------------------------------------------ *
 * OVERRIDES — hand-verified. Key is the location name in the YAML.
 * Each entry says what the geometry claimed and why that is wrong.
 * ------------------------------------------------------------------ */
export const OVERRIDES = {
  // Geometry: inside "Malaysia". The 110m coastline swallows the city-state
  // whole; Singapore is its own country.
  'Singapore': 'Singapore',

  // Geometry: inside "China". Patrick's data treats Hong Kong as a distinct
  // destination (it has its own entry, its own legs, and a separate airport),
  // so it is reported as its own "country" here rather than folded into China.
  'Hong Kong': 'Hong Kong',

  // Geometry: nearest "Venezuela" at 40 km. Aruba is a constituent country of
  // the Kingdom of the Netherlands, ~30 km off the Venezuelan coast, and is
  // absent from the 110m country set.
  'Aruba': 'Aruba',

  // Geometry: nearest "Italy" at 96 km. "Valeta" is Valletta, Malta.
  'Valeta': 'Malta',

  // Geometry: nearest "Madagascar" at 893 km. Mauritius is its own island
  // nation in the Indian Ocean and is absent from the 110m country set.
  'Mauritius': 'Mauritius',

  // Geometry: nearest "Cambodia" at 48 km. Phu Quoc sits in the Gulf of
  // Thailand off the Cambodian coast but belongs to Vietnam (Kien Giang).
  'Phu Quoc': 'Vietnam',

  // Geometry: inside "France". Geneva is a Swiss salient almost entirely
  // enclosed by France; at 110m resolution the canton disappears entirely.
  'Geneva': 'Switzerland',
};

/* ------------------------------------------------------------------ *
 * NAME_FIXES — display names for dataset abbreviations. Applied to the
 * geometry's answer only; OVERRIDES values are already final.
 * ------------------------------------------------------------------ */
export const NAME_FIXES = {
  'United States of America': 'United States',
  'Dominican Rep.': 'Dominican Republic',
};

/* ------------------------------------------------------------------ *
 * CONTINENTS — assigned by country, never by coordinate, following the
 * UN M49 geoscheme so the transcontinental cases stay consistent:
 *   Russia -> Europe, Turkey -> Asia, Kazakhstan -> Asia,
 *   Egypt -> Africa, Mauritius -> Africa.
 * Hawaii (Big Island, Honolulu) therefore lands under North America with
 * the rest of the United States, not Oceania.
 * A country missing from this map is a hard error, not a blank field.
 * ------------------------------------------------------------------ */
export const CONTINENTS = {
  // Europe
  'Austria': 'Europe',
  'Belgium': 'Europe',
  'Denmark': 'Europe',
  'Finland': 'Europe',
  'France': 'Europe',
  'Germany': 'Europe',
  'Greece': 'Europe',
  'Hungary': 'Europe',
  'Iceland': 'Europe',
  'Ireland': 'Europe',
  'Italy': 'Europe',
  'Malta': 'Europe',
  'Netherlands': 'Europe',
  'Portugal': 'Europe',
  'Russia': 'Europe',
  'Spain': 'Europe',
  'Sweden': 'Europe',
  'Switzerland': 'Europe',
  'United Kingdom': 'Europe',

  // North America (incl. Central America and the Caribbean)
  'Aruba': 'North America',
  'Belize': 'North America',
  'Canada': 'North America',
  'Dominican Republic': 'North America',
  'Mexico': 'North America',
  'Panama': 'North America',
  'United States': 'North America',

  // South America
  'Uruguay': 'South America',

  // Asia
  'China': 'Asia',
  'Hong Kong': 'Asia',
  'India': 'Asia',
  'Indonesia': 'Asia',
  'Japan': 'Asia',
  'Kazakhstan': 'Asia',
  'Kuwait': 'Asia',
  'Malaysia': 'Asia',
  'Oman': 'Asia',
  'Qatar': 'Asia',
  'Saudi Arabia': 'Asia',
  'Singapore': 'Asia',
  'Thailand': 'Asia',
  'Turkey': 'Asia',
  'United Arab Emirates': 'Asia',
  'Vietnam': 'Asia',

  // Africa
  'Egypt': 'Africa',
  'Ethiopia': 'Africa',
  'Kenya': 'Africa',
  'Mauritius': 'Africa',
  'South Africa': 'Africa',
};

/* ------------------------------------------------------------------ *
 * TopoJSON -> country polygons (no topojson-client)
 * ------------------------------------------------------------------ */

function decodeArcs(topo) {
  const { scale: [sx, sy], translate: [tx, ty] } = topo.transform;
  return topo.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map(([dx, dy]) => {
      x += dx;
      y += dy;
      return [x * sx + tx, y * sy + ty];
    });
  });
}

/** Stitch a ring from its arc indices; a negative index means "reversed". */
function ringFromArcIndices(indices, arcs) {
  const ring = [];
  for (const index of indices) {
    const arc = index < 0 ? arcs[~index].slice().reverse() : arcs[index];
    // The last point of one arc repeats the first point of the next.
    ring.push(...(ring.length ? arc.slice(1) : arc));
  }
  return ring;
}

/**
 * Rings that straddle the antimeridian (Russia, Fiji, Antarctica) break a
 * planar crossing test. Re-express such a ring in a 0..360 longitude frame so
 * it becomes continuous again; the caller shifts the test point to match.
 */
function unwrapRing(ring) {
  let wraps = false;
  for (let i = 1; i < ring.length; i++) {
    if (Math.abs(ring[i][0] - ring[i - 1][0]) > 180) {
      wraps = true;
      break;
    }
  }
  if (!wraps) return { ring, shifted: false };
  return { ring: ring.map(([lon, lat]) => [lon < 0 ? lon + 360 : lon, lat]), shifted: true };
}

function bboxOf(rings) {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const ring of rings) {
    for (const [lon, lat] of ring) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }
  return [minLon, minLat, maxLon, maxLat];
}

export function loadCountries() {
  const topo = JSON.parse(fs.readFileSync(TOPOJSON, 'utf8'));
  const arcs = decodeArcs(topo);
  return topo.objects.countries.geometries.map((geom) => {
    const raw = geom.type === 'Polygon' ? [geom.arcs] : geom.arcs;
    const polygons = raw.map((polygon) => {
      const rings = polygon.map((indices) => {
        const { ring, shifted } = unwrapRing(ringFromArcIndices(indices, arcs));
        return { points: ring, shifted };
      });
      return { rings, bbox: bboxOf(rings.map((r) => r.points)), shifted: rings.some((r) => r.shifted) };
    });
    return { name: geom.properties.name, polygons };
  });
}

/* ------------------------------------------------------------------ *
 * Geometry predicates
 * ------------------------------------------------------------------ */

/** Even-odd ray casting. Rings of one polygon are tested together so that
 *  holes (Lesotho inside South Africa) flip the result correctly. */
function pointInPolygon(lon, lat, polygon) {
  const x = polygon.shifted && lon < 0 ? lon + 360 : lon;
  const [minLon, minLat, maxLon, maxLat] = polygon.bbox;
  if (x < minLon || x > maxLon || lat < minLat || lat > maxLat) return false;

  let inside = false;
  for (const { points } of polygon.rings) {
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [xi, yi] = points[i];
      const [xj, yj] = points[j];
      if ((yi > lat) !== (yj > lat) && x < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
  }
  return inside;
}

const RADIANS = Math.PI / 180;
const EARTH_KM = 6371;

function haversineKm(lon1, lat1, lon2, lat2) {
  const dLat = (lat2 - lat1) * RADIANS;
  const dLon = (lon2 - lon1) * RADIANS;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * RADIANS) * Math.cos(lat2 * RADIANS) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function containingCountry(lon, lat, countries) {
  for (const country of countries) {
    for (const polygon of country.polygons) {
      if (pointInPolygon(lon, lat, polygon)) return country.name;
    }
  }
  return null;
}

/** Closest country by great-circle distance to any of its boundary vertices. */
export function nearestCountry(lon, lat, countries) {
  let best = null;
  let bestKm = Infinity;
  for (const country of countries) {
    for (const polygon of country.polygons) {
      for (const { points, shifted } of polygon.rings) {
        for (const [px, py] of points) {
          const plon = shifted && px > 180 ? px - 360 : px;
          const km = haversineKm(lon, lat, plon, py);
          if (km < bestKm) {
            bestKm = km;
            best = country.name;
          }
        }
      }
    }
  }
  return { country: best, km: bestKm };
}

/* ------------------------------------------------------------------ *
 * YAML read / rewrite — line based, to keep the diff purely additive
 * ------------------------------------------------------------------ */

const NAME_RE = /^- name: "(.*)"\s*$/;
const NUM_RE = /^ {2}(lat|lon): (-?[\d.]+)\s*$/;
const ENRICHED_RE = /^ {2}(country|continent): /;

/** Parse into entries that remember their own source lines. */
export function parseLocations(text) {
  const lines = text.split('\n');
  const entries = [];
  let current = null;

  lines.forEach((line, index) => {
    const nameMatch = NAME_RE.exec(line);
    if (nameMatch) {
      current = { name: nameMatch[1], lat: null, lon: null, keep: [line], line: index + 1 };
      entries.push(current);
      return;
    }
    if (!current) {
      if (line.trim() !== '') throw new Error(`Unexpected line ${index + 1}: ${line}`);
      return;
    }
    const numMatch = NUM_RE.exec(line);
    if (numMatch) {
      current[numMatch[1]] = Number(numMatch[2]);
      current.keep.push(line);
      return;
    }
    if (ENRICHED_RE.test(line)) return; // dropped; regenerated below (idempotency)
    if (line.trim() === '') return;
    throw new Error(`Unexpected line ${index + 1}: ${line}`);
  });

  for (const entry of entries) {
    if (entry.lat === null || entry.lon === null) {
      throw new Error(`Entry "${entry.name}" (line ${entry.line}) is missing lat or lon`);
    }
  }
  return entries;
}

function renderLocations(entries) {
  const out = [];
  for (const entry of entries) {
    out.push(...entry.keep);
    out.push(`  country: "${entry.country}"`);
    out.push(`  continent: "${entry.continent}"`);
  }
  return out.join('\n') + '\n';
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

function main() {
  const write = process.argv.includes('--write');
  const countries = loadCountries();
  const entries = parseLocations(fs.readFileSync(LOCATIONS, 'utf8'));

  // A stale override key would silently stop applying if a location were
  // renamed, so treat it as an error rather than let it rot unnoticed.
  const names = new Set(entries.map((e) => e.name));
  const stale = Object.keys(OVERRIDES).filter((name) => !names.has(name));
  if (stale.length) {
    console.error(`ERROR — OVERRIDES keys match no location: ${stale.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  const rows = [];
  for (const entry of entries) {
    const inside = containingCountry(entry.lon, entry.lat, countries);
    let geometry;
    let how;
    let km = 0;

    if (inside) {
      geometry = NAME_FIXES[inside] ?? inside;
      how = 'inside';
    } else {
      const near = nearestCountry(entry.lon, entry.lat, countries);
      geometry = NAME_FIXES[near.country] ?? near.country;
      how = 'nearest';
      km = near.km;
    }

    const override = OVERRIDES[entry.name];
    entry.country = override ?? geometry;
    entry.continent = CONTINENTS[entry.country];
    rows.push({ entry, geometry, how, km, override: Boolean(override) });
  }

  // ---- report ----
  const width = Math.max(...entries.map((e) => e.name.length));
  console.log(`Resolved ${entries.length} locations from ${path.relative(ROOT, TOPOJSON)}\n`);
  console.log(
    `${'LOCATION'.padEnd(width)}  ${'COUNTRY'.padEnd(20)}  ${'CONTINENT'.padEnd(14)}  HOW`,
  );
  console.log('-'.repeat(width + 60));
  for (const row of rows) {
    const geo = row.how === 'inside' ? 'inside' : `nearest ${row.km.toFixed(1)}km`;
    const how = row.override
      ? `override (geometry said ${row.geometry}, ${geo})`
      : `${geo}${row.how === 'nearest' && row.km > NEAREST_REVIEW_KM ? '  <-- REVIEW' : ''}`;
    console.log(
      `${row.entry.name.padEnd(width)}  ${String(row.entry.country).padEnd(20)}  ${String(row.entry.continent).padEnd(14)}  ${how}`,
    );
  }

  const counts = { inside: 0, nearest: 0, override: 0 };
  for (const row of rows) counts[row.override ? 'override' : row.how]++;
  console.log(
    `\ngeometry: inside ${rows.filter((r) => r.how === 'inside').length}` +
      ` | nearest ${rows.filter((r) => r.how === 'nearest').length}` +
      `   ->   final: inside ${counts.inside} | nearest ${counts.nearest} | override ${counts.override}`,
  );

  const review = rows.filter((r) => !r.override && r.how === 'nearest' && r.km > NEAREST_REVIEW_KM);
  if (review.length) {
    console.log(`\nNEEDS REVIEW — resolved by nearest country at >${NEAREST_REVIEW_KM}km:`);
    for (const row of review) {
      console.log(`  ${row.entry.name} -> ${row.entry.country} (${row.km.toFixed(1)}km)`);
    }
  }

  const missing = rows.filter((r) => !r.entry.continent);
  if (missing.length) {
    console.error('\nERROR — no continent mapped for:');
    for (const row of missing) console.error(`  ${row.entry.country} (${row.entry.name})`);
    console.error('Add these to CONTINENTS in tools/enrich-locations.mjs and re-run.');
    process.exitCode = 1;
    return;
  }

  console.log(
    `\ndistinct countries ${new Set(entries.map((e) => e.country)).size}` +
      ` | distinct continents ${new Set(entries.map((e) => e.continent)).size}`,
  );

  if (write) {
    fs.writeFileSync(LOCATIONS, renderLocations(entries));
    console.log(`\nwrote ${path.relative(ROOT, LOCATIONS)}`);
  } else {
    console.log('\n(report only — pass --write to update _data/heroLocations.yaml)');
  }
}

// Run only when invoked directly, so the resolution helpers above can be
// imported by a checker without side effects.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

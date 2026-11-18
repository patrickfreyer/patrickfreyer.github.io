/**
 * The flight log as typed data, plus the aggregations every view needs.
 * Source of truth stays src/data/flightRoutes.yaml (one entry per leg) and src/data/heroLocations.yaml.
 */
import { geoDistance } from 'd3';

export interface RawFlight {
  origin: string; destination: string; airline: string; year: number; month: string;
  occasion: string; travelers?: string[]; planned?: boolean;
}
export interface Place { name: string; lat: number; lon: number; country: string; continent: string }

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Occasions folded into a few colour groups, in the atlas palette (ink blue, vermilion, ...) */
export const GROUPS = [
  { key: 'work', label: 'Work', color: '#2f4a78', match: ['Work'] },
  { key: 'projects', label: 'Projects', color: '#2e6b58', match: ['Projects'] },
  { key: 'private', label: 'Private', color: '#a8341c', match: ['Private'] },
  { key: 'study', label: 'Study', color: '#7a3b6e', match: ['Yale', 'Warwick', 'School'] },
  { key: 'sport', label: 'Rowing and flying', color: '#a5670f', match: ['Rowing', 'Pilots License'] },
] as const;
export type GroupKey = typeof GROUPS[number]['key'];
export const groupOf = (occasion: string): GroupKey =>
  (GROUPS.find(g => (g.match as readonly string[]).includes(occasion)) ?? GROUPS[2]).key;
export const groupColor = (k: GroupKey) => GROUPS.find(g => g.key === k)!.color;
export const groupLabel = (k: GroupKey) => GROUPS.find(g => g.key === k)!.label;

const EARTH_KM = 6371;

export interface Flight extends RawFlight {
  id: number;
  from: Place; to: Place;
  km: number;
  group: GroupKey;
  /** 0-11, or -1 when the month is unknown */
  m: number;
  /** year + month as a sortable number */
  t: number;
}

export function prepare(raw: RawFlight[], places: Place[]): { flights: Flight[]; places: Map<string, Place>; missing: string[] } {
  const byName = new Map(places.map(p => [p.name, p]));
  const missing = new Set<string>();
  const flights: Flight[] = [];
  raw.forEach((r, i) => {
    const from = byName.get(r.origin), to = byName.get(r.destination);
    if (!from) missing.add(r.origin);
    if (!to) missing.add(r.destination);
    if (!from || !to) return;
    const m = MONTHS.indexOf(r.month);
    flights.push({
      ...r, id: i, from, to, m,
      km: geoDistance([from.lon, from.lat], [to.lon, to.lat]) * EARTH_KM,
      group: groupOf(r.occasion),
      t: r.year * 12 + (m < 0 ? 6 : m),
    });
  });
  // the yaml is in log order within a year; keep that order for ties (stable sort)
  flights.sort((a, b) => a.t - b.t);
  return { flights, places: byName, missing: [...missing] };
}

export const pairKey = (a: string, b: string) => [a, b].sort().join(' ↔ ');

export interface Edge {
  key: string; a: Place; b: Place; count: number; km: number;
  groups: Partial<Record<GroupKey, number>>; group: GroupKey;
  first: number; last: number; airlines: Map<string, number>; flights: Flight[];
}
export function edges(fl: Flight[]): Edge[] {
  const m = new Map<string, Edge>();
  for (const f of fl) {
    const key = pairKey(f.origin, f.destination);
    let e = m.get(key);
    if (!e) {
      const [a, b] = f.origin < f.destination ? [f.from, f.to] : [f.to, f.from];
      e = { key, a, b, count: 0, km: f.km, groups: {}, group: f.group, first: f.year, last: f.year, airlines: new Map(), flights: [] };
      m.set(key, e);
    }
    e.count++; e.flights.push(f);
    e.groups[f.group] = (e.groups[f.group] ?? 0) + 1;
    e.first = Math.min(e.first, f.year); e.last = Math.max(e.last, f.year);
    if (f.airline && f.airline !== 'XXX') e.airlines.set(f.airline, (e.airlines.get(f.airline) ?? 0) + 1);
  }
  for (const e of m.values()) e.group = (Object.entries(e.groups) as [GroupKey, number][]).sort((x, y) => y[1] - x[1])[0][0];
  return [...m.values()].sort((x, y) => x.count - y.count);
}

export interface CityStat { place: Place; visits: number; first: number; last: number; flights: Flight[] }
export function cities(fl: Flight[]): CityStat[] {
  const m = new Map<string, CityStat>();
  const add = (p: Place, f: Flight) => {
    let c = m.get(p.name);
    if (!c) m.set(p.name, c = { place: p, visits: 0, first: f.year, last: f.year, flights: [] });
    c.visits++; c.flights.push(f); c.first = Math.min(c.first, f.year); c.last = Math.max(c.last, f.year);
  };
  for (const f of fl) { add(f.from, f); add(f.to, f); }
  return [...m.values()].sort((a, b) => b.visits - a.visits);
}

export function summary(fl: Flight[]) {
  const km = fl.reduce((s, f) => s + f.km, 0);
  const countries = new Set<string>(), continents = new Set<string>(), places = new Set<string>(), airlines = new Map<string, number>();
  for (const f of fl) {
    for (const p of [f.from, f.to]) { countries.add(p.country); continents.add(p.continent); places.add(p.name); }
    if (f.airline && f.airline !== 'XXX') airlines.set(f.airline, (airlines.get(f.airline) ?? 0) + 1);
  }
  const longest = fl.reduce<Flight | null>((b, f) => !b || f.km > b.km ? f : b, null);
  return { flights: fl.length, km, countries: countries.size, continents: continents.size, cities: places.size, airlines, longest };
}

export const fmtInt = (n: number) => Math.round(n).toLocaleString('en-US');
export const fmtKm = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(2)} million` : fmtInt(n);
export const when = (f: Flight) => (f.m >= 0 ? MONTHS[f.m] + ' ' : '') + f.year;

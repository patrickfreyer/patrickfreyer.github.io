/**
 * /flights/ : the flight log on the WorldRewind globe.
 *
 * Routes are inked on the globe as pencil lines coloured by occasion, cities are stamps, a hand-ruled
 * timeline at the bottom picks the years (click one, drag across several, or play them in order), and a
 * paper card on the right reads out the selection, a city or a route.
 */
import { select, geoCentroid, geoDistance } from 'd3';
import { mesh } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import { createGlobe, greatCircle, type Globe, type LonLat } from './globe/globe';
import {
  prepare, edges as toEdges, cities as toCities, summary, GROUPS, groupColor, groupLabel,
  fmtInt, fmtKm, type Flight, type Edge, type CityStat, type GroupKey, type RawFlight, type Place,
} from './data';

const $ = <T extends Element = HTMLElement>(s: string) => document.querySelector(s) as T;
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

const raw = JSON.parse($('#flight-data').textContent!) as { flights: RawFlight[]; places: Place[] };
const { flights: ALL, missing } = prepare(raw.flights, raw.places);
if (missing.length) console.warn('Flights with no location entry (skipped):', missing);

const YEARS = [...new Set(ALL.map(f => f.year))].sort((a, b) => a - b);
const Y0 = YEARS[0], Y1 = YEARS[YEARS.length - 1];

/* ---------- Selection state (kept in the URL hash, so a view can be shared) ---------- */
type Focus = null | { kind: 'city'; name: string } | { kind: 'route'; key: string };
const state = {
  y0: Y0, y1: Y1,
  groups: new Set<GroupKey>(GROUPS.map(g => g.key)),
  focus: null as Focus,
};
function readHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  const y = h.get('y');
  if (y) {
    const [a, b] = y.split('-').map(Number);
    if (a >= Y0 && a <= Y1) { state.y0 = a; state.y1 = b >= a && b <= Y1 ? b : a; }
  }
  const g = h.get('g');
  if (g) { const ks = g.split(',').filter(k => GROUPS.some(x => x.key === k)) as GroupKey[]; if (ks.length) state.groups = new Set(ks); }
  const c = h.get('city'); if (c) state.focus = { kind: 'city', name: c };
}
function writeHash() {
  const h = new URLSearchParams();
  if (state.y0 !== Y0 || state.y1 !== Y1) h.set('y', state.y0 === state.y1 ? `${state.y0}` : `${state.y0}-${state.y1}`);
  if (state.groups.size < GROUPS.length) h.set('g', [...state.groups].join(','));
  if (state.focus?.kind === 'city') h.set('city', state.focus.name);
  const s = h.toString().replace(/%2C/g, ',');
  history.replaceState(null, '', s ? '#' + s : location.pathname);
}
readHash();

/* ---------- Derived data for the current selection ---------- */
let SEL: Flight[] = [], EDGES: Edge[] = [], CITIES: CityStat[] = [], GHOST: Edge[] = [];
const ALL_EDGES = toEdges(ALL);
function recompute() {
  SEL = ALL.filter(f => f.year >= state.y0 && f.year <= state.y1 && state.groups.has(f.group));
  EDGES = toEdges(SEL);
  CITIES = toCities(SEL);
  const on = new Set(EDGES.map(e => e.key));
  GHOST = ALL_EDGES.filter(e => !on.has(e.key));
}

/* ---------- Borders of today's countries, as faint pencil ---------- */
let BORDERS: GeoJSON.MultiLineString | null = null;
fetch('/assets/data/countries-110m.json').then(r => r.json()).then((t: Topology) => {
  const o = t.objects.countries as GeometryCollection;
  BORDERS = mesh(t, o, (a, b) => a !== b) as GeoJSON.MultiLineString;
  globe.renderSoon();
}).catch(() => {});

/* ---------- Route geometry, cached per edge ---------- */
const geoCache = new Map<string, GeoJSON.LineString>();
const routeGeo = (e: Edge) => {
  let g = geoCache.get(e.key);
  if (!g) geoCache.set(e.key, g = { type: 'LineString', coordinates: greatCircle([e.a.lon, e.a.lat], [e.b.lon, e.b.lat]) });
  return g;
};
// screen polylines of each drawn route from the last frame, for hover hit tests
let drawn: { e: Edge; lines: number[][] }[] = [];
let hoverEdge: Edge | null = null;
// routes drawing themselves in during playback: key -> start time
const fresh = new Map<string, number>();
const DRAW_MS = 900;

/** Keep only the first `frac` of a set of polylines, by length */
function cut(lines: number[][], frac: number) {
  if (frac >= 1) return lines;
  let total = 0;
  for (const L of lines) for (let i = 2; i < L.length; i += 2) total += Math.hypot(L[i] - L[i - 2], L[i + 1] - L[i - 1]);
  let left = total * frac; const out: number[][] = [];
  for (const L of lines) {
    const o = [L[0], L[1]];
    for (let i = 2; i < L.length; i += 2) {
      const d = Math.hypot(L[i] - L[i - 2], L[i + 1] - L[i - 1]);
      if (d >= left) { const t = d ? left / d : 0; o.push(L[i - 2] + (L[i] - L[i - 2]) * t, L[i - 1] + (L[i + 1] - L[i - 1]) * t); out.push(o); return out; }
      left -= d; o.push(L[i], L[i + 1]);
    }
    out.push(o);
  }
  return out;
}
const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};
// busier routes get clearly heavier lines: 1 flight about 1.2px, 5 about 2.3px, 15 about 3.9px, 30 about 5.6px
const width = (e: Edge, k: number) => Math.min(6.5, .6 + Math.pow(e.count, .65) * .6) * Math.min(1.5, .85 + k * .15);

function focusEdges(): Set<string> | null {
  const f = state.focus;
  if (!f) return null;
  if (f.kind === 'route') return new Set([f.key]);
  return new Set(EDGES.filter(e => e.a.name === f.name || e.b.name === f.name).map(e => e.key));
}

function drawInk(g: Globe) {
  const ink = g.ink;
  // 1. borders: a soft sepia wash and one broken pencil line (WorldRewind's recipe, lighter, since they are background here)
  if (BORDERS) {
    const L = g.lines(BORDERS);
    g.pencil(L, 3, .03, 0, 0, 9);
    ink.strokeStyle = 'rgba(120,84,48,.05)'; ink.lineWidth = 6; ink.stroke();
    g.pencil(L, 2, .045, .45, .45, 21, [.3, .45]);
    ink.strokeStyle = 'rgba(43,33,22,.38)'; ink.lineWidth = Math.min(1.1, .55 + g.k * .15); ink.stroke();
  }
  // 2. ghosts: every other route ever flown, as a faint dotted pencil track, so a single year still shows the whole web
  ink.setLineDash([1, 4]);
  ink.beginPath();
  for (const e of GHOST) for (const L of g.lines(routeGeo(e))) { ink.moveTo(L[0], L[1]); for (let i = 2; i < L.length; i += 2) ink.lineTo(L[i], L[i + 1]); }
  ink.strokeStyle = 'rgba(43,33,22,.34)'; ink.lineWidth = .9; ink.stroke();
  ink.setLineDash([]);

  // 3. the selected routes, thinnest first so the busy corridors sit on top
  const foc = focusEdges(), now = performance.now();
  drawn = [];
  for (const e of EDGES) {
    let lines = g.lines(routeGeo(e));
    if (!lines.length) continue;
    const st = fresh.get(e.key);
    if (st !== undefined) { const p = (now - st) / DRAW_MS; if (p >= 1) fresh.delete(e.key); else lines = cut(lines, Math.max(0, p)); }
    drawn.push({ e, lines });
    const dim = foc && !foc.has(e.key), hi = (foc && foc.has(e.key)) || hoverEdge === e;
    const col = groupColor(e.group), w = width(e, g.k);
    // a watercolour wash laid under the line
    g.pencil(lines, 2.5, .03, 0, 0, 5 + e.count);
    ink.strokeStyle = rgba(col, dim ? .02 : hi ? .16 : .08); ink.lineWidth = w * 3.2 + 3; ink.stroke();
    // the ink line
    g.pencil(lines, .9, .05, .3, .5, 31);
    ink.strokeStyle = rgba(col, dim ? .14 : hi ? .95 : .72); ink.lineWidth = hi ? w + 1 : w; ink.stroke();
  }
  if (fresh.size) g.renderSoon(true);
}

/* ---------- City stamps on the SVG overlay ---------- */
type StampSel = ReturnType<typeof stampJoin>;
let stamps: StampSel | null = null;
const rStamp = (c: CityStat, k: number) => (1.9 + Math.sqrt(c.visits) * .5) * Math.min(1.6, .8 + k * .2);
function stampJoin() {
  return globe.layer.selectAll<SVGGElement, CityStat>('g.stamp').data(CITIES, d => d.place.name).join(
    enter => {
      const s = enter.append('g').attr('class', 'stamp').attr('tabindex', 0).attr('role', 'button');
      s.append('circle').attr('class', 'halo');
      s.append('circle').attr('class', 'seal');
      s.append('circle').attr('class', 'dot').attr('r', 1.1);
      s.append('text').attr('class', 'lbl').attr('dy', '.32em');
      s.on('click', (ev: MouseEvent, d) => { ev.stopPropagation(); openCity(d.place.name, true); })
        .on('keydown', (ev: KeyboardEvent, d) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openCity(d.place.name, true); } })
        .on('pointerenter', (ev: PointerEvent, d) => showTip(ev, `${d.place.name}<small>${d.visits} ${d.visits === 1 ? 'visit' : 'visits'}</small>`))
        .on('pointerleave', hideTip);
      return s;
    },
  ).attr('aria-label', d => `${d.place.name}, ${d.visits} flights`);
}
function drawStamps(g: Globe) {
  if (!stamps) return;
  const boxes: [number, number, number, number][] = [];
  const foc = state.focus;
  // labels: busiest first, only where they fit; the card's city and its partners always try first
  const partners = new Set<string>();
  if (foc?.kind === 'city') for (const e of EDGES) { if (e.a.name === foc.name) partners.add(e.b.name); if (e.b.name === foc.name) partners.add(e.a.name); }
  if (foc?.kind === 'route') { const e = EDGES.find(x => x.key === foc.key); if (e) { partners.add(e.a.name); partners.add(e.b.name); } }
  const order = [...CITIES].sort((a, b) => (Number(partners.has(b.place.name) || foc?.kind === 'city' && b.place.name === foc.name) - Number(partners.has(a.place.name) || foc?.kind === 'city' && a.place.name === foc.name)) || b.visits - a.visits);
  const maxLabels = g.k > 2.5 ? 60 : g.k > 1.5 ? 30 : 16;
  const lbl = new Set<string>();
  const pos = new Map<string, [number, number] | null>();
  for (const c of CITIES) {
    const ll: LonLat = [c.place.lon, c.place.lat];
    pos.set(c.place.name, g.visible(ll) ? g.projection(ll) as [number, number] : null);
  }
  for (const c of order) {
    if (lbl.size >= maxLabels) break;
    const p = pos.get(c.place.name); if (!p) continue;
    const w = c.place.name.length * 7.4 + 6, r = rStamp(c, g.k), x = p[0] + r + 4, y = p[1] - 9;
    const b: [number, number, number, number] = [x, y, x + w, y + 18];
    if (b[2] > g.W - 8 || boxes.some(o => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1])) continue;
    boxes.push(b); lbl.add(c.place.name);
  }
  stamps
    .attr('transform', d => { const p = pos.get(d.place.name); return p ? `translate(${p[0].toFixed(1)},${p[1].toFixed(1)})` : 'translate(-99,-99)'; })
    .classed('off', d => !pos.get(d.place.name))
    .classed('sel', d => foc?.kind === 'city' && foc.name === d.place.name)
    .classed('dim', d => !!foc && !(foc.kind === 'city' && foc.name === d.place.name) && !partners.has(d.place.name))
    .classed('nolbl', d => !lbl.has(d.place.name));
  stamps.select<SVGCircleElement>('circle.seal').attr('r', d => rStamp(d, g.k));
  stamps.select<SVGCircleElement>('circle.halo').attr('r', d => rStamp(d, g.k) + 5);
  stamps.select<SVGTextElement>('text.lbl').attr('x', d => rStamp(d, g.k) + 5).text(d => d.place.name);
}

/* ---------- Tooltip: a paper label, never a browser title ---------- */
const tip = $('#tip');
function showTip(ev: { clientX: number; clientY: number }, html: string) {
  tip.innerHTML = html; tip.style.left = ev.clientX + 'px'; tip.style.top = ev.clientY + 'px'; tip.classList.add('on');
}
function hideTip() { tip.classList.remove('on'); }

/* ---------- Hover and click on routes ---------- */
function edgeAt(p: [number, number], tol = 6): Edge | null {
  let best: Edge | null = null, bd = tol;
  // last drawn is on top, so search from the end
  for (let j = drawn.length - 1; j >= 0; j--) {
    const { e, lines } = drawn[j];
    for (const L of lines) for (let i = 2; i < L.length; i += 2) {
      const ax = L[i - 2], ay = L[i - 1], bx = L[i], by = L[i + 1], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      const t = l2 ? Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / l2)) : 0;
      const d = Math.hypot(p[0] - ax - dx * t, p[1] - ay - dy * t);
      if (d < bd) { bd = d; best = e; }
    }
  }
  return best;
}

/* ---------- The globe ---------- */
const stage = $('#stage');
const card = $('#card');
const globe = createGlobe({
  stage,
  texBase: '/globe/tex/',
  center: [-35, 38],
  rightInset: () => card.classList.contains('closed') ? 0 : Math.min(420, card.offsetWidth + 24),
  onInk: drawInk,
  onOverlay: g => drawStamps(g),
  onHover: (p, ev) => {
    if (!p || !ev) { if (hoverEdge) { hoverEdge = null; globe.renderSoon(); } hideTip(); return; }
    if ((ev.target as Element).closest('.stamp')) return;
    const e = edgeAt(p);
    if (e !== hoverEdge) { hoverEdge = e; globe.renderSoon(); }
    stage.classList.toggle('over-route', !!e);
    if (e) showTip(ev, `${esc(e.a.name)} and ${esc(e.b.name)}<small>${e.count} ${e.count === 1 ? 'flight' : 'flights'}, ${fmtInt(e.km)} km</small>`);
    else hideTip();
  },
  onClick: (_ll, ev) => {
    const r = stage.getBoundingClientRect();
    const e = edgeAt([ev.clientX - r.left, ev.clientY - r.top], 9);
    if (e) openRoute(e.key);
    else if (state.focus) { state.focus = null; writeHash(); showCard(); globe.render(); }
  },
});

$('#zin').addEventListener('click', () => globe.zoomBy(1.6));
$('#zout').addEventListener('click', () => globe.zoomBy(1 / 1.6));
$('#zhome').addEventListener('click', () => globe.flyTo([-35, 38], 1, 900));

/* ---------- The card ---------- */
const cardIn = $('#card-in');
// The card only opens for a clicked city or route; the totals live on the stats page
function setCard(open: boolean) {
  if (card.classList.contains('closed') === !open) return;
  card.classList.toggle('closed', !open);
  card.setAttribute('aria-hidden', String(!open));
  globe.relayout();
}

const span = () => state.y0 === state.y1 ? `${state.y0}` : `${state.y0} to ${state.y1}`;
const bar = (n: number, max: number, col = 'var(--ink)') => `<span class="bar" style="--w:${(n / max * 100).toFixed(1)}%;--c:${col}"></span>`;

function listFlights(fl: Flight[], other?: (f: Flight) => string) {
  const byYear = new Map<number, Flight[]>();
  for (const f of [...fl].reverse()) { if (!byYear.has(f.year)) byYear.set(f.year, []); byYear.get(f.year)!.push(f); }
  return [...byYear].map(([y, l]) => `<h4>${y}</h4><ul class="legs">${l.map(f => `<li><i style="--c:${groupColor(f.group)}"></i><span>${other ? other(f) : `${esc(f.origin)} to ${esc(f.destination)}`}</span><em>${f.m >= 0 ? esc(f.month.slice(0, 3)) : ''}</em><small>${esc(f.airline !== 'XXX' ? f.airline : '')}${f.travelers && f.travelers.length > 1 ? `, with ${esc(f.travelers.filter(t => t !== 'Patrick').join(', '))}` : ''}</small></li>`).join('')}</ul>`).join('');
}

function cityHTML(name: string) {
  const c = CITIES.find(x => x.place.name === name) ?? toCities(ALL).find(x => x.place.name === name);
  if (!c) return '';
  const inSel = CITIES.includes(c);
  const partners = new Map<string, number>();
  for (const f of c.flights) { const o = f.origin === name ? f.destination : f.origin; partners.set(o, (partners.get(o) ?? 0) + 1); }
  const pl = [...partners].sort((a, b) => b[1] - a[1]).slice(0, 8), mp = Math.max(1, ...pl.map(p => p[1]));
  return `
    <button class="back" data-back aria-label="Close">Close</button>
    <p class="kicker">${esc(c.place.country)}, ${esc(c.place.continent)}</p>
    <h2>${esc(c.place.name)}</h2>
    <p class="lede">${c.visits} ${c.visits === 1 ? 'flight' : 'flights'} in or out${inSel ? `, ${span()}` : ' in all years'}. First in ${c.first}${c.last !== c.first ? `, last in ${c.last}` : ''}</p>
    <h3>Flown to and from</h3>
    <ol class="rank">${pl.map(([n, k]) => `<li><a href="#" data-city="${esc(n)}">${esc(n)}</a><b>${k}</b>${bar(k, mp)}</li>`).join('')}</ol>
    <h3>Every leg</h3>
    ${listFlights(c.flights, f => f.origin === name ? `to ${esc(f.destination)}` : `from ${esc(f.origin)}`)}`;
}
function routeHTML(key: string) {
  const e = EDGES.find(x => x.key === key) ?? ALL_EDGES.find(x => x.key === key);
  if (!e) return '';
  const al = [...e.airlines].sort((a, b) => b[1] - a[1]);
  return `
    <button class="back" data-back aria-label="Close">Close</button>
    <p class="kicker">${fmtInt(e.km)} km, ${e.first === e.last ? e.first : `${e.first} to ${e.last}`}</p>
    <h2>${esc(e.a.name)} <span class="amp">and</span> ${esc(e.b.name)}</h2>
    <p class="lede">${e.count} ${e.count === 1 ? 'flight' : 'flights'}${al.length ? ` with ${al.map(([a, n]) => `${esc(a)}${al.length > 1 ? ` (${n})` : ''}`).join(', ')}` : ''}. ${fmtKm(e.km * e.count)} km in all</p>
    <p class="occ">${(Object.entries(e.groups) as [GroupKey, number][]).map(([g, n]) => `<span style="--c:${groupColor(g)}">${groupLabel(g)} ${n}</span>`).join('')}</p>
    <h3>Every leg</h3>
    ${listFlights(e.flights)}`;
}
function showCard() {
  const f = state.focus;
  const html = !f ? '' : f.kind === 'city' ? cityHTML(f.name) : routeHTML(f.key);
  if (html) { cardIn.innerHTML = html; cardIn.scrollTop = 0; }
  setCard(!!html);
}
cardIn.addEventListener('click', ev => {
  const a = (ev.target as Element).closest<HTMLElement>('[data-city],[data-route],[data-back]');
  if (!a) return;
  ev.preventDefault();
  if (a.dataset.city) openCity(a.dataset.city, true);
  else if (a.dataset.route) openRoute(a.dataset.route);
  else { state.focus = null; writeHash(); showCard(); globe.render(); }
});
function openCity(name: string, fly: boolean) {
  state.focus = { kind: 'city', name }; writeHash(); showCard();
  const c = CITIES.find(x => x.place.name === name) ?? toCities(ALL).find(x => x.place.name === name);
  if (fly && c) globe.flyTo([c.place.lon, c.place.lat], Math.max(globe.k, 1.6), 900); else globe.render();
}
function openRoute(key: string) {
  state.focus = { kind: 'route', key }; writeHash(); showCard();
  const e = EDGES.find(x => x.key === key) ?? ALL_EDGES.find(x => x.key === key);
  if (e) {
    const mid = routeGeo(e).coordinates[Math.floor(routeGeo(e).coordinates.length / 2)] as LonLat;
    const k = Math.max(.9, Math.min(2.4, 1.15 / Math.sin(Math.min(1.5, e.km / 6371 / 2 + .25))));
    globe.flyTo(mid, k, 1000);
  }
}

/* ---------- Occasion chips ---------- */
const chips = $('#chips');
chips.innerHTML = GROUPS.map(g => `<button type="button" data-g="${g.key}" style="--c:${g.color}" aria-pressed="true"><i></i>${g.label}</button>`).join('');
function syncChips() { chips.querySelectorAll<HTMLButtonElement>('button').forEach(b => b.setAttribute('aria-pressed', String(state.groups.has(b.dataset.g as GroupKey)))); }
chips.addEventListener('click', ev => {
  const b = (ev.target as Element).closest<HTMLButtonElement>('button'); if (!b) return;
  const k = b.dataset.g as GroupKey;
  // a click on the only one on turns everything back on; otherwise toggle
  if (state.groups.has(k) && state.groups.size === 1) state.groups = new Set(GROUPS.map(g => g.key));
  else if (state.groups.has(k)) state.groups.delete(k); else state.groups.add(k);
  update();
});

/* ---------- Timeline: a hand-ruled strip of years with a bar of flights for each ---------- */
const tl = select<SVGSVGElement, unknown>('#tl');
const tlWrap = $('#timeline');
const perYear = new Map<number, Partial<Record<GroupKey, number>>>();
for (const f of ALL) { const r = perYear.get(f.year) ?? {}; r[f.group] = (r[f.group] ?? 0) + 1; perYear.set(f.year, r); }
const yMax = Math.max(...[...perYear.values()].map(r => Object.values(r).reduce((s, n) => s + n!, 0)));
let tlX = (y: number) => y, tlW = 0, tlStep = 1;
function drawTimeline() {
  const W = Math.max(200, (tl.node() as SVGSVGElement).clientWidth || tlWrap.clientWidth - 80);
  tlW = W; const H = 64, pad = 14;
  tlStep = (W - pad * 2) / (Y1 - Y0 + 1);
  tlX = (y: number) => pad + (y - Y0) * tlStep;
  tl.attr('viewBox', `0 0 ${W} ${H + 22}`).attr('height', H + 22);
  tl.selectAll('*').remove();
  // selection band behind
  tl.append('rect').attr('class', 'band').attr('y', 2).attr('height', H - 2);
  const bw = Math.max(3, Math.min(16, tlStep * .5));
  for (let y = Y0; y <= Y1; y++) {
    const r = perYear.get(y) ?? {};
    let acc = 0;
    const g = tl.append('g').attr('class', 'yr').attr('data-y', y);
    for (const grp of GROUPS) {
      const n = r[grp.key] ?? 0; if (!n) continue;
      const h = Math.max(1.5, n / yMax * (H - 14));
      g.append('rect').attr('x', tlX(y) + tlStep / 2 - bw / 2).attr('y', H - acc - h).attr('width', bw).attr('height', h)
        .attr('fill', grp.color).attr('class', 'seg').attr('data-g', grp.key);
      acc += h;
    }
    g.append('rect').attr('class', 'hitc').attr('x', tlX(y)).attr('y', 0).attr('width', tlStep).attr('height', H + 22);
  }
  // the rule and its ticks
  tl.append('line').attr('class', 'rule').attr('x1', pad).attr('x2', W - pad).attr('y1', H + .5).attr('y2', H + .5);
  const every = tlStep < 22 ? 5 : tlStep < 34 ? 2 : 1;
  for (let y = Y0; y <= Y1; y++) {
    tl.append('line').attr('class', 'tick').attr('x1', tlX(y) + tlStep / 2).attr('x2', tlX(y) + tlStep / 2).attr('y1', H).attr('y2', H + (y % every === 0 ? 5 : 3));
    if ((y % every === 0 && Y1 - y >= Math.ceil(every / 2)) || y === Y1) tl.append('text').attr('class', 'ylab').attr('x', tlX(y) + tlStep / 2).attr('y', H + 18).text(y);
  }
  syncTimeline();
}
function syncTimeline() {
  tl.select('rect.band').classed('all', state.y0 === Y0 && state.y1 === Y1).attr('x', tlX(state.y0)).attr('width', tlX(state.y1) + tlStep - tlX(state.y0));
  tl.selectAll<SVGGElement, unknown>('g.yr').classed('out', function () { const y = +this.dataset.y!; return y < state.y0 || y > state.y1; });
  tl.selectAll<SVGRectElement, unknown>('rect.seg').classed('off', function () { return !state.groups.has(this.dataset.g as GroupKey); });
  $('#tl-all').toggleAttribute('hidden', state.y0 === Y0 && state.y1 === Y1);
}
const yearAt = (ev: PointerEvent) => {
  const r = (tl.node() as SVGSVGElement).getBoundingClientRect();
  return Math.max(Y0, Math.min(Y1, Y0 + Math.floor((ev.clientX - r.left - 14) / tlStep)));
};
let tlDrag: number | null = null;
tl.on('pointerdown', (ev: PointerEvent) => {
  stopPlay(); tlDrag = yearAt(ev); (ev.target as Element).setPointerCapture?.(ev.pointerId);
  state.y0 = state.y1 = tlDrag; update();
});
tl.on('pointermove', (ev: PointerEvent) => {
  if (tlDrag === null) {
    const y = yearAt(ev), n = Object.values(perYear.get(y) ?? {}).reduce((s, x) => s + x!, 0);
    showTip(ev, `${y}<small>${n} ${n === 1 ? 'flight' : 'flights'}</small>`); return;
  }
  const y = yearAt(ev), a = Math.min(tlDrag, y), b = Math.max(tlDrag, y);
  if (a !== state.y0 || b !== state.y1) { state.y0 = a; state.y1 = b; update(); }
});
tl.on('pointerup pointercancel', () => { if (tlDrag !== null) frame(); tlDrag = null; });
tl.on('pointerleave', hideTip);
$('#tl-all').addEventListener('click', () => { stopPlay(); state.y0 = Y0; state.y1 = Y1; update(); frame(); });

/* Turn the globe to the selection: its middle, or the busiest group of cities when they are spread round the world */
function frame(cs: CityStat[] = CITIES, kMax = 1.7) {
  if (!cs.length) return;
  const pts = cs.map(c => ({ p: [c.place.lon, c.place.lat] as LonLat, w: c.visits }));
  const mid = (l: typeof pts) => geoCentroid({ type: 'MultiPoint', coordinates: l.flatMap(x => Array(Math.min(20, x.w)).fill(x.p)) }) as LonLat;
  let list = pts, c = mid(list);
  if (Math.max(...list.map(x => geoDistance(x.p, c))) > 1.1) {
    let best = list, bw = -1;
    for (const a of pts) {
      const near = pts.filter(x => geoDistance(a.p, x.p) < .45), w = near.reduce((s, x) => s + x.w, 0);
      if (w > bw) { bw = w; best = near; }
    }
    list = best; c = mid(list);
  }
  const spread = Math.max(...list.map(x => geoDistance(x.p, c)));
  globe.flyTo(c, Math.max(1, Math.min(kMax, .75 / Math.sin(Math.min(1.4, spread + .3)))), 1100);
}

/* ---------- Playback: the years fill in one after another, each new route drawing itself ---------- */
const playBtn = $('#play');
let playT = 0;
function stopPlay() { if (playT) { clearTimeout(playT); playT = 0; playBtn.classList.remove('on'); playBtn.setAttribute('aria-label', 'Play the years'); } }
function step() {
  if (state.y1 >= Y1) { stopPlay(); return; }
  const before = new Set(EDGES.map(e => e.key));
  state.y1++; update(true);
  if (!globe.reduceMotion) { const t = performance.now(); for (const e of EDGES) if (!before.has(e.key)) fresh.set(e.key, t); globe.renderSoon(); }
  // turn toward where this year's flying happened
  const yr = SEL.filter(f => f.year === state.y1);
  if (yr.length) frame(toCities(yr), 1.4);
  playT = window.setTimeout(step, yr.length ? 1500 : 300);
}
playBtn.addEventListener('click', () => {
  if (playT) return stopPlay();
  playBtn.classList.add('on'); playBtn.setAttribute('aria-label', 'Pause');
  state.focus = null;
  state.y0 = Y0; state.y1 = Y0 - 1; fresh.clear();
  // start from an empty globe: the first year draws in like the rest
  globe.stopIdle();
  step();
});

/* ---------- Era heading ---------- */
function drawEra() {
  const s = summary(SEL);
  $('#era-yr').innerHTML = state.y0 === state.y1 ? `${state.y0}` : `${state.y0}<small>to ${state.y1}</small>`;
  $('#era-sub').textContent = `${fmtInt(s.flights)} ${s.flights === 1 ? 'flight' : 'flights'}, ${fmtKm(s.km)} km`;
}

function update(keepFocus = false) {
  recompute();
  if (!keepFocus && state.focus?.kind === 'route' && !EDGES.some(e => e.key === (state.focus as { key: string }).key)) state.focus = null;
  stamps = stampJoin();
  writeHash(); syncChips(); syncTimeline(); drawEra(); showCard();
  globe.render();
}

new ResizeObserver(() => drawTimeline()).observe(tlWrap);
recompute(); stamps = stampJoin(); syncChips(); drawTimeline(); drawEra(); showCard();
if (state.focus?.kind === 'city') openCity(state.focus.name, true);
else if (state.y0 !== Y0 || state.y1 !== Y1) frame();
globe.render();
addEventListener('hashchange', () => {
  state.y0 = Y0; state.y1 = Y1; state.groups = new Set(GROUPS.map(g => g.key)); state.focus = null;
  readHash(); update(true);
  const f = (state as { focus: Focus }).focus;
  if (f?.kind === 'city') openCity(f.name, true); else frame();
});

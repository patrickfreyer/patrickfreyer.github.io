/**
 * The paper and ink globe from WorldRewind (patrickfreyer/history-map), ported to a typed module.
 *
 * Three layers stacked in one stage element:
 *   1. a WebGL canvas that paints the globe per pixel from NASA Blue Marble (shader.ts), with sharper
 *      512px tiles streamed in when zoomed close (public/globe/tex/t/),
 *   2. a 2D "ink" canvas for anything drawn in pencil (borders, flight routes) through `pencil()`,
 *   3. an SVG overlay for the graticule, hit areas and anything that needs DOM events (city stamps).
 *
 * The interaction model (drag to turn, flick to coast, pinch / wheel to zoom about the pointer) and the
 * close-zoom tile streaming are WorldRewind's, unchanged in behaviour. What changed: no timeline or
 * historical borders here, and callers hook into each frame via `onInk` / `onOverlay` instead of globals.
 */
import {
  geoOrthographic, geoPath, geoRotation, geoGraticule, geoDistance, geoInterpolate,
  select, interpolate, timer, easeCubicInOut, randomLcg,
  type GeoProjection, type GeoPermissibleObjects, type Selection, type Timer,
} from 'd3';
import { VS, FS } from './shader';

export type LonLat = [number, number];
type Pt = [number, number];

export interface GlobeOptions {
  stage: HTMLElement;
  /** Base URL of the texture folder (earth.jpg, relief.png, water.png, t/index.json) */
  texBase: string;
  /** Starting centre of the view */
  center?: LonLat;
  /** Called on every frame, before the overlay. Draw on `ink` (CSS pixel space, already cleared). */
  onInk?: (g: Globe) => void;
  /** Called on every frame after the ink. Update SVG overlay positions here. */
  onOverlay?: (g: Globe, fast: boolean) => void;
  /** Clicked the globe itself (not a stamp) without dragging */
  onClick?: (ll: LonLat | null, ev: MouseEvent) => void;
  /** Pointer moved over the globe (null when it left) */
  onHover?: (pt: Pt | null, ev?: PointerEvent) => void;
  /** Left gutter in px kept clear (e.g. a side card), for centring the globe */
  rightInset?: () => number;
}

export interface Globe {
  projection: GeoProjection;
  ink: CanvasRenderingContext2D;
  svg: Selection<SVGSVGElement, unknown, null, undefined>;
  /** Layer inside the SVG for callers' own elements, above the graticule */
  layer: Selection<SVGGElement, unknown, null, undefined>;
  readonly k: number;
  readonly W: number;
  readonly H: number;
  render(fast?: boolean): void;
  renderSoon(fast?: boolean): void;
  relayout(): void;
  flyTo(target: LonLat | null, k?: number, ms?: number): void;
  zoomBy(f: number): void;
  /** Project any GeoJSON lines into screen polylines (flat [x0,y0,x1,y1,...] arrays), clipped to the visible side */
  lines(geo: GeoPermissibleObjects): number[][];
  /** Stroke-ready path of hand-drawn wobble over `lines` (see pencil() below) */
  pencil(lines: number[][], amp: number, f: number, amp2: number, f2: number, seed: number, gaps?: [number, number]): void;
  /** Is this point on the side of the globe facing us? */
  visible(ll: LonLat): boolean;
  stopIdle(): void;
  readonly reduceMotion: boolean;
}

export function createGlobe(o: GlobeOptions): Globe {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stage = o.stage;
  const mk = <K extends 'canvas'>(tag: K, cls: string) => { const e = document.createElement(tag); e.className = cls; stage.appendChild(e); return e; };
  const globeCanvas = mk('canvas', 'g-globe');
  const inkCanvas = mk('canvas', 'g-ink');
  const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svgEl.setAttribute('class', 'g-svg');
  svgEl.setAttribute('role', 'img');
  svgEl.setAttribute('aria-label', 'Globe of flight routes. Drag to turn, scroll or pinch to zoom.');
  stage.appendChild(svgEl);
  const svg = select(svgEl);

  /* ---------- Projection state ---------- */
  let W = 0, H = 0, dpr = 1, R0 = 1, k = 1, CX = 0, CY = 0;
  const c0 = o.center ?? [-30, 35];
  let rot: [number, number, number] = [-c0[0], -c0[1], 0];
  const projection = geoOrthographic().clipAngle(90).precision(.5);
  const path = geoPath(projection);

  function layout() {
    W = stage.clientWidth; H = stage.clientHeight; dpr = Math.min(2, window.devicePixelRatio || 1);
    const inset = W > 720 ? (o.rightInset?.() ?? 0) : 0;
    const x1 = W - inset;
    CX = x1 / 2; CY = H / 2 + (W > 720 ? 0 : -10);
    R0 = Math.max(120, Math.min(x1, H) / 2 - (W > 720 ? 30 : 18));
    projection.translate([CX, CY]).scale(R0 * k).rotate(rot).clipExtent([[-30, -30], [W + 30, H + 30]]);
    for (const c of [globeCanvas, inkCanvas]) { c.width = W * dpr; c.height = H * dpr; }
    detAlloc();
  }

  /* ---------- WebGL globe ---------- */
  const gl = globeCanvas.getContext('webgl', { premultipliedAlpha: false, antialias: false });
  let glReady = false;
  let prog: WebGLProgram | null = null;
  const uni: Record<string, WebGLUniformLocation | null> = {};
  let uniDet: { n: WebGLUniformLocation | null; w: WebGLUniformLocation | null; o: WebGLUniformLocation | null; s: WebGLUniformLocation | null; on: WebGLUniformLocation | null }[] = [];
  if (!gl) stage.classList.add('no-webgl');

  function initGL() {
    if (!gl) return;
    const sh = (t: number, s: string) => { const x = gl.createShader(t)!; gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(x)); return x; };
    prog = gl.createProgram()!; gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog); gl.useProgram(prog);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    for (const n of ['uRes', 'uC', 'uR', 'uM', 'uDpr', 'uE', 'uRel', 'uDay', 'uRelief', 'uWater']) uni[n] = gl.getUniformLocation(prog, n);
    uniDet = [0, 1].map(i => {
      const g = (n: string) => gl.getUniformLocation(prog!, `uD${i}${n}`);
      gl.uniform1i(g(''), 3 + i); gl.uniform1f(g('On'), 0);
      return { n: g('N'), w: g('W'), o: g('O'), s: g('S'), on: g('On') };
    });
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    let loaded = 0;
    ([['uDay', 'earth.jpg', 0], ['uRelief', 'relief.png', 1], ['uWater', 'water.png', 2]] as const).forEach(([u, src, unit]) => {
      const img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = () => {
        const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.uniform1i(uni[u], unit);
        if (++loaded === 3) { glReady = true; stage.classList.add('ready'); render(); }
      };
      img.src = o.texBase + src;
    });
    fetch(o.texBase + 't/index.json').then(r => r.ok ? r.json() : null)
      .then(j => { if (j && j.levels) { DET.idx = j; detAlloc(); renderSoon(); } }).catch(() => {});
  }

  /* ---------- Close-zoom tiles (see WorldRewind's index.html for the long explanation) ----------
     Two layers of 512px tiles, each one texture of SX by SY slots sized to the screen: a wide layer that
     covers the screen and, when that is not sharp enough, a sharp one round the middle. A tile always goes
     in slot (x mod SX, y mod SY), so turning the globe only swaps the tiles that come into view. */
  const TS = 512;
  interface Level { w: number; h: number; nx: number; ny: number; have: string }
  interface Win { L: number; x: number; y: number }
  interface Layer { unit: number; tex: WebGLTexture | null; SX: number; SY: number; cur: Win | null; want: Win | null; slots: (string | null)[]; retry?: number }
  interface Entry { img: ImageBitmap | HTMLImageElement | null; ok: boolean; p: Promise<void> }
  const DET: { idx: { levels: Level[] } | null; zeros: Uint8Array | null; cache: Map<string, Entry>; layers: Layer[] } = {
    idx: null, zeros: null, cache: new Map(),
    layers: [0, 1].map(i => ({ unit: 3 + i, tex: null, SX: 4, SY: 4, cur: null, want: null, slots: [] })),
  };
  function detAlloc() {
    if (!DET.idx || !gl) return;
    const max = Math.floor(gl.getParameter(gl.MAX_TEXTURE_SIZE) / TS);
    const sx = Math.min(max, Math.max(4, Math.min(10, Math.ceil(W * dpr * 1.6 / TS) + 2)));
    const sy = Math.min(max, Math.max(4, Math.min(6, Math.ceil(H * dpr * 1.1 / TS) + 2)));
    for (const ly of DET.layers) {
      if (ly.tex && sx === ly.SX && sy === ly.SY) continue;
      ly.SX = sx; ly.SY = sy; ly.slots = []; ly.cur = null; ly.want = null;
      if (ly.tex) { gl.deleteTexture(ly.tex); ly.tex = null; }
    }
  }
  function detTex(ly: Layer) {
    if (ly.tex || !gl) return;
    ly.tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + ly.unit); gl.bindTexture(gl.TEXTURE_2D, ly.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, ly.SX * TS, ly.SY * TS, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }
  function detTargets(): [Win | null, Win | null] {
    const idx = DET.idx!, [lo, hi] = DET.layers;
    const circ = 2 * Math.PI * R0 * k * dpr;
    if (circ < 2048 * 1.3) return [null, null];
    const c = projection.invert!([CX, CY])!;
    let x0 = 1e9, x1 = -1e9, y0 = 90, y1 = -90, n = 0;
    for (let i = 0; i <= 8; i++) for (let j = 0; j <= 6; j++) {
      const p: Pt = [W * i / 8, H * j / 6], r = Math.hypot(p[0] - CX, p[1] - CY) / (R0 * k);
      if (r > .94) continue;
      const ll = projection.invert!(p); if (!ll || !isFinite(ll[0])) continue;
      let dl = ll[0] - c[0]; if (dl > 180) dl -= 360; if (dl < -180) dl += 360;
      x0 = Math.min(x0, c[0] + dl); x1 = Math.max(x1, c[0] + dl); y0 = Math.min(y0, ll[1]); y1 = Math.max(y1, ll[1]); n++;
    }
    if (!n) return [null, null];
    let need = idx.levels.findIndex(lv => lv.w >= circ * .7); if (need < 0) need = idx.levels.length - 1;
    const box = (L: number) => {
      const lv = idx.levels[L];
      const tx = (lon: number) => Math.floor((lon + 180) / 360 * lv.w / TS);
      const ty = (lat: number) => Math.max(0, Math.min(lv.ny - 1, Math.floor((90 - lat) / 180 * lv.h / TS)));
      return { L, lv, a: tx(x0), b: tx(x1), top: ty(y1), bot: ty(y0), cx: tx(c[0]), cy: ty(c[1]) };
    };
    let wide: ReturnType<typeof box> | null = null;
    for (let L = 0; L <= need; L++) { const bx = box(L); if (bx.b - bx.a + 1 > lo.SX || bx.bot - bx.top + 1 > lo.SY) break; wide = bx; }
    const t0 = wide ? place(lo, wide, wide.a, wide.b, wide.top, wide.bot) : null;
    let t1: Win | null = null;
    if (!wide || wide.L < need) {
      const bx = box(need), mx = Math.floor((hi.SX - 1) / 2) - 1, my = Math.floor((hi.SY - 1) / 2) - 1;
      t1 = place(hi, bx, bx.cx - mx, bx.cx + mx, Math.max(0, bx.cy - my), Math.min(bx.lv.ny - 1, bx.cy + my));
    }
    return [t0, t1];
  }
  function place(ly: Layer, bx: { L: number; lv: Level }, a: number, b: number, top: number, bot: number): Win {
    const lv = bx.lv, w = ly.want;
    if (w && w.L === bx.L && ((a - w.x) % lv.nx + lv.nx) % lv.nx + (b - a) < ly.SX && top >= w.y && bot < w.y + ly.SY) return w;
    const x = (((a - Math.floor((ly.SX - (b - a + 1)) / 2)) % lv.nx) + lv.nx) % lv.nx;
    const y = Math.max(0, Math.min(Math.max(0, lv.ny - ly.SY), top - Math.floor((ly.SY - (bot - top + 1)) / 2)));
    return { L: bx.L, x, y };
  }
  function detTiles(ly: Layer, w: Win) {
    const lv = DET.idx!.levels[w.L], out: { key: string; have: boolean; slot: number; sx: number; sy: number }[] = [];
    for (let i = 0; i < ly.SX && i < lv.nx; i++) for (let j = 0; j < ly.SY && w.y + j < lv.ny; j++) {
      const u = w.x + i, tx = u % lv.nx, ty = w.y + j;
      out.push({ key: `${w.L}/${tx}_${ty}`, have: lv.have[ty * lv.nx + tx] === '1', slot: (ty % ly.SY) * ly.SX + (u % ly.SX), sx: u % ly.SX, sy: ty % ly.SY });
    }
    return out;
  }
  function detImg(t: { key: string }): Promise<void> {
    let e = DET.cache.get(t.key);
    if (e) { DET.cache.delete(t.key); DET.cache.set(t.key, e); return e.p; }
    const ent: Entry = { img: null, ok: false, p: Promise.resolve() };
    const url = o.texBase + 't/' + t.key + '.webp';
    if ('createImageBitmap' in window) {
      ent.p = fetch(url).then(r => { if (!r.ok) throw r.status; return r.blob(); })
        .then(b => createImageBitmap(b, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }))
        .then(bm => { ent.img = bm; ent.ok = true; }, () => {});
    } else {
      const img = new Image(); ent.img = img; img.crossOrigin = 'anonymous'; img.decoding = 'async'; img.src = url;
      ent.p = img.decode().then(() => { ent.ok = true; }, () => {});
    }
    DET.cache.set(t.key, ent);
    const lo = DET.layers[0];
    while (DET.cache.size > lo.SX * lo.SY * 3 + 8) {
      const old = DET.cache.keys().next().value as string, x = DET.cache.get(old)!;
      DET.cache.delete(old);
      const close = () => { if (x.img && 'close' in x.img) x.img.close(); };
      if (x.ok) close(); else x.p.then(close);
    }
    return ent.p;
  }
  function detUpdate() {
    if (!DET.idx) return;
    const ts = detTargets();
    DET.layers.forEach((ly, i) => {
      const w = ts[i];
      if (w === ly.want || (w && ly.want && w.L === ly.want.L && w.x === ly.want.x && w.y === ly.want.y)) return;
      ly.want = w;
      if (!w) return;
      Promise.all(detTiles(ly, w).filter(t => t.have && ly.slots[t.slot] !== t.key).map(detImg)).then(() => { if (ly.want === w) detCommit(ly, w); });
    });
  }
  function detCommit(ly: Layer, w: Win) {
    if (!gl) return;
    detTex(ly);
    gl.activeTexture(gl.TEXTURE0 + ly.unit); gl.bindTexture(gl.TEXTURE_2D, ly.tex);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    for (const t of detTiles(ly, w)) {
      if (ly.slots[t.slot] === t.key) continue;
      const e = t.have ? DET.cache.get(t.key) : undefined;
      let up = false;
      if (e && e.ok && e.img) try {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, t.sx * TS, t.sy * TS, gl.RGBA, gl.UNSIGNED_BYTE, e.img); up = true;
        if ('close' in e.img) { e.img.close(); DET.cache.delete(t.key); }
      } catch { DET.cache.delete(t.key); }
      if (!up) gl.texSubImage2D(gl.TEXTURE_2D, 0, t.sx * TS, t.sy * TS, TS, TS, gl.RGBA, gl.UNSIGNED_BYTE, DET.zeros || (DET.zeros = new Uint8Array(TS * TS * 4)));
      ly.slots[t.slot] = !t.have || up ? t.key : null;
    }
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.BROWSER_DEFAULT_WEBGL);
    ly.cur = w; renderSoon(true);
    const miss = detTiles(ly, w).some(t => t.have && ly.slots[t.slot] !== t.key);
    if (miss && (ly.retry = (ly.retry || 0) + 1) <= 2) ly.want = null; else if (!miss) ly.retry = 0;
  }

  // d3 rotation inverse as a matrix: maps rotated-sphere cartesian to geographic cartesian
  function rotMatrix() {
    const r = geoRotation(rot);
    const toLL = (v: number[]): Pt => [Math.atan2(v[1], v[0]) * 180 / Math.PI, Math.asin(Math.max(-1, Math.min(1, v[2]))) * 180 / Math.PI];
    const toV = ([lo, la]: Pt) => { lo *= Math.PI / 180; la *= Math.PI / 180; return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)]; };
    const cols = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map(e => toV(r.invert(toLL(e))));
    return new Float32Array([...cols[0], ...cols[1], ...cols[2]]);
  }
  function drawGlobe() {
    if (!glReady || !gl) return;
    detUpdate();
    gl.viewport(0, 0, globeCanvas.width, globeCanvas.height);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(uni.uRes, globeCanvas.width, globeCanvas.height);
    gl.uniform2f(uni.uC, CX * dpr, CY * dpr);
    gl.uniform1f(uni.uR, R0 * k * dpr); gl.uniform1f(uni.uDpr, dpr);
    gl.uniform1f(uni.uE, Math.min(1 / 1024, 2 / (2 * Math.PI * R0 * k)));
    gl.uniform1f(uni.uRel, Math.max(0, Math.min(1, (4 - k) / 2.5)));
    gl.uniformMatrix3fv(uni.uM, false, rotMatrix());
    DET.layers.forEach((ly, i) => {
      const w = ly.cur, on = !!(w && ly.want && ly.tex), u = uniDet[i];
      gl.uniform1f(u.on, on ? 1 : 0);
      if (!on || !w) return;
      const lv = DET.idx!.levels[w.L];
      gl.uniform2f(u.n, lv.w / TS, lv.h / TS); gl.uniform1f(u.w, lv.nx); gl.uniform2f(u.o, w.x, w.y); gl.uniform2f(u.s, ly.SX, ly.SY);
    });
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /* ---------- SVG overlay: pencil filters, graticule, caller layer ---------- */
  svg.append('defs').html(`
    <filter id="pencil" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="3" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="2.4" xChannelSelector="R" yChannelSelector="G"/></filter>
    <filter id="seal" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".09" numOctaves="2" seed="5" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="5" xChannelSelector="R" yChannelSelector="G"/></filter>`);
  const grat = svg.append('path').attr('class', 'grat');
  const GRAT = geoGraticule().step([15, 15])();
  const layer = svg.append('g').attr('class', 'g-layer');

  /* ---------- Ink canvas and the pencil ---------- */
  const ink = inkCanvas.getContext('2d')!;
  const rec = {
    lines: [] as number[][], cur: [] as number[],
    moveTo(x: number, y: number) { this.cur = [x, y]; this.lines.push(this.cur); },
    lineTo(x: number, y: number) { this.cur.push(x, y); }, closePath() {}, arc() {},
  };
  const recPath = geoPath(projection, rec as unknown as CanvasRenderingContext2D);
  const NZ = new Float32Array(65536); { const r = randomLcg(13); for (let i = 0; i < NZ.length; i++) NZ[i] = r() * 2 - 1; }
  const nz = (i: number, j: number, l: number) => NZ[(Math.imul(i, 73856093) ^ Math.imul(j, 19349663) ^ Math.imul(l, 83492791)) & 65535];
  function noise(x: number, y: number, z: number) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), fx = x - xi, fy = y - yi, fz = z - zi;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz);
    const a = nz(xi, yi, zi), b = nz(xi + 1, yi, zi), c = nz(xi, yi + 1, zi), d = nz(xi + 1, yi + 1, zi);
    const e = nz(xi, yi, zi + 1), f = nz(xi + 1, yi, zi + 1), g = nz(xi, yi + 1, zi + 1), h = nz(xi + 1, yi + 1, zi + 1);
    const p = a + (b - a) * ux, q = c + (d - c) * ux, r = e + (f - e) * ux, s = g + (h - g) * ux;
    const m = p + (q - p) * uy; return m + (r + (s - r) * uy - m) * uz;
  }
  /* One pencil pass: every segment is cut into short steps, each pushed aside by noise read at the point's
     place ON THE GLOBE, so the wobble turns with the land instead of crawling along the line.
     amp/f: slow sway; amp2/f2: fine tremor; gaps [f, t]: lift the pencil where the noise rises above t. */
  function pencil(lines: number[][], amp: number, f: number, amp2: number, f2: number, seed: number, gaps?: [number, number]) {
    ink.beginPath();
    const M = rotMatrix(), R = R0 * k, sx = seed * 37.1, sy = seed * 91.7, step = 3.5;
    const gf = gaps ? gaps[0] : 0, gt = gaps ? gaps[1] : 0;
    let lx = 0, ly = 0, lg = -1, down = false;
    const go = (x: number, y: number, first?: boolean) => {
      const qx = (x - CX) / R, qy = (CY - y) / R, z = Math.sqrt(Math.max(0, 1 - qx * qx - qy * qy));
      const X = (M[0] * z + M[3] * qx + M[6] * qy) * R, Y = (M[1] * z + M[4] * qx + M[7] * qy) * R, Zc = (M[2] * z + M[5] * qx + M[8] * qy) * R;
      let ox = amp * noise(X * f + sx, Y * f + sy, Zc * f), oy = amp * noise(X * f + sy + 50, Y * f + sx, Zc * f + 17);
      if (amp2) { ox += amp2 * noise(X * f2 + sy, Y * f2 + 7, Zc * f2 + sx); oy += amp2 * noise(X * f2 + 3, Y * f2 + sx, Zc * f2 + sy); }
      const px = x + ox, py = y + oy, g = gaps ? noise(X * gf + sy, Y * gf + 29, Zc * gf + sx) : -1, up = g > gt;
      if (first) { if (!up) ink.moveTo(px, py); down = !up; }
      else if (up === !down) { if (down) ink.lineTo(px, py); }
      else {
        const t = (gt - lg) / (g - lg), mx = lx + (px - lx) * t, my = ly + (py - ly) * t;
        if (down) ink.lineTo(mx, my); else { ink.moveTo(mx, my); ink.lineTo(px, py); }
        down = !up;
      }
      lx = px; ly = py; lg = g;
    };
    for (const L of lines) {
      let px = L[0], py = L[1]; go(px, py, true);
      for (let i = 2; i < L.length; i += 2) {
        const x = L[i], y = L[i + 1], dx = x - px, dy = y - py, n = Math.ceil(Math.hypot(dx, dy) / step);
        for (let s = 1; s <= n; s++) go(px + dx * s / n, py + dy * s / n);
        px = x; py = y;
      }
    }
  }
  function lines(geo: GeoPermissibleObjects) { rec.lines = []; recPath(geo); return rec.lines; }

  function visible(ll: LonLat) {
    const c = projection.invert!([CX, CY])!;
    return geoDistance(ll, c) < Math.PI / 2 - .02;
  }

  /* ---------- Frame ---------- */
  function render(fast = false) {
    projection.rotate(rot).scale(R0 * k);
    drawGlobe();
    grat.attr('d', path(GRAT));
    ink.setTransform(dpr, 0, 0, dpr, 0, 0); ink.clearRect(0, 0, W, H);
    ink.lineJoin = 'round'; ink.lineCap = 'round';
    o.onInk?.(api);
    o.onOverlay?.(api, fast);
    svg.classed('zoomed', k > 1.7);
  }
  let renderQueued = 0, renderFast = true;
  function renderSoon(fast?: boolean) {
    renderFast = renderFast && !!fast;
    if (!renderQueued) renderQueued = requestAnimationFrame(() => { renderQueued = 0; const f = renderFast; renderFast = true; render(f); });
  }

  /* ---------- Interaction: drag to turn, pinch, wheel or buttons to zoom ---------- */
  let anim: Timer | null = null, idleT: Timer | null = null;
  const kMax = () => DET.idx ? Math.max(6, Math.min(18, 2600 / R0)) : (R0 < 260 ? 6 : 5);
  const setK = (v: number) => { k = Math.max(.8, Math.min(kMax(), v)); };
  const turnBy = (dx: number, dy: number) => { const s = Math.max(.25, 57 / R0) / k; rot = [rot[0] + dx * s, Math.max(-75, Math.min(75, rot[1] - dy * s)), 0]; };
  function zoomAt(kTo: number, at?: Pt | null) {
    const a = at && projection.invert!(at);
    setK(kTo); projection.scale(R0 * k);
    const b = at && projection.invert!(at);
    if (a && b && isFinite(a[0] + b[0]) && geoDistance(a, projection.invert!([CX, CY])!) < 1.2) {
      let dl = b[0] - a[0]; if (dl > 180) dl -= 360; if (dl < -180) dl += 360;
      rot = [rot[0] + dl, Math.max(-75, Math.min(75, rot[1] + b[1] - a[1])), 0];
    }
  }
  const ptrs = new Map<number, Pt>();
  let gest: { m: Pt; d: number } | null = null, moving = false, swallowClick = false, down: Pt = [0, 0], vel: Pt = [0, 0], lastT = 0;
  let rect = svgEl.getBoundingClientRect();
  const at = (ev: { clientX: number; clientY: number }): Pt => [ev.clientX - rect.left, ev.clientY - rect.top];
  function regrip() {
    const p = [...ptrs.values()];
    gest = p.length > 1 ? { m: [(p[0][0] + p[1][0]) / 2, (p[0][1] + p[1][1]) / 2], d: Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]) || 1 } : p.length ? { m: p[0], d: 0 } : null;
  }
  function stopIdle() { if (idleT) { idleT.stop(); idleT = null; } }
  svgEl.addEventListener('pointerdown', ev => {
    if (ev.button > 0) return;
    if ((ev.target as Element).closest('.stamp')) return;
    rect = svgEl.getBoundingClientRect();
    if (!ptrs.size) { moving = false; swallowClick = false; stopIdle(); anim?.stop(); anim = null; zoomStop(); down = at(ev); vel = [0, 0]; lastT = ev.timeStamp; }
    ptrs.set(ev.pointerId, at(ev)); regrip();
    if (ptrs.size > 1) moving = true;
  });
  window.addEventListener('pointermove', ev => {
    if (!ptrs.has(ev.pointerId) || !gest) return;
    if (ev.pointerType === 'mouse' && !ev.buttons) return lift(ev);
    ptrs.set(ev.pointerId, at(ev));
    const p = [...ptrs.values()];
    if (p.length > 1) {
      const m: Pt = [(p[0][0] + p[1][0]) / 2, (p[0][1] + p[1][1]) / 2], d = Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]) || 1;
      turnBy(m[0] - gest.m[0], m[1] - gest.m[1]);
      zoomAt(k * d / gest.d, m);
      gest = { m, d };
    } else {
      const dx = p[0][0] - gest.m[0], dy = p[0][1] - gest.m[1];
      if (!moving && Math.hypot(p[0][0] - down[0], p[0][1] - down[1]) >= (ev.pointerType === 'mouse' ? 3 : 8)) moving = true;
      turnBy(dx, dy); gest = { m: p[0], d: 0 };
      const dt = Math.max(1, ev.timeStamp - lastT); lastT = ev.timeStamp;
      vel = [vel[0] * .4 + dx / dt * .6, vel[1] * .4 + dy / dt * .6];
    }
    svg.classed('moving', true); renderSoon(true);
  }, { passive: true });
  function lift(ev: PointerEvent) {
    if (!ptrs.delete(ev.pointerId)) return;
    regrip();
    if (ptrs.size) return;
    if (moving) { swallowClick = true; setTimeout(() => { swallowClick = false; }, 400); }
    svg.classed('moving', false); renderSoon(false);
    const v = vel; vel = [0, 0];
    if (!reduce && moving && ev.timeStamp - lastT < 80 && Math.hypot(v[0], v[1]) > .25) {
      let last = 0, vx = v[0], vy = v[1];
      const a = anim = timer(el => {
        const dt = Math.min(40, el - last); last = el;
        const f = Math.pow(.94, dt / 16); vx *= f; vy *= f;
        turnBy(vx * dt, vy * dt); render(true);
        if (Math.hypot(vx, vy) < .02) { a.stop(); anim = null; render(); }
      });
    }
  }
  window.addEventListener('pointerup', lift); window.addEventListener('pointercancel', lift);
  svgEl.addEventListener('click', ev => {
    if (swallowClick) { ev.stopPropagation(); ev.preventDefault(); swallowClick = false; return; }
    if ((ev.target as Element).closest('.stamp')) return;
    const ll = projection.invert!(at(ev));
    o.onClick?.(ll && isFinite(ll[0]) && visible(ll as LonLat) ? ll as LonLat : null, ev);
  }, true);
  stage.addEventListener('touchmove', ev => { if (!(ev.target as Element).closest('.card')) ev.preventDefault(); }, { passive: false });
  for (const t of ['gesturestart', 'gesturechange']) stage.addEventListener(t, ev => ev.preventDefault());
  let zoomGoal: number | null = null, zoomPt: Pt | null = null, zoomRaf = 0;
  function zoomStop() { if (zoomRaf) cancelAnimationFrame(zoomRaf); zoomRaf = 0; zoomGoal = null; }
  function zoomStep() {
    const d = Math.log(zoomGoal! / k);
    if (Math.abs(d) < .003) { zoomAt(zoomGoal!, zoomPt); zoomRaf = 0; zoomGoal = null; render(); return; }
    zoomAt(k * Math.exp(d * .3), zoomPt); render(true);
    zoomRaf = requestAnimationFrame(zoomStep);
  }
  svgEl.addEventListener('wheel', ev => {
    ev.preventDefault(); stopIdle(); anim?.stop(); anim = null;
    rect = svgEl.getBoundingClientRect();
    const f = ev.ctrlKey ? .01 : ev.deltaMode === 1 ? .05 : .0015;
    zoomGoal = Math.max(.8, Math.min(kMax(), (zoomGoal ?? k) * Math.exp(-Math.max(-300, Math.min(300, ev.deltaY)) * f)));
    zoomPt = at(ev);
    if (!zoomRaf) zoomRaf = requestAnimationFrame(zoomStep);
  }, { passive: false });
  let hoverRaf = 0;
  svgEl.addEventListener('pointermove', ev => {
    if (ev.pointerType === 'touch' || ptrs.size) return;
    rect = svgEl.getBoundingClientRect();
    const p = at(ev);
    if (!hoverRaf) hoverRaf = requestAnimationFrame(() => { hoverRaf = 0; o.onHover?.(p, ev); });
  });
  svgEl.addEventListener('pointerleave', () => o.onHover?.(null));

  function flyTo(target: LonLat | null, kTo?: number, ms = 1100) {
    stopIdle();
    const r0 = rot.slice() as [number, number, number], k0 = k;
    let r1 = r0;
    if (target) {
      r1 = [-target[0], Math.max(-60, Math.min(60, -target[1])), 0];
      while (r1[0] - r0[0] > 180) r1[0] -= 360; while (r0[0] - r1[0] > 180) r1[0] += 360;
    }
    const kk = Math.max(.8, Math.min(kMax(), kTo ?? k));
    const ir = interpolate(r0, r1);
    anim?.stop(); zoomStop();
    if (reduce) { rot = r1; k = kk; return render(); }
    const a = anim = timer(el => {
      const t = Math.min(1, el / ms), e = easeCubicInOut(t);
      rot = ir(e) as [number, number, number]; k = k0 + (kk - k0) * e;
      if (t >= 1) { a.stop(); anim = null; render(); } else render(true);
    });
  }

  // A slow idle turn, like a globe on a stand, until the first touch
  function startIdle() {
    if (reduce) return;
    let last = 0;
    idleT = timer(el => {
      const dt = Math.min(50, el - last); last = el;
      rot = [rot[0] + dt * .0035, rot[1], 0]; render(true);
    });
  }

  const ro = new ResizeObserver(() => { layout(); rect = svgEl.getBoundingClientRect(); render(); });

  const api: Globe = {
    projection, ink, svg, layer,
    get k() { return k; }, get W() { return W; }, get H() { return H; },
    render, renderSoon,
    relayout() { layout(); render(); },
    flyTo,
    zoomBy(f: number) { flyTo(null, k * f, 420); },
    lines, pencil, visible, stopIdle,
    reduceMotion: reduce,
  };

  layout();
  initGL();
  ro.observe(stage);
  render();
  startIdle();
  return api;
}

/** Points along the great circle from a to b, for drawing a route */
export function greatCircle(a: LonLat, b: LonLat, n?: number): LonLat[] {
  const ip = geoInterpolate(a, b), d = geoDistance(a, b);
  const steps = n ?? Math.max(8, Math.ceil(d * 40));
  return Array.from({ length: steps + 1 }, (_, i) => ip(i / steps) as LonLat);
}

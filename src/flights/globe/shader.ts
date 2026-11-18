// Ported from WorldRewind (patrickfreyer/history-map, public/index.html): the paper and ink shader globe.
// Kept byte-for-byte apart from this header, so fixes there can be carried over.

export const VS = `attribute vec2 p; void main(){ gl_Position = vec4(p,0.,1.); }`;

export const FS = `precision highp float;
uniform vec2 uRes; uniform vec2 uC; uniform float uR; uniform mat3 uM; uniform float uDpr; uniform float uE; uniform float uRel;
uniform sampler2D uDay; uniform sampler2D uRelief; uniform sampler2D uWater;
// close-zoom tiles, a wide layer (uD0) and a sharp one (uD1): N = tiles round the world and top to bottom at its level,
// W = whole tiles across, O = the window's first tile, S = slots in the layer's texture, On = 0 when the layer is off
uniform sampler2D uD0; uniform vec2 uD0N; uniform float uD0W; uniform vec2 uD0O; uniform vec2 uD0S; uniform float uD0On;
uniform sampler2D uD1; uniform vec2 uD1N; uniform float uD1W; uniform vec2 uD1O; uniform vec2 uD1S; uniform float uD1On;
const float PI = 3.14159265;
const vec3 PAPER = vec3(.937,.902,.824);
const vec3 INK = vec3(.17,.13,.086);
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
vec4 layer(sampler2D tex, vec2 N, float Wd, vec2 O, vec2 S, float on, vec2 uv){
  vec2 t = uv * N, ti = floor(t);
  vec2 rel = vec2(mod(ti.x - O.x, Wd), ti.y - O.y);
  float inside = step(rel.x, S.x - .5) * step(0., rel.y) * step(rel.y, S.y - .5);
  vec2 slot = mod(O + rel, S);
  // stay half a pixel inside the tile, so filtering never reaches the next slot, which holds another place
  vec2 f = clamp(t - ti, .5 / 512., 1. - .5 / 512.);
  return texture2D(tex, (slot + f) / S) * inside * on;
}
// the sharp layer where it has a tile, else the wide one; alpha 0 means neither has one here
vec4 detail(vec2 uv){
  vec4 a = layer(uD1, uD1N, uD1W, uD1O, uD1S, uD1On, uv);
  return a.a > .25 ? a : layer(uD0, uD0N, uD0W, uD0O, uD0S, uD0On, uv);
}
// water from the sharp tile where there is one (alpha 255 is land, 128 water, 0 no tile), else from the small mask
float wat(vec2 p){
  if (uD0On + uD1On < .5) return texture2D(uWater, p).r;
  vec4 t = detail(p);
  return mix(texture2D(uWater, p).r, clamp((1. - t.a) * 2., 0., 1.), step(.25, t.a));
}
void main(){
  vec2 frag = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 q = (frag - uC) / uR;
  float d = length(q);
  // outside the globe: only a soft shadow on the paper, so skip all the picture work there
  if (d > 1.0) { gl_FragColor = vec4(INK, smoothstep(1.07, 1.0, d) * .16); return; }
  float z = sqrt(max(0., 1.0 - d*d));
  vec3 c = uM * vec3(z, q.x, -q.y);
  float lon = atan(c.y, c.x), lat = asin(clamp(c.z, -1.0, 1.0));
  vec2 uv = vec2((lon + PI) / (2.0*PI), (PI*.5 - lat) / PI);
  vec3 day = texture2D(uDay, uv).rgb;
  float water = texture2D(uWater, uv).r;
  // sharper picture where its tiles have loaded
  vec4 dt = uD0On + uD1On > .5 ? detail(uv) : vec4(0.);
  float has = step(.25, dt.a);
  day = mix(day, dt.rgb, has);
  water = mix(water, clamp((1. - dt.a) * 2., 0., 1.), has);
  float h = texture2D(uRelief, uv).r;
  float hx = texture2D(uRelief, uv + vec2(1.0/1024.0, 0.)).r - h;
  float hy = texture2D(uRelief, uv + vec2(0., 1.0/512.0)).r - h;
  float l = dot(day, vec3(.299,.587,.114));
  // land: sepia print of the satellite image, lifted toward the paper
  // up close the hill shading comes from the picture itself, so its contrast is lifted a little to carry the relief
  float ll = mix(l, clamp((l - .3) * 1.6 + .3, 0., 1.), (1. - uRel) * .8);
  vec3 sep = vec3(ll*1.05 + .10, ll*.95 + .08, ll*.72 + .04);
  vec3 land = mix(sep, day, .28);
  land = min(mix(land, PAPER, .46), vec3(.97,.94,.86));
  // hill shading from the small relief map; it turns into soft blobs up close, where the sharp picture has its own
  land *= .95 + clamp((hy - hx) * 6.0, -.12, .12) * uRel;
  // sea: flat watercolour wash, a little darker offshore
  vec3 sea = mix(vec3(.62,.70,.70), vec3(.80,.84,.80), smoothstep(.06, .30, l));
  vec3 col = mix(land, sea, smoothstep(.3, .7, water));
  // inked coastline where the water mask changes within uE: about a texel of the small mask when zoomed out,
  // and a fixed couple of screen pixels when zoomed in, so the line stays fine instead of swelling
  vec2 e = vec2(uE, uE * 2.);
  float edge = abs(wat(uv + vec2(e.x,0.)) - wat(uv - vec2(e.x,0.))) + abs(wat(uv + vec2(0.,e.y)) - wat(uv - vec2(0.,e.y)));
  col = mix(col, INK, smoothstep(.25, .9, edge) * .5);
  // light from the upper left; pencil hatching on the shadow side
  vec3 L = normalize(vec3(-.5, .45, .74));
  float ndl = dot(vec3(q.x, -q.y, z), L);
  vec2 sp = frag / uDpr;
  float hatch = step(.62, fract((sp.x - sp.y) / 4.0));
  float hatch2 = step(.70, fract((sp.x + sp.y) / 4.0));
  float shade = smoothstep(.15, -.55, ndl);
  col = mix(col, col * .74, shade * hatch * .95);
  col = mix(col, col * .80, smoothstep(-.25, -.75, ndl) * hatch2 * .9);
  col *= .95 + .08 * max(ndl, 0.0);
  // paper grain and an inked rim
  col += (hash(floor(sp * 1.2)) - .5) * .07;
  col = mix(col, INK, smoothstep(.90, 1.0, d) * .18);
  col = mix(col, INK, smoothstep(.988, .999, d) * .85);
  // outside the globe: a soft shadow on the paper
  gl_FragColor = vec4(col, 1.0);
}`;

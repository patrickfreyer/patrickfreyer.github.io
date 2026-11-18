# Globe textures

Copied unchanged from WorldRewind (`patrickfreyer/history-map`, `public/tex/`), built there by
`scripts/build_tiles.py` from NASA Blue Marble (September, public domain) and Natural Earth land
and lakes (public domain).

- `earth.jpg`, `relief.png`, `water.png`: the small whole-world pictures the shader starts from
- `t/<level>/<x>_<y>.webp` + `t/index.json`: 512px close-zoom tiles (alpha = land/water mask)

To refresh them, rerun the WorldRewind script and copy `public/tex/` over this folder.
The shader that paints them lives in `src/flights/globe/shader.ts`.

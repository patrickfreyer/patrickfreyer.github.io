#!/usr/bin/env node
/**
 * One-shot earth texture optimizer.
 *
 * Background: JPEG compression only shrinks the *download*. The GPU cannot read
 * compressed data, so every texture is expanded to raw RGBA in video memory:
 *
 *     bytes_vram = width * height * 4 * (4/3)      // 4/3 = the mipmap chain
 *
 * At 4096x2048 that is ~44.7 MB per texture regardless of how small the .jpg is.
 * Six live textures came to ~313 MB of VRAM for a globe that renders at roughly
 * 600-800 px, where a 4096-wide map is heavily oversampled.
 *
 * Halving each dimension quarters the VRAM. Anisotropic filtering (set in
 * earth.js) keeps the surface sharp at grazing angles, which is what makes the
 * smaller maps look equivalent rather than merely smaller.
 *
 * Run once, review the result, and commit the rewritten files:
 *     npm run textures
 *
 * Pass --dry to preview without writing.
 */
import { readFile, writeFile, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const assets = join(root, 'public', 'assets');
const DRY = process.argv.includes('--dry');

// 4096x2048 is the resolution Patrick settled on in 583d378 (down from 8k).
// An earlier pass took these to 2048x1024 and the globe was visibly softer --
// the sphere fills a large part of the viewport on /flights/, so the earlier
// "renders at 600-800px" reasoning was wrong for the fullscreen view.
// Do not lower this without looking at /flights/ full-screen on a retina display.
const TARGET_W = 4096;
const TARGET_H = 2048;

// The six textures earth.js actually applies to a material.
const TEXTURES = [
  'earth_albedo.jpg',
  'earth_night.jpg',
  'earth_clouds.jpg',
  'earth_normal.jpg',
  'earth_specular.jpg',
  'earth_bump.jpg',
];

const vram = (w, h) => (w * h * 4 * 4) / 3;
const mb = (n) => (n / 1e6).toFixed(1);

let beforeDisk = 0, afterDisk = 0, beforeVram = 0, afterVram = 0;

for (const name of TEXTURES) {
  const path = join(assets, name);
  const src = await readFile(path);
  const meta = await sharp(src).metadata();

  beforeDisk += src.length;
  beforeVram += vram(meta.width, meta.height);

  if (meta.width <= TARGET_W) {
    afterDisk += src.length;
    afterVram += vram(meta.width, meta.height);
    console.log(`  skip   ${name.padEnd(22)} already ${meta.width}x${meta.height}`);
    continue;
  }

  const out = await sharp(src)
    .resize(TARGET_W, TARGET_H, { fit: 'fill', kernel: 'lanczos3' })
    .jpeg({ quality: 85, mozjpeg: true, chromaSubsampling: '4:2:0' })
    .toBuffer();

  afterDisk += out.length;
  afterVram += vram(TARGET_W, TARGET_H);

  if (!DRY) await writeFile(path, out);

  console.log(
    `  ${DRY ? 'would' : 'wrote'}  ${name.padEnd(22)}` +
    `${meta.width}x${meta.height} -> ${TARGET_W}x${TARGET_H}   ` +
    `disk ${mb(src.length)} -> ${mb(out.length)} MB   ` +
    `vram ${mb(vram(meta.width, meta.height))} -> ${mb(vram(TARGET_W, TARGET_H))} MB`,
  );
}

console.log(
  `\n  TOTAL  disk ${mb(beforeDisk)} -> ${mb(afterDisk)} MB` +
  `   vram ${mb(beforeVram)} -> ${mb(afterVram)} MB` +
  `   (${(100 * (1 - afterVram / beforeVram)).toFixed(0)}% less VRAM)`,
);

// The about-section portrait: a 975x926 PNG at ~1.08 MB was over half the
// remaining image payload once the textures shrank. It renders at ~300 px.
const portrait = join(assets, 'profile.png');
const before = (await stat(portrait)).size;
const shrunk = await sharp(portrait)
  .resize(800, null, { withoutEnlargement: true })
  .png({ compressionLevel: 9, palette: true, quality: 90 })
  .toBuffer();
if (!DRY && shrunk.length < before) await writeFile(portrait, shrunk);
console.log(`  portrait  profile.png  ${mb(before)} -> ${mb(shrunk.length)} MB`);

if (DRY) console.log('\n  --dry: nothing written.');

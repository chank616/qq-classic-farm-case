'use strict';

// Decodes cached Cocos PNGs, classifies them by the dominant colour of their
// visible pixels, and emits one small contact sheet per colour bucket so the
// official currency / crop icons can be picked out visually.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) return null;
  let pos = 8;
  let w = 0, h = 0, bitDepth = 8, colorType = 6, interlace = 0;
  const idat = [];
  let palette = null, trns = null;
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (!w || !h || bitDepth !== 8 || interlace !== 0) return null;
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : colorType === 4 ? 2 : colorType === 3 ? 1 : 0;
  if (!channels) return null;
  let raw;
  try { raw = zlib.inflateSync(Buffer.concat(idat)); } catch (_) { return null; }
  const stride = w * channels;
  const out = Buffer.alloc(h * stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const ft = raw[p++];
    const line = raw.subarray(p, p + stride); p += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev ? prev[x] : 0;
      const c = (prev && x >= channels) ? prev[x - channels] : 0;
      let v = line[x];
      if (ft === 1) v += a;
      else if (ft === 2) v += b;
      else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) {
        const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      cur[x] = v & 0xff;
    }
  }
  return { w, h, channels, data: out, palette, trns };
}

function classify(img) {
  const { w, h, channels, data, palette, trns } = img;
  let n = 0, r = 0, g = 0, b = 0, opaque = 0, transparent = 0;
  for (let i = 0; i < w * h; i++) {
    let R, G, B, A = 255;
    const o = i * channels;
    if (palette) {
      const idx = data[o];
      R = palette[idx * 3]; G = palette[idx * 3 + 1]; B = palette[idx * 3 + 2];
      if (trns && idx < trns.length) A = trns[idx];
    } else if (channels === 4) { R = data[o]; G = data[o + 1]; B = data[o + 2]; A = data[o + 3]; }
    else if (channels === 3) { R = data[o]; G = data[o + 1]; B = data[o + 2]; }
    else if (channels === 2) { R = G = B = data[o]; A = data[o + 1]; }
    else { R = G = B = data[o]; }
    if (A < 32) { transparent++; continue; }
    opaque++; r += R; g += G; b += B;
  }
  if (!opaque) return null;
  r /= opaque; g /= opaque; b /= opaque;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const sat = max === 0 ? 0 : (max - min) / max;
  let hue = 0;
  if (max !== min) {
    if (max === r) hue = 60 * (((g - b) / (max - min)) % 6);
    else if (max === g) hue = 60 * ((b - r) / (max - min) + 2);
    else hue = 60 * ((r - g) / (max - min) + 4);
  }
  if (hue < 0) hue += 360;
  return {
    r: Math.round(r), g: Math.round(g), b: Math.round(b),
    hue: Math.round(hue), sat: Number(sat.toFixed(3)),
    coverage: Number((opaque / (w * h)).toFixed(3)),
  };
}

const GC = process.argv[2];
const OUT = process.argv[3] || path.join(__dirname, '..', 'artifacts', 'icon-sheet');
const BUNDLES = (process.env.SHEET_BUNDLES || 'extraRes,plant,delayRes,mainscene').split(',');
const SIZES = (process.env.SHEET_SIZES || '100x100,150x150,96x97,108x108,128x128,44x44,167x166').split(',');

const buckets = { gold: [], green: [], blue: [], red: [], purple: [], white: [], other: [] };
let scanned = 0;

for (const b of BUNDLES) {
  const dir = path.join(GC, b);
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir)) {
    if (!f.toLowerCase().endsWith('.png')) continue;
    const p = path.join(dir, f);
    let img;
    try { img = decodePng(fs.readFileSync(p)); } catch (_) { continue; }
    if (!img) continue;
    if (SIZES.length && SIZES.indexOf(img.w + 'x' + img.h) === -1) continue;
    const c = classify(img);
    if (!c) continue;
    scanned++;
    const rec = Object.assign({ bundle: b, file: f, w: img.w, h: img.h }, c);
    let bucket;
    if (c.sat < 0.12) bucket = c.r > 170 ? 'white' : 'other';
    else if (c.hue >= 35 && c.hue < 70) bucket = 'gold';
    else if (c.hue >= 70 && c.hue < 165) bucket = 'green';
    else if (c.hue >= 165 && c.hue < 260) bucket = 'blue';
    else if (c.hue >= 260 && c.hue < 330) bucket = 'purple';
    else bucket = 'red';
    buckets[bucket].push(rec);
  }
}

fs.mkdirSync(OUT, { recursive: true });
const summary = {};
for (const [name, list] of Object.entries(buckets)) {
  summary[name] = list.length;
  list.sort(function (a, b) { return b.coverage - a.coverage; });
  const html = ['<!doctype html><meta charset="utf-8"><style>',
    'body{background:#111;color:#ddd;font:11px monospace;margin:8px}',
    '.g{display:flex;flex-wrap:wrap;gap:5px}',
    '.c{width:84px;text-align:center;background:#1c1c1c;padding:3px;border:1px solid #333}',
    '.c img{width:76px;height:76px;object-fit:contain;image-rendering:pixelated}',
    '.l{font-size:8px;word-break:break-all;color:#8ab}</style>',
    '<h3>' + name + ' — ' + list.length + ' icons</h3><div class="g">'];
  list.forEach(function (it, i) {
    const src = '/img/' + it.bundle + '/' + encodeURIComponent(it.file);
    html.push('<div class="c"><img src="' + src + '"><div class="l">#' + i + ' h' + it.hue +
      ' s' + it.sat + '<br>' + it.file.slice(-8) + '</div></div>');
  });
  html.push('</div>');
  fs.writeFileSync(path.join(OUT, 'bucket-' + name + '.html'), html.join('\n'));
}

fs.writeFileSync(path.join(OUT, 'buckets.json'), JSON.stringify(buckets, null, 1));
console.log('scanned ' + scanned + ' sized PNGs');
console.log(JSON.stringify(summary));

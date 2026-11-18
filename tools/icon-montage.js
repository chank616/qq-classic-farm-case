'use strict';

// Composites the colour-bucketed icons produced by tools/icon-buckets.js into
// one montage PNG per bucket so they can be inspected as a single image.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const { decodePng } = require('./icon-png');

const OUT = process.argv[2] || path.join(__dirname, '..', 'artifacts', 'icon-sheet');
const TILE = Number(process.env.TILE || 48);
const COLS = Number(process.env.COLS || 12);
const GC = path.join(process.env.APPDATA || '', 'QQEX', 'miniapp', 'fs', '2351686624', '1112386029', 'usr', 'gamecaches');

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (crc ^ buf[i]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function encodePng(w, h, rgba) {
  const stride = w * 4;
  const raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function sample(img, sx, sy) {
  const { w, h, channels, data, palette, trns } = img;
  const x = Math.min(w - 1, Math.max(0, Math.round(sx)));
  const y = Math.min(h - 1, Math.max(0, Math.round(sy)));
  const o = (y * w + x) * channels;
  if (palette) {
    const idx = data[o];
    let a = 255;
    if (trns && idx < trns.length) a = trns[idx];
    return [palette[idx * 3], palette[idx * 3 + 1], palette[idx * 3 + 2], a];
  }
  if (channels === 4) return [data[o], data[o + 1], data[o + 2], data[o + 3]];
  if (channels === 3) return [data[o], data[o + 1], data[o + 2], 255];
  if (channels === 2) return [data[o], data[o], data[o], data[o + 1]];
  return [data[o], data[o], data[o], 255];
}

const buckets = JSON.parse(fs.readFileSync(path.join(OUT, 'buckets.json'), 'utf8'));
for (const [name, list] of Object.entries(buckets)) {
  if (!list.length) continue;
  const rows = Math.ceil(list.length / COLS);
  const W = COLS * TILE, H = rows * TILE;
  let painted = 0;
  const buf = Buffer.alloc(W * H * 4);
  // dark background with a faint 2px separator per tile
  for (let i = 0; i < W * H; i++) {
    const x = i % W, y = (i / W) | 0;
    const onEdge = (x % TILE < 1) || (y % TILE < 1);
    buf[i * 4] = onEdge ? 60 : 18; buf[i * 4 + 1] = onEdge ? 60 : 18; buf[i * 4 + 2] = onEdge ? 70 : 20; buf[i * 4 + 3] = 255;
  }
  list.forEach(function (it, i) {
    const cx = (i % COLS) * TILE, cy = ((i / COLS) | 0) * TILE;
    let img;
    try {
      img = decodePng(fs.readFileSync(path.join(GC, it.bundle, it.file)));
    } catch (e) {
      if (i === 0) console.log('  read/decode threw for ' + it.bundle + '/' + it.file + ': ' + e.message);
      return;
    }
    if (!img) { if (i === 0) console.log('  decode null for ' + it.file); return; }
    const scale = Math.min((TILE - 6) / img.w, (TILE - 6) / img.h);
    const dw = Math.max(1, Math.round(img.w * scale)), dh = Math.max(1, Math.round(img.h * scale));
    const ox = cx + ((TILE - dw) >> 1), oy = cy + ((TILE - dh) >> 1);
    for (let y = 0; y < dh; y++) {
      for (let x = 0; x < dw; x++) {
        const px = sample(img, x / scale, y / scale);
        if (px[3] < 24) continue;
        const o = ((oy + y) * W + ox + x) * 4;
        const a = px[3] / 255;
        buf[o] = Math.round(px[0] * a + buf[o] * (1 - a));
        buf[o + 1] = Math.round(px[1] * a + buf[o + 1] * (1 - a));
        buf[o + 2] = Math.round(px[2] * a + buf[o + 2] * (1 - a));
        buf[o + 3] = 255;
        painted++;
      }
    }
  });
  const p = path.join(OUT, 'montage-' + name + '.png');
  fs.writeFileSync(p, encodePng(W, H, buf));
  console.log('montage-' + name + '.png  ' + W + 'x' + H + '  tiles=' + list.length + '  painted=' + painted);
}

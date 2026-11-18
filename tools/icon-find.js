'use strict';

// Locates the small, highly saturated currency / crop icons in a game
// screenshot by colour clustering, so they can be cropped out as official art.

const fs = require('fs');
const zlib = require('zlib');
const { decodePng } = require('./icon-png');

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
  for (let y = 0; y < h; y++) { raw[y * (stride + 1)] = 0; rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride); }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const src = process.argv[2];
const out = process.argv[3] || 'artifacts/icon-sheet';
const img = decodePng(fs.readFileSync(src));
if (!img) { console.error('cannot decode ' + src); process.exit(1); }
const { w: W, h: H, channels: ch, data } = img;

// hue / sat / val per pixel
function hsv(o) {
  const r = data[o] / 255, g = data[o + 1] / 255, b = data[o + 2] / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let hh = 0;
  if (d !== 0) {
    if (mx === r) hh = 60 * (((g - b) / d) % 6);
    else if (mx === g) hh = 60 * ((b - r) / d + 2);
    else hh = 60 * ((r - g) / d + 4);
  }
  if (hh < 0) hh += 360;
  return { h: hh, s: mx === 0 ? 0 : d / mx, v: mx };
}

const BANDS = {
  gold: function (c) { return c.h >= 30 && c.h <= 62 && c.s > 0.45 && c.v > 0.55; },
  green: function (c) { return c.h >= 75 && c.h <= 165 && c.s > 0.35 && c.v > 0.40; },
  cyan: function (c) { return c.h >= 168 && c.h <= 215 && c.s > 0.40 && c.v > 0.55; },
  magenta: function (c) { return (c.h >= 285 || c.h < 15) && c.s > 0.45 && c.v > 0.5; },
};

const mask = new Uint8Array(W * H);
const results = {};
for (const [name, pred] of Object.entries(BANDS)) {
  mask.fill(0);
  for (let i = 0; i < W * H; i++) {
    if (pred(hsv(i * ch))) mask[i] = 1;
  }
  // connected components (4-neighbour, iterative stack)
  const seen = new Uint8Array(W * H);
  const boxes = [];
  for (let start = 0; start < W * H; start++) {
    if (!mask[start] || seen[start]) continue;
    let x0 = start % W, x1 = x0, y0 = (start / W) | 0, y1 = y0, area = 0;
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const p = stack.pop();
      const x = p % W, y = (p / W) | 0;
      area++;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0 && mask[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack.push(p - 1); }
      if (x < W - 1 && mask[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack.push(p + 1); }
      if (y > 0 && mask[p - W] && !seen[p - W]) { seen[p - W] = 1; stack.push(p - W); }
      if (y < H - 1 && mask[p + W] && !seen[p + W]) { seen[p + W] = 1; stack.push(p + W); }
    }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    const ratio = bw / bh;
    if (area < 120 || bw < 14 || bh < 14 || bw > 110 || bh > 110) continue;
    if (ratio < 0.55 || ratio > 1.8) continue;
    if (area / (bw * bh) < 0.35) continue;
    boxes.push({ x0, y0, x1, y1, bw, bh, area });
  }
  boxes.sort(function (a, b) { return b.area - a.area; });
  results[name] = boxes.slice(0, 14);
  console.log('== ' + name + ' == ' + boxes.length + ' candidates');
  for (const b of results[name]) {
    console.log('   x=' + b.x0 + ' y=' + b.y0 + ' ' + b.bw + 'x' + b.bh + ' area=' + b.area);
  }
}

// contact sheet of every candidate crop
const TILE = 64, COLS = 8;
const all = [];
for (const [name, boxes] of Object.entries(results)) {
  for (const b of boxes) all.push(Object.assign({ name: name }, b));
}
const rows = Math.ceil(all.length / COLS) || 1;
const CW = COLS * TILE, CH = rows * TILE;
const buf = Buffer.alloc(CW * CH * 4);
for (let i = 0; i < CW * CH; i++) { buf[i * 4] = 20; buf[i * 4 + 1] = 20; buf[i * 4 + 2] = 24; buf[i * 4 + 3] = 255; }
all.forEach(function (b, i) {
  const cx = (i % COLS) * TILE, cy = ((i / COLS) | 0) * TILE;
  const m = 2;
  for (let y = 0; y < b.bh; y++) {
    for (let x = 0; x < b.bw; x++) {
      const sx = b.x0 + x, sy = b.y0 + y;
      if (sx >= W || sy >= H) continue;
      const o = (sy * W + sx) * ch;
      const dx = cx + m + x, dy = cy + m + y;
      if (dx >= CW || dy >= CH) continue;
      const d = (dy * CW + dx) * 4;
      buf[d] = data[o]; buf[d + 1] = data[o + 1]; buf[d + 2] = data[o + 2]; buf[d + 3] = 255;
    }
  }
});
fs.writeFileSync(out + '/candidates.png', encodePng(CW, CH, buf));
console.log('candidates.png  ' + CW + 'x' + CH + '  tiles=' + all.length + '  (order: ' +
  Object.keys(results).map(function (k) { return k + '[' + results[k].length + ']'; }).join(' ') + ')');

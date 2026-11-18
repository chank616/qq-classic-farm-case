'use strict';

// Crops a region out of a screenshot and scales it up, so reference icons can
// be compared against the extracted game assets.

const fs = require('fs');
const path = require('path');
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
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

function px(img, x, y) {
  const { w, h, channels, data } = img;
  const xx = Math.min(w - 1, Math.max(0, x | 0)), yy = Math.min(h - 1, Math.max(0, y | 0));
  const o = (yy * w + xx) * channels;
  if (channels === 4) return [data[o], data[o + 1], data[o + 2], data[o + 3]];
  if (channels === 3) return [data[o], data[o + 1], data[o + 2], 255];
  return [data[o], data[o], data[o], 255];
}

const src = process.argv[2];
const out = process.argv[3];
const x0 = Number(process.argv[4]), y0 = Number(process.argv[5]);
const cw = Number(process.argv[6]), ch = Number(process.argv[7]);
const scale = Number(process.argv[8] || 4);

const img = decodePng(fs.readFileSync(src));
if (!img) { console.error('cannot decode ' + src); process.exit(1); }
const W = cw * scale, H = ch * scale;
const buf = Buffer.alloc(W * H * 4);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const c = px(img, x0 + x / scale, y0 + y / scale);
    const o = (y * W + x) * 4;
    buf[o] = c[0]; buf[o + 1] = c[1]; buf[o + 2] = c[2]; buf[o + 3] = 255;
  }
}
fs.writeFileSync(out, encodePng(W, H, buf));
console.log(path.basename(out) + '  ' + W + 'x' + H + '  from (' + x0 + ',' + y0 + ') ' + cw + 'x' + ch + ' x' + scale);

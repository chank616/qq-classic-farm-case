'use strict';

// Builds a contact sheet of small PNGs from the Cocos game caches so the icons
// can be identified visually. Serves them over a local HTTP server (browsers
// will not load file:// images into a page opened from another origin).

const fs = require('fs');
const path = require('path');
const http = require('http');

const GC = process.argv[2] || path.join(
  process.env.APPDATA || '', 'QQEX', 'miniapp', 'fs', '2351686624', '1112386029', 'usr', 'gamecaches');
const OUT = process.argv[3] || path.join(__dirname, '..', 'artifacts', 'icon-sheet');
const PORT = Number(process.env.SHEET_PORT || 17899);
const MAX_DIM = Number(process.env.SHEET_MAX_DIM || 160);
const BUNDLES = (process.env.SHEET_BUNDLES || 'extraRes,plant,delayRes,mainscene').split(',');

function pngSize(buf) {
  if (buf.length < 24) return null;
  if (buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

const items = [];
for (const b of BUNDLES) {
  const dir = path.join(GC, b);
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir)) {
    if (!f.toLowerCase().endsWith('.png')) continue;
    const p = path.join(dir, f);
    let st;
    try { st = fs.statSync(p); } catch (_) { continue; }
    let size = null;
    try { size = pngSize(fs.readFileSync(p, { flag: 'r' }).slice(0, 32)) || null; } catch (_) { }
    if (!size) {
      // header may live past the first 32 bytes only for malformed files
      try { size = pngSize(fs.readFileSync(p).subarray(0, 32)); } catch (_) { }
    }
    if (!size) continue;
    if (size.w > MAX_DIM || size.h > MAX_DIM) continue;
    items.push({ bundle: b, file: f, w: size.w, h: size.h, bytes: st.size });
  }
}
items.sort(function (a, b) { return (a.bundle + a.file).localeCompare(b.bundle + b.file); });

fs.mkdirSync(OUT, { recursive: true });
const html = [];
html.push('<!doctype html><meta charset="utf-8"><title>icon sheet</title>');
html.push('<style>body{background:#111;color:#ddd;font:11px monospace;margin:8px}');
html.push('.g{display:flex;flex-wrap:wrap;gap:6px}');
html.push('.c{width:96px;text-align:center;background:#1c1c1c;padding:4px;border:1px solid #333}');
html.push('.c img{max-width:88px;max-height:88px;image-rendering:pixelated;display:block;margin:0 auto}');
html.push('.l{font-size:9px;word-break:break-all;color:#8ab}</style>');
html.push('<h3>' + items.length + ' PNGs &le; ' + MAX_DIM + 'px from ' + BUNDLES.join(', ') + '</h3><div class="g">');
items.forEach(function (it, i) {
  const src = '/img/' + it.bundle + '/' + encodeURIComponent(it.file);
  html.push('<div class="c"><img src="' + src + '" loading="eager"><div class="l">#' + i + ' ' +
    it.bundle + '<br>' + it.file + '<br>' + it.w + 'x' + it.h + '</div></div>');
});
html.push('</div>');
fs.writeFileSync(path.join(OUT, 'sheet.html'), html.join('\n'));

const server = http.createServer(function (req, res) {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/' || u === '/sheet.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html.join('\n'));
    return;
  }
  const m = /^\/img\/([^/]+)\/(.+)$/.exec(u);
  if (m) {
    const p = path.join(GC, m[1], m[2]);
    if (fs.existsSync(p) && p.startsWith(GC)) {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(fs.readFileSync(p));
      return;
    }
  }
  res.writeHead(404); res.end('nope');
});
server.listen(PORT, '127.0.0.1', function () {
  console.log('icon sheet: http://127.0.0.1:' + PORT + '/sheet.html  (' + items.length + ' tiles)');
});

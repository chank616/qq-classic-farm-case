'use strict';

// Bundles client/pb.js + schema.js + crypto.js + protocol.js + runtime entry
// into one plain script that can be eval'd inside the QQ miniapp page context.
// The page has no CommonJS loader, so a tiny registry is embedded.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MODULES = [
  ['pb', 'client/pb.js'],
  ['schema', 'client/schema.js'],
  ['crypto', 'client/crypto.js'],
  ['protocol', 'client/protocol.js'],
  ['runtime', 'client/farm-runtime.js'],
];

function build() {
  const parts = [];
  parts.push('(function(){');
  parts.push('var __defs = {}; var __cache = {};');
  parts.push('function __req(name){ if(__cache[name]) return __cache[name].exports; var m={exports:{}}; __cache[name]=m; __defs[name](m,m.exports,__req); return m.exports; }');

  for (const [name, rel] of MODULES) {
    const abs = path.join(ROOT, rel);
    const src = fs.readFileSync(abs, 'utf8');
    parts.push('__defs[' + JSON.stringify(name) + '] = function(module, exports, require){');
    // Rewrite local requires to the registry names.
    const rewritten = src
      .replace(/require\('\.\/pb'\)/g, "__req('pb')")
      .replace(/require\('\.\/schema'\)/g, "__req('schema')")
      .replace(/require\('\.\/crypto'\)/g, "__req('crypto')")
      .replace(/require\('\.\/protocol'\)/g, "__req('protocol')");
    parts.push(rewritten);
    parts.push('};');
  }

  parts.push('var runtime = __req("runtime");');
  parts.push('var api = {');
  parts.push('  runFarmClient: runtime.runFarmClient,');
  parts.push('  normalizeKeyBytes: runtime.normalizeKeyBytes,');
  parts.push('  toBytes: runtime.toBytes,');
  parts.push('  sha16: runtime.sha16,');
  parts.push('  pb: __req("pb"),');
  parts.push('  schema: __req("schema"),');
  parts.push('  crypto: __req("crypto"),');
  parts.push('  protocol: __req("protocol")');
  parts.push('};');
  parts.push('globalThis.__farmClientBundle = api;');
  parts.push('return api;');
  parts.push('})();');

  const out = parts.join('\n');
  const distDir = path.join(ROOT, 'client', 'dist');
  fs.mkdirSync(distDir, { recursive: true });
  const outPath = path.join(distDir, 'farm-runtime.bundle.js');
  fs.writeFileSync(outPath, out);
  return { outPath, bytes: Buffer.byteLength(out) };
}

if (require.main === module) {
  const r = build();
  console.log('bundled -> ' + r.outPath + ' (' + r.bytes + ' bytes)');
}

module.exports = { build };

// Offline research probe: no QQ process, farm page, or account credentials.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const wasmPath = process.argv[2];
if (!wasmPath) throw new Error('Pass a local cached tsdk.wasm path');
const bytes = fs.readFileSync(wasmPath);
let at = 8;
function leb() { let v = 0, shift = 0, b; do { b = bytes[at++]; v |= (b & 127) << shift; shift += 7; } while (b & 128); return v >>> 0; }
const segments = [], types = [], imports = [];
function str() { const n = leb(); const s = bytes.subarray(at, at + n).toString(); at += n; return s; }
while (at < bytes.length) {
  const id = bytes[at++], size = leb(), end = at + size;
  if (id === 1) { for (let n = leb(); n--; ) { if (bytes[at++] !== 96) throw new Error('Unknown WASM type'); const p = []; for (let c = leb(); c--; ) p.push(bytes[at++]); const r = []; for (let c = leb(); c--; ) r.push(bytes[at++]); types.push({p,r}); } }
  if (id === 2) { for (let n = leb(); n--; ) { const module = str(), name = str(), kind = bytes[at++]; if (kind !== 0) throw new Error('Unexpected nonfunction import'); imports.push({module,name,...types[leb()]}); } }
  if (id === 11) { for (let n = leb(); n--; ) { const mode = leb(); if (mode !== 0) throw new Error('Unexpected data mode'); if (bytes[at++] !== 65) throw new Error('Unexpected offset'); const ptr = leb(); if (bytes[at++] !== 11) throw new Error('Unexpected offset terminator'); const len = leb(); segments.push([ptr,len]); at += len; } }
  at = end;
}
console.log(JSON.stringify({wasmBytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),segments,imports}));
let src = fs.readFileSync('artifacts/reference-background/tsdk-runtime.js', 'utf8');
src = src.replace(/const OFFICIAL_SHA256 = '[^']*';/, `const OFFICIAL_SHA256 = '${crypto.createHash('sha256').update(bytes).digest('hex')}';`)
  .replace(/const OFFICIAL_VERSION = '[^']*';/, "const OFFICIAL_VERSION = 'v3.9.0.1792070537';")
  .replace(/const MERGED_DATA_SEGMENTS = \[[\s\S]*?\n\];/, 'const MERGED_DATA_SEGMENTS = ' + JSON.stringify(segments) + ';');
const moduleObject = {exports:{}};
vm.runInNewContext(src, {Buffer, Uint8Array, Uint32Array, Int32Array, DataView, WebAssembly, performance, Date, setTimeout, clearTimeout,
  module:moduleObject, exports:moduleObject.exports, __dirname:path.resolve('artifacts/reference-background'), process,
  require:id => id === '../config/runtime-paths' ? {ensureDataDir:()=>path.resolve('artifacts/standalone-tsdk-probe')} : require(id)
}, {filename:'reference-tsdk-runtime.js'});
(async()=>{
  const runtime = new moduleObject.exports.TsdkRuntime({wasmPath,accountId:'offline-fixture',dataDir:path.resolve('artifacts/standalone-tsdk-probe')});
  await runtime.init();
  const input=Buffer.from([8,2]), encrypted=runtime.encrypt(input), decrypted=runtime.decrypt(encrypted);
  const result={runtime:'standalone-node-research-only',qqStarted:false,farmStarted:false,inputBytes:input.length,encryptedBytes:encrypted.length,roundtrip:decrypted.equals(input)};
  fs.writeFileSync('artifacts/standalone-tsdk-probe-result.json',JSON.stringify(result,null,2));
  console.log(result);runtime.destroy();
})().catch(e=>{console.error(e.stack);process.exitCode=1;});

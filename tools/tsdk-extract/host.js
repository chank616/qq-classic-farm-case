'use strict';

// Runs the game's tsdk wasm outside the game/QQ.
//
// The game bundle ships its own AMD-style loader: every module is wrapped in
// define("<name>", function(require, module, exports){ ... }). We reuse the
// exact tsdk modules (glue + wrapper) and stub only the mini-app `wx` APIs they
// touch, so encryptData/decryptData behave byte-for-byte like in the game.
//
//   node tools/tsdk-extract/host.js <game.js> <tsdk.wasm> [--selftest]

const fs = require('fs');
const path = require('path');

const GAME = process.argv[2];
const WASM = process.argv[3];
const SELFTEST = process.argv.includes('--selftest');

if (!GAME || !WASM) {
  console.error('usage: node host.js <game.js> <tsdk.wasm> [--selftest]');
  process.exit(2);
}

// ── 1. index every define("<name>", function(...)) chunk in the bundle ─────
const src = fs.readFileSync(GAME, 'utf8');
const re = /define\("([^"]+)"\s*,\s*function\s*\(/g;
const starts = [];
let m;
while ((m = re.exec(src)) !== null) {
  starts.push({ name: m[1], start: m.index });
}
const chunks = new Map();
for (let i = 0; i < starts.length; i++) {
  const end = i + 1 < starts.length ? starts[i + 1].start : src.length;
  chunks.set(starts[i].name, src.slice(starts[i].start, end));
}
console.log('indexed modules: ' + chunks.size);

// ── 2. minimal AMD loader ───────────────────────────────────────────────────
const cache = new Map();

function resolveId(fromId, req) {
  if (req.charAt(0) !== '.') return req;
  let p = path.posix.normalize(path.posix.join(path.posix.dirname(fromId), req));
  if (p.slice(0, 2) === './') p = p.slice(2);
  return p;
}

function load(id) {
  if (cache.has(id)) return cache.get(id).exports;
  const candidates = [id, id + '.js'];
  let key = null;
  for (const c of candidates) { if (chunks.has(c)) { key = c; break; } }
  if (!key) throw new Error('module not found: ' + id);

  const module = { exports: {} };
  cache.set(id, module);

  let factory = null;
  const localDefine = function (name, f) { factory = f; };
  const body = chunks.get(key);
  // The chunk is a complete `define(...)` call; evaluating it registers the factory.
  // eslint-disable-next-line no-new-func
  new Function('define', body)(localDefine);
  if (!factory) throw new Error('no factory for ' + id);

  const localRequire = function (req) {
    return load(resolveId(key, req));
  };
  factory(localRequire, module, module.exports);
  return module.exports;
}

// ── 3. stub the mini-app `wx` APIs tsdk touches ────────────────────────────
// WeChat's WebAssembly wrapper takes a package-relative path instead of bytes;
// mirror that so the module's instantiate() call works outside the mini-app.
const GAME_DIR = path.dirname(path.resolve(GAME));
globalThis.WXWebAssembly = {
  instantiate: async function (p, imports) {
    const bytes = fs.readFileSync(path.resolve(GAME_DIR, p));
    return WebAssembly.instantiate(bytes, imports);
  },
  compile: WebAssembly.compile.bind(WebAssembly),
  validate: WebAssembly.validate.bind(WebAssembly),
  Module: WebAssembly.Module,
  Instance: WebAssembly.Instance,
  Memory: WebAssembly.Memory,
  Table: WebAssembly.Table,
  Global: WebAssembly.Global,
  RuntimeError: WebAssembly.RuntimeError,
};

globalThis.wx = {
  env: { USER_DATA_PATH: process.cwd() },
  getFileSystemManager: function () {
    return {
      readFileSync: function (p, enc) {
        const b = fs.readFileSync(p);
        return enc ? b.toString(enc) : b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
      },
      writeFileSync: function () { return 0; },
      accessSync: function () { },
    };
  },
  getSystemInfoSync: function () {
    return {
      pixelRatio: 1, platform: 'windows', system: 'Windows 10', model: 'PC',
      windowWidth: 1280, windowHeight: 720, screenWidth: 1280, screenHeight: 720,
      language: 'zh_CN', version: '1.5.0.2', SDKVersion: '3.0.0',
    };
  },
  getDeviceInfo: function () { return { platform: 'windows', model: 'PC', system: 'Windows 10' }; },
  getAppBaseInfo: function () { return { version: '1.5.0.2', SDKVersion: '3.0.0', language: 'zh_CN' }; },
  getAccountInfoSync: function () { return { miniProgram: { appId: '1112386029', envVersion: 'release' } }; },
  onTouchStart: function () { },
  onTouchMove: function () { },
  onTouchEnd: function () { },
  startGyroscope: function () { },
  onGyroscopeChange: function () { },
  request: function () { },
};

// ── 4. boot tsdk ───────────────────────────────────────────────────────────
(async function main() {
  const wasm = fs.readFileSync(WASM);
  const tsdkModule = load('tsdk/tsdk.js');
  const factory = tsdkModule.default || tsdkModule;
  if (typeof factory !== 'function') throw new Error('tsdk factory not found');

  console.log('booting tsdk (wasm ' + wasm.length + ' bytes)...');
  const t0 = Date.now();
  const wasmBytes = wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength);
  const mod = await factory({
    wasmBinary: wasmBytes,
    // Bypass the module's own loader/WXWebAssembly shim: hand it a plain
    // instantiated instance through the standard Emscripten hook.
    instantiateWasm: function (imports, success) {
      WebAssembly.instantiate(wasmBytes, imports).then(function (r) {
        // Tencent "mergewasm" builds keep encrypted string/data sections; the
        // mini-app runtime decrypts them before ctors. Try the exported hooks.
        var ex = r.instance.exports;
        ['__mergewasm_shared__decrypt_data_section', '__mergewasm_shared____wasm_decrypt_strings'].forEach(function (n) {
          if (typeof ex[n] === 'function') {
            try { ex[n](); console.log('called ' + n); }
            catch (e) { console.log(n + ' failed: ' + (e && e.message || e)); }
          }
        });
        success(r.instance, r.module);
      }).catch(function (e) {
        console.error('instantiateWasm fail: ' + (e && e.message || e));
      });
      return {};
    },
    print: function () { },
    printErr: function () { },
    onAbort: function (what) { console.error('abort: ' + what); },
  });
  console.log('tsdk ready in ' + (Date.now() - t0) + 'ms');
  const api = mod || globalThis.tsdk;
  const names = Object.keys(api).filter(function (k) { return k.indexOf('_') === 0; });
  console.log('exports: ' + names.join(', '));

  if (SELFTEST) {
    // Emscripten calling convention: (ptr, len) -> ptr, result read from HEAP.
    const plain = Buffer.from('hello-tsdk', 'utf8');
    const ptr = api._malloc(plain.length);
    api.HEAPU8.set(plain, ptr);
    const out = api._encrypt_data(ptr, plain.length);
    if (!out) { console.log('selftest: _encrypt_data returned 0'); return; }
    const outLen = plain.length; // tsdk keeps the length identical
    const enc = Buffer.from(api.HEAPU8.subarray(out, out + outLen));
    console.log('selftest encrypt: ' + enc.toString('hex'));
    const decPtr = api._malloc(enc.length);
    api.HEAPU8.set(enc, decPtr);
    const dec = api._decrypt_data(decPtr, enc.length);
    const back = dec ? Buffer.from(api.HEAPU8.subarray(dec, dec + outLen)).toString('utf8') : '(null)';
    console.log('selftest decrypt: ' + back);
    api._free(ptr);
  }
})().catch(function (e) {
  console.error('BOOT FAIL: ' + (e && e.stack || e));
  process.exit(1);
});

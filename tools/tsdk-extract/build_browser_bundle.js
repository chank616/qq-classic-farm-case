'use strict';

// Builds a self-contained browser script containing only the babel helpers and
// the tsdk modules pulled out of the game bundle, plus the wx/WXWebAssembly
// shims and an init routine that exposes window.__tsdk.
//
//   node tools/tsdk-extract/build_browser_bundle.js <game.js> <out.js>

const fs = require('fs');

const GAME = process.argv[2];
const OUT = process.argv[3];
const MINI = process.argv.includes('--mini');
if (!GAME || !OUT) {
  console.error('usage: node build_browser_bundle.js <game.js> <out.js> [--mini]');
  process.exit(2);
}

const src = fs.readFileSync(GAME, 'utf8');
const re = /define\("([^"]+)"\s*,\s*function\s*\(/g;
const starts = [];
let m;
while ((m = re.exec(src)) !== null) starts.push({ name: m[1], start: m.index });

const chunks = [];
for (let i = 0; i < starts.length; i++) {
  const name = starts[i].name;
  if (!/^@babel\/runtime\//.test(name) && !/^tsdk\//.test(name)) continue;
  const end = i + 1 < starts.length ? starts[i + 1].start : src.length;
  chunks.push(src.slice(starts[i].start, end));
}
console.log('selected modules: ' + chunks.length);

const header = `(function(){
'use strict';
var defs = {}, cache = {};
function define(name, factory){ defs[name] = factory; }
function resolveId(fromId, req){
  if (req.charAt(0) !== '.') return req;
  var parts = fromId.split('/'); parts.pop();
  var segs = req.split('/');
  for (var i=0;i<segs.length;i++){
    var s = segs[i];
    if (s === '.' || s === '') continue;
    if (s === '..') { parts.pop(); continue; }
    parts.push(s);
  }
  return parts.join('/');
}
function load(id){
  if (cache[id]) return cache[id].exports;
  var keys = [id, id + '.js'], key = null;
  for (var k=0;k<keys.length;k++){ if (defs[keys[k]]) { key = keys[k]; break; } }
  if (!key) throw new Error('module not found: ' + id);
  var module = { exports: {} };
  cache[id] = module;
  defs[key](function(req){ return load(resolveId(key, req)); }, module, module.exports);
  return module.exports;
}
window.__amdLoad = load;

// ── mini-app shims ────────────────────────────────────────────────────────
// --mini keeps the real wx / WXWebAssembly from the mini-app runtime: that is
// the only environment able to load Tencent's mergewasm build.
if (!${MINI ? 'true' : 'false'}) {
  window.wx = {
    env: { USER_DATA_PATH: '/' },
    getFileSystemManager: function(){ return { writeFileSync: function(){ return 0; }, readFileSync: function(){ return new ArrayBuffer(0); } }; },
    getSystemInfoSync: function(){ return { pixelRatio:1, platform:'windows', system:'Windows 10', model:'PC', windowWidth:1280, windowHeight:720, screenWidth:1280, screenHeight:720, language:'zh_CN', version:'1.5.0.2', SDKVersion:'3.0.0' }; },
    getDeviceInfo: function(){ return { platform:'windows', model:'PC', system:'Windows 10' }; },
    getAppBaseInfo: function(){ return { version:'1.5.0.2', SDKVersion:'3.0.0', language:'zh_CN' }; },
    getAccountInfoSync: function(){ return { miniProgram:{ appId:'1112386029', envVersion:'release' } }; },
    onTouchStart: function(){}, onTouchMove: function(){}, onTouchEnd: function(){},
    startGyroscope: function(){}, onGyroscopeChange: function(){},
    request: function(){}
  };
  window.WXWebAssembly = {
    instantiate: function(p, imports){
      return fetch(p).then(function(r){ return r.arrayBuffer(); })
        .then(function(b){ return WebAssembly.instantiate(b, imports); });
    },
    instantiateStreaming: function(resp, imports){ return WebAssembly.instantiateStreaming(resp, imports); },
    compile: WebAssembly.compile.bind(WebAssembly),
    validate: WebAssembly.validate.bind(WebAssembly),
    Module: WebAssembly.Module, Instance: WebAssembly.Instance,
    Memory: WebAssembly.Memory, Table: WebAssembly.Table,
    Global: WebAssembly.Global, RuntimeError: WebAssembly.RuntimeError
  };
}
window.__tsdkMini = ${MINI ? 'true' : 'false'};
window.__tsdkState = 'loading';
window.__tsdkError = null;
`;

const footer = `
try {
  var t = load('tsdk/tsdk.js');
  var factory = t.default || t;
  Promise.resolve(factory({ print: function(){}, printErr: function(){}, onAbort: function(w){ window.__tsdkError = 'abort: ' + w; } }))
    .then(function(mod){
      window.__tsdk = mod || window.tsdk;
      window.__tsdkState = 'ready';
    })
    .catch(function(e){
      window.__tsdkError = String(e && e.stack || e);
      window.__tsdkState = 'error';
    });
} catch (e) {
  window.__tsdkError = String(e && e.stack || e);
  window.__tsdkState = 'error';
}
})();
`;

fs.writeFileSync(OUT, header + chunks.join('\n') + footer);
console.log('wrote ' + OUT + ' (' + fs.statSync(OUT).size + ' bytes)');

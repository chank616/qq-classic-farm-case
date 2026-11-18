'use strict';

// Dumps the System.register factory source of selected virtual modules from the
// farm bundle, so the TSDK wasm wrapper can be inspected offline.

const fs = require('fs');
const vm = require('vm');

const GAME = 'C:/Users/chank616/AppData/Roaming/QQEX/miniapp/temps/miniapp_src/1112386029_3_3443f89042dffbf93d20ced1d652d031/game.js';
const OUT_DIR = 'C:/Temp/ilinkre';
const TARGETS = ['tsdk_info.mjs', 'AceManager.ts'];

function main() {
  const s = fs.readFileSync(GAME, 'utf8');
  const decStart = s.indexOf('globalThis._Аce_7716=function(){');
  const decEnd = s.indexOf('}();var', decStart) + 3;
  const modStart = s.indexOf('define("assets/main/index.4fbdd.js"');
  const bodyStart = s.indexOf('{', modStart);
  const modEnd = s.indexOf('\n});\ndefine(', bodyStart);
  const body = s.slice(bodyStart + 1, modEnd);

  const ctx = {
    console, Function, Date, JSON, Array, Object, String, Number, Boolean, RegExp, Math,
    Uint8Array, Int8Array, decodeURIComponent, encodeURIComponent, parseInt, parseFloat,
    globalThis: null,
  };
  ctx.globalThis = ctx;
  const any = () => new Proxy(function () {}, {
    get: (t, k) => (k === 'then' ? undefined : any()),
    apply: () => any(),
    construct: () => any(),
  });
  ctx.window = any(); ctx.document = any(); ctx.canvas = any(); ctx.cc = any(); ctx.qq = any(); ctx.wx = {};
  ctx._systems = [];
  ctx.System = new Proxy({}, {
    get: (t, k) => (...args) => {
      const rec = { key: String(k), args, exports: {} };
      ctx._systems.push(rec);
      if (typeof args[2] === 'function') {
        try {
          rec.reg = args[2]((n, v) => any());
        } catch (e) { rec.regError = String(e); }
      }
      return any();
    },
  });
  ctx.require = (id) => {
    if (id.includes('interopRequireDefault')) return x => ({ default: x });
    if (id.includes('regenerator')) return { default: { mark: (fn) => fn, wrap: (fn) => fn } };
    if (id.includes('typeof')) return x => typeof x;
    return any();
  };

  vm.createContext(ctx);
  vm.runInContext(s.slice(decStart, decEnd) + ';', ctx);
  const factory = vm.runInContext(
    '(function(require,module,exports){' + body + '\n})',
    ctx,
  );
  factory(ctx.require, { exports: {} }, {});

  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const name of TARGETS) {
    const id = 'chunks:///_virtual/' + name;
    const rec = ctx._systems.find(x => x.args[0] === id);
    if (!rec) { console.log(name, 'MISSING'); continue; }
    const src = String(rec.args[2]);
    const out = OUT_DIR + '/' + name.replace(/[^A-Za-z0-9._-]/g, '_') + '.factory.js';
    fs.writeFileSync(out, src);
    console.log(name, '->', out, src.length, 'bytes');
  }
}

main();

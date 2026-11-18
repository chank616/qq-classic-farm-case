'use strict';

// Resolves the obfuscator's per-module string tables so obfuscated property
// indexes inside GcmCrypto / UserCryptoManager can be read as names.
//
// The bundle is wrapped so the module body returns its top-level string-table
// variables (J, f, q, ...). Nothing is executed against the network.

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const GAME = 'C:/Users/chank616/AppData/Roaming/QQEX/miniapp/temps/miniapp_src/1112386029_3_3443f89042dffbf93d20ced1d652d031/game.js';
const OUT = path.join(__dirname, '..', 'artifacts', 'crypto-string-tables.json');
const TABLE_NAMES = ['J', 'f', 'q', 'T', 'M', 'g', 'c', 'l', 'v', 'Y', 'S', 'D', 'L', 'k', 'o', 'a', 'y', 'R', 'Q', 'z', 'H', 'P', 'C', 'm', 'F'];

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
  for (const k of ['getSystemInfoSync', 'getWindowInfo', 'request', 'login', 'getStorageSync',
    'setStorageSync', 'removeStorageSync', 'connectSocket', 'loadSubpackage', 'getUserCryptoManager']) {
    ctx.wx[k] = () => any();
  }
  ctx._systems = [];
  ctx.System = new Proxy({}, {
    get: (t, k) => (...args) => {
      const rec = { key: String(k), args, exports: {} };
      ctx._systems.push(rec);
      if (typeof args[2] === 'function') {
        try {
          const ex = (name, val) => {
            if (typeof name === 'string') rec.exports[name] = val;
            else if (name && typeof name === 'object') Object.assign(rec.exports, name);
            return any();
          };
          rec.reg = args[2](ex);
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

  const returnObj = TABLE_NAMES.map(n => n + ':' + n).join(',');
  const factory = vm.runInContext(
    '(function(require,module,exports){' + body + '\n;return {' + returnObj + '};})',
    ctx,
  );
  const tables = factory(ctx.require, { exports: {} }, {});

  const summary = {};
  for (const name of TABLE_NAMES) {
    const t = tables[name];
    summary[name] = Array.isArray(t) ? { length: t.length } : { type: typeof t };
  }
  fs.writeFileSync(OUT, JSON.stringify({
    generatedFrom: GAME,
    tableShapes: summary,
    resolved: resolveAll(tables),
  }, null, 2));
  console.log('wrote ' + OUT);
  console.log(JSON.stringify(summary, null, 1));
  console.log('resolved sample:', JSON.stringify(resolveAll(tables), null, 1));
}

// Indexes referenced by the two crypto factories.
const REFS = {
  GcmCrypto: {
    v17375: ['v', 17375], Q10356: ['Q', 10356], T9709: ['T', 9709], J17866: ['J', 17866],
    D5783: ['D', 5783], S5783: ['S', 5783], q5783: ['q', 5783], J30281: ['J', 30281],
    c5783: ['c', 5783], J36177: ['J', 36177], Q5783: ['Q', 5783], k1785: ['k', 1785],
    o5783: ['o', 5783], q29: ['q', 29], o29: ['o', 29], J5783: ['J', 5783],
    o38833: ['o', 38833], R38833: ['R', 38833], g103: ['g', 103],
    l29756: ['l', 29756], R29756: ['R', 29756], M7: ['M', 7], D7: ['D', 7],
    d7: ['d', 7], v7: ['v', 7], a7: ['a', 7], Y734: ['Y', 734], J734: ['J', 734],
    Q734: ['Q', 734], T734: ['T', 734], D739: ['D', 739], T10394: ['T', 10394],
    R7: ['R', 7], S7: ['S', 7], L7: ['L', 7], k975: ['k', 975], v30163: ['v', 30163],
    f74: ['f', 74], R27: ['R', 27], T82: ['T', 82], k61: ['k', 61],
    L20517: ['L', 20517], D91: ['D', 91], g74: ['g', 74], y20008: ['y', 20008],
    k18007: ['k', 18007], D19: ['D', 19],
  },
  UserCryptoManager: {
    J17375: ['J', 17375], f30163: ['f', 30163], M6873: ['M', 6873], Q11522: ['Q', 11522],
    Q3066: ['Q', 3066], J35829: ['J', 35829], R36412: ['R', 36412], Q18720: ['Q', 18720],
    D25969: ['D', 25969], L41201: ['L', 41201], L15530: ['L', 15530], v34381: ['v', 34381],
    n18903: ['n', 18903], u19081: ['u', 19081], u7: ['u', 7], l7: ['l', 7],
    D676: ['D', 676], f342: ['f', 342], f14636: ['f', 14636], Q21142: ['Q', 21142],
    l9505: ['l', 9505], d3177: ['d', 3177], Y8534: ['Y', 8534], o19755: ['o', 19755],
    Q29080: ['Q', 29080], o646: ['o', 646],
  },
};

function resolveAll(tables) {
  const out = {};
  for (const [group, refs] of Object.entries(REFS)) {
    out[group] = {};
    for (const [label, [tbl, idx]] of Object.entries(refs)) {
      const t = tables[tbl];
      out[group][label] = Array.isArray(t) ? t[idx] : undefined;
    }
  }
  return out;
}

if (require.main === module) main();

module.exports = { main };

const fs = require('fs');
const vm = require('vm');

const cache = 'C:/Users/chank616/AppData/Roaming/QQEX/miniapp/temps/miniapp_src/1112386029_3_3443f89042dffbf93d20ced1d652d031/game.js';
const source = fs.readFileSync(cache, 'utf8');
const decoderStart = source.indexOf('globalThis._Аce_7716=function(){');
const decoderEnd = source.indexOf('}();var', decoderStart) + 3;
const bundleStart = source.indexOf('define("assets/main/index.4fbdd.js"');
const bodyStart = source.indexOf('{', bundleStart);
const bodyEnd = source.indexOf('\n});\ndefine(', bodyStart);
if (decoderStart < 0 || decoderEnd < 3 || bundleStart < 0 || bodyEnd < 0) throw new Error('Could not locate cached game bundle sections');

const context = {
  console, Function, Date, JSON, Array, Object, String, Number, Boolean, RegExp, Math,
  Uint8Array, Int8Array, decodeURIComponent, encodeURIComponent, parseInt, parseFloat,
  Promise, setTimeout, clearTimeout, globalThis: null,
};
context.globalThis = context;
const any = () => new Proxy(function () {}, {
  get: (_target, key) => key === 'then' ? undefined : any(),
  apply: () => any(),
  construct: () => any(),
});
for (const name of ['window', 'document', 'canvas', 'cc', 'qq']) context[name] = any();
context.wx = new Proxy({}, { get: () => (..._args) => any() });
context.systems = [];
context.System = new Proxy({}, { get: (_target, key) => (...args) => {
  const record = { key: String(key), args, exports: {} };
  context.systems.push(record);
  if (typeof args[2] === 'function') {
    try {
      record.registration = args[2]((name, value) => {
        if (typeof name === 'string') record.exports[name] = value;
        else if (name && typeof name === 'object') Object.assign(record.exports, name);
        return any();
      });
    } catch (error) { record.registrationError = String(error); }
  }
  return any();
} });
context.require = id => {
  if (id.includes('interopRequireDefault')) return value => ({ default: value });
  if (id.includes('regenerator')) return { mark: fn => fn, wrap: fn => fn };
  if (id.includes('typeof')) return value => typeof value;
  return any();
};

vm.createContext(context);
vm.runInContext(source.slice(decoderStart, decoderEnd) + ';', context);
const bundleFactory = vm.runInContext(`(function(require,module,exports){${source.slice(bodyStart + 1, bodyEnd)}\n})`, context);
bundleFactory(context.require, { exports: {} }, {});

const targets = process.argv[2] ? new RegExp(process.argv[2]) : /TaskManager|Daily|Task|QQVip|Mall|Shop|Plant|Harvest|Crop|Seed|NetNode|UserCryptoManager|AceManager/;
for (const record of context.systems) {
  const id = String(record.args[0] || '');
  if (!targets.test(id) || !record.registration) continue;
  if (process.argv.includes('--factory')) console.log('FACTORY', id, String(record.args[2]));
  for (const setter of record.registration.setters || []) if (typeof setter === 'function') {
    try { setter(any()); } catch (_) {}
  }
  try { record.registration.execute(); } catch (error) {
    console.log('MODULE_ERROR', id, String(error));
    continue;
  }
  for (const [exportName, value] of Object.entries(record.exports)) {
    if (typeof value !== 'function') continue;
    if (process.argv[2]) {
      console.log('CLASS', exportName, Function.prototype.toString.call(value).slice(0, 10000));
      for (const key of Object.getOwnPropertyNames(value)) {
        try { if (['string', 'number', 'boolean'].includes(typeof value[key])) console.log('STATIC', key, JSON.stringify(value[key])); } catch (_) {}
      }
    }
    const proto = value.prototype || {};
    const methods = Object.getOwnPropertyNames(proto).filter(name => name !== 'constructor');
    if (!methods.length) continue;
    console.log(`\nMODULE ${id} EXPORT ${exportName} METHODS ${methods.join(',')}`);
    for (const method of methods) {
      let fn;
      try { fn = proto[method]; } catch (_) { continue; }
      if (typeof fn === 'function') console.log(`METHOD ${method} ${Function.prototype.toString.call(fn).slice(0, 8000)}`);
    }
  }
}

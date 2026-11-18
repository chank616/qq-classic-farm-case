const fs = require('fs');
const vm = require('vm');

const cachePath = process.argv[2] || 'C:/Users/chank616/AppData/Roaming/QQEX/miniapp/temps/miniapp_src/1112386029_3_3443f89042dffbf93d20ced1d652d031/game.js';
const outputPath = process.argv[3] || 'artifacts/netnode-send-path.json';
const source = fs.readFileSync(cachePath, 'utf8');
const decStart = source.indexOf('globalThis._Аce_7716=function(){');
const decEnd = source.indexOf('}();var', decStart) + 3;
const bundleStart = source.indexOf('define("assets/main/index.4fbdd.js"');
const bodyStart = source.indexOf('{', bundleStart);
const bodyEnd = source.indexOf('\n});\ndefine(', bodyStart);
if (decStart < 0 || decEnd < 3 || bundleStart < 0 || bodyEnd < 0) throw new Error('Latest cached bundle layout not found');

const events = [];
function valueSummary(value) {
  if (value === null) return null;
  if (value === undefined) return 'undefined';
  if (typeof value !== 'object') return String(value).slice(0, 80);
  if (value instanceof Uint8Array || value instanceof ArrayBuffer) return { type: value.constructor.name, length: value.byteLength ?? value.length };
  return { type: value.constructor?.name || 'object', keys: Object.keys(value).slice(0, 12) };
}
function dynamic(path) {
  const fn = (...args) => {
    events.push({ kind: 'call', path, args: args.map(valueSummary) });
    if (path.endsWith('gatepb.Message.create') && args[0]) {
      const input = args[0];
      events.push({
        kind: 'envelope.shape',
        meta: input.meta && typeof input.meta === 'object' ? Object.fromEntries(Object.entries(input.meta).map(([key, value]) => [key, valueSummary(value)])) : valueSummary(input.meta),
        body: valueSummary(input.body),
        tokenType: input.token === null ? 'null' : typeof input.token,
      });
    }
    return dynamic(`${path}()`);
  };
  return new Proxy(fn, {
    get(_target, key) {
      if (key === 'then') return undefined;
      if (key === Symbol.toPrimitive) return () => 0;
      if (key === 'toString') return () => `[stub ${path}]`;
      if (key === 'serverAvaliable' || key === 'serverAvailable') return true;
      if (key === 'Working' && path.includes('GameStateType')) return 5;
      events.push({ kind: 'get', path: `${path}.${String(key)}` });
      return dynamic(`${path}.${String(key)}`);
    },
    set(_target, key, value) {
      events.push({ kind: 'set', path: `${path}.${String(key)}`, value: valueSummary(value) });
      return true;
    },
    apply(_target, _this, args) { return fn(...args); },
    construct(_target, args) { events.push({ kind: 'construct', path, args: args.map(valueSummary) }); return dynamic(`new ${path}`); },
  });
}
const ctx = {
  console: { log() {}, warn() {}, error() {} }, Function, Date, JSON, Array, Object, String, Number,
  Boolean, RegExp, Math, Uint8Array, Int8Array, ArrayBuffer, DataView, decodeURIComponent,
  encodeURIComponent, parseInt, parseFloat, Promise, setTimeout, clearTimeout, clearInterval,
  setInterval, Map, Set, globalThis: null, logger: dynamic('logger'),
  WebSocket: { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 },
};
ctx.globalThis = ctx;
for (const name of ['window', 'document', 'canvas', 'cc', 'qq']) ctx[name] = dynamic(name);
ctx.wx = dynamic('wx');
ctx.systems = [];
ctx.System = new Proxy({}, { get: (_target, key) => (...args) => {
  const rec = { key: String(key), args, exports: {} };
  ctx.systems.push(rec);
  if (typeof args[2] === 'function') rec.reg = args[2]((name, value) => {
    if (typeof name === 'string') rec.exports[name] = value;
    else if (name && typeof name === 'object') Object.assign(rec.exports, name);
    return value;
  });
  return dynamic(`System.${String(key)}`);
} });
ctx.require = id => id.includes('interopRequireDefault') ? value => ({ default: value }) : dynamic(`require(${id})`);
vm.createContext(ctx);
vm.runInContext(source.slice(decStart, decEnd) + ';', ctx);
const main = vm.runInContext(`(function(require,module,exports){${source.slice(bodyStart + 1, bodyEnd)}\n})`, ctx);
main(ctx.require, { exports: {} }, {});

const record = ctx.systems.find(item => item.args[0] === 'chunks:///_virtual/NetNode.ts');
if (!record) throw new Error('NetNode System.register factory not found');
record.reg.setters.forEach((setter, index) => typeof setter === 'function' && setter(dynamic(`dep:${record.args[1][index]}`)));
record.reg.execute();
const node = new record.exports.NetNode();
node._state = record.exports.NetNodeState.Working;
node._socket = { readyState: ctx.WebSocket.OPEN, send(data) { events.push({ kind: 'socket.send', length: data?.byteLength ?? data?.length ?? null }); } };
try { node.send(new Uint8Array([8, 1]), 'Heartbeat', null, 'gamepb.userpb.UserService'); }
catch (error) { events.push({ kind: 'send.error', name: error.name, message: error.message }); }

const report = {
  source: 'latest cached game.js; isolated VM; all imports and socket are stubs; no host API or network is invoked',
  dependencies: record.args[1],
  events,
  interpretation: 'This is an execution trace of the cached send control flow against inert stubs. It is not a live protocol request, does not contain session material, and does not prove server acceptance.',
};
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ output: outputPath, eventCount: events.length, calls: events.filter(x => x.kind === 'call').map(x => x.path).slice(-40), errors: events.filter(x => x.kind === 'send.error') }, null, 2));

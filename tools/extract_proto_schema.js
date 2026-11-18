const fs = require('fs');
const vm = require('vm');
const path = require('path');
const protobuf = require('protobufjs/minimal');

const gamePath = process.argv[2] || 'C:/Users/chank616/AppData/Roaming/QQEX/miniapp/temps/miniapp_src/1112386029_3_3443f89042dffbf93d20ced1d652d031/game.js';
const output = process.argv[3] || 'artifacts/proto-schema.json';
const source = fs.readFileSync(gamePath, 'utf8');
const decStart = source.indexOf('globalThis._Аce_7716=function(){');
const decEnd = source.indexOf('}();var', decStart) + 3;
const modStart = source.indexOf('define("assets/main/index.4fbdd.js"');
const bodyStart = source.indexOf('{', modStart);
const modEnd = source.indexOf('\n});\ndefine(', bodyStart);

const ctx = { console, Function, Date, JSON, Array, Object, String, Number, Boolean, RegExp, Math,
  Uint8Array, Int8Array, Uint16Array, Int16Array, Uint32Array, Int32Array,
  decodeURIComponent, encodeURIComponent, parseInt, parseFloat, globalThis: null };
ctx.globalThis = ctx;
const any = () => new Proxy(function () {}, { get: (t, k) => k === 'then' ? undefined : any(), apply: () => any(), construct: () => any() });
ctx.window = any(); ctx.document = any(); ctx.canvas = any(); ctx.cc = any(); ctx.qq = any(); ctx.wx = {};
for (const k of ['getSystemInfoSync', 'getWindowInfo', 'request', 'login', 'getStorageSync', 'setStorageSync', 'removeStorageSync', 'connectSocket', 'loadSubpackage']) ctx.wx[k] = (...a) => any();
ctx._systems = [];
ctx.System = new Proxy({}, { get: (t, k) => (...args) => {
  const rec = { key: String(k), args, exports: {} };
  ctx._systems.push(rec);
  if (typeof args[2] === 'function') {
    try {
      const ex = (name, value) => { if (typeof name === 'string') rec.exports[name] = value; else if (name && typeof name === 'object') Object.assign(rec.exports, name); return any(); };
      rec.reg = args[2](ex);
    } catch (e) { rec.regError = String(e); }
  }
  return any();
} });
ctx.require = (id) => {
  if (id.includes('interopRequireDefault')) return x => ({ default: x });
  if (id.includes('regenerator')) return { mark: fn => fn, wrap: fn => fn };
  if (id.includes('typeof')) return x => typeof x;
  return any();
};
vm.createContext(ctx);
vm.runInContext(source.slice(decStart, decEnd) + ';', ctx);
const factory = vm.runInContext('(function(require,module,exports){' + source.slice(bodyStart + 1, modEnd) + '\n})', ctx);
factory(ctx.require, { exports: {} }, {});

// The generated protobuf modules all share one root namespace.  Executing only
// the six target modules leaves nested message encoders (Item, BuffEffect,
// Reward, ...) unresolved.  Initialize the real shared-root module and then
// execute every leaf *pb module against the same namespace.
const cclegacy = { cclegacy: { _RF: { push() {}, pop() {} } } };
const sharedRec = ctx._systems.find(x => x.args[0] === 'chunks:///_virtual/__shared_root.ts');
if (!sharedRec || !sharedRec.reg) throw new Error('shared protobuf root module not found');
sharedRec.reg.setters[0](cclegacy);
sharedRec.reg.execute();
const shared = sharedRec.exports;
const root = shared.$root;
const deps = [cclegacy, { default: protobuf }, shared, { default: protobuf }];
for (const rec of ctx._systems.filter(x => String(x.args[0]).includes('pb.ts') && Array.isArray(x.args[1]) && x.args[1].length === 4)) {
  if (!rec.reg || rec === sharedRec) continue;
  try {
    for (let i = 0; i < (rec.reg.setters || []).length; i++) if (typeof rec.reg.setters[i] === 'function') rec.reg.setters[i](deps[i]);
    rec.reg.execute();
  } catch (_) {
    // Some unused optional bundles refer to a module that is not present in
    // this cache.  Keep the successfully registered modules and continue.
  }
}

function varint(buf, i) { let v = 0, s = 0; while (i < buf.length && s < 35) { const b = buf[i++]; v |= (b & 127) << s; if (!(b & 128)) return [v >>> 0, i]; s += 7; } return [0, i]; }
function firstTag(buf) { const [tag] = varint(buf, 0); return { field: tag >>> 3, wire: tag & 7 }; }
function allTags(buf) {
  const out = [];
  let i = 0;
  while (i < buf.length) {
    const [tag, j] = varint(buf, i);
    const wire = tag & 7;
    out.push({ field: tag >>> 3, wire });
    if (wire === 0) [, i] = varint(buf, j);
    else if (wire === 1) i = j + 8;
    else if (wire === 2) { const [len, k] = varint(buf, j); i = k + len; }
    else if (wire === 5) i = j + 4;
    else break;
  }
  return out;
}

function sampleFor(defaultValue) {
  if (Array.isArray(defaultValue)) return [1];
  if (defaultValue && typeof defaultValue === 'object') {
    // protobufjs Long values have low/high/unsigned; plain objects are maps.
    if (Object.prototype.hasOwnProperty.call(defaultValue, 'low')) return protobuf.util.Long.fromValue(1);
    return { sample: 1 };
  }
  if (defaultValue === null) return {};
  if (typeof defaultValue === 'boolean') return true;
  if (typeof defaultValue === 'string') return 'x';
  if (typeof defaultValue === 'number') return 1;
  return 1;
}

function encodeOne(Type, field, defaultValue) {
  const candidates = [];
  if (Array.isArray(defaultValue)) candidates.push([1], [{}]);
  else if (defaultValue && typeof defaultValue === 'object' && !Object.prototype.hasOwnProperty.call(defaultValue, 'low')) candidates.push({ sample: 1 }, { sample: {} });
  else candidates.push(sampleFor(defaultValue));
  for (const value of candidates) {
    try {
      const msg = Type.create ? Type.create() : new Type();
      msg[field] = value;
      const bytes = Type.encode(msg).finish();
      if (bytes.length) return { bytes, value };
    } catch (_) {}
  }
  return null;
}

const protobufTypeNames = new Map();
for (const [pkg, ns] of Object.entries(root.gamepb || {})) {
  if (!ns || typeof ns !== 'object') continue;
  for (const [name, Type] of Object.entries(ns)) {
    if (typeof Type === 'function' && typeof Type.encode === 'function') protobufTypeNames.set(Type, `gamepb.${pkg}.${name}`);
  }
}
for (const [name, Type] of Object.entries(root.gatepb || {})) {
  if (typeof Type === 'function' && typeof Type.encode === 'function') protobufTypeNames.set(Type, `gatepb.${name}`);
}
if (process.argv.includes('--native-codec')) {
  const seenNamespaces = new Set();
  function collectNamespace(ns, prefix, depth) {
    if (!ns || !['object', 'function'].includes(typeof ns) || depth > 8 || seenNamespaces.has(ns)) return;
    seenNamespaces.add(ns);
    for (const [name, value] of Object.entries(ns)) {
      const full = prefix ? prefix + '.' + name : name;
      if (typeof value === 'function' && typeof value.encode === 'function' && typeof value.decode === 'function') { protobufTypeNames.set(value, full); collectNamespace(value, full, depth + 1); }
      else if (value && typeof value === 'object' && !Array.isArray(value)) collectNamespace(value, full, depth + 1);
    }
  }
  collectNamespace(root, '', 0);
}

function inferNestedType(Type, field, defaultValue) {
  const isLong = defaultValue && typeof defaultValue === 'object' && Object.prototype.hasOwnProperty.call(defaultValue, 'low');
  if (!(defaultValue === null || Array.isArray(defaultValue) || (defaultValue && typeof defaultValue === 'object' && !isLong))) return null;
  const calls = [];
  const patched = [];
  for (const [candidate] of protobufTypeNames) {
    const original = candidate.encode;
    candidate.encode = function (...args) {
      calls.push(candidate);
      return original.apply(this, args);
    };
    patched.push([candidate, original]);
  }
  try {
    const values = Array.isArray(defaultValue) ? [[1], [{}]] : [{}, { sample: 1 }, { sample: {} }];
    for (const value of values) {
      try {
        const msg = Type.create ? Type.create() : new Type();
        msg[field] = value;
        Type.encode(msg).finish();
      } catch (_) {}
      const nested = calls.find(candidate => candidate !== Type) || (calls.length > 1 ? calls[1] : null);
      if (nested) return protobufTypeNames.get(nested) || null;
      calls.length = 0;
    }
    return null;
  } finally {
    for (const [candidate, original] of patched) candidate.encode = original;
  }
}

function inferMessage(Type, name) {
  const msg = Type.create ? Type.create() : new Type();
  const fields = [];
  for (const field of Object.getOwnPropertyNames(Type.prototype || {})) {
    if (['constructor', 'toJSON'].includes(field) || field.startsWith('_')) continue;
    const defaultValue = msg[field];
    const encoded = encodeOne(Type, field, defaultValue);
    if (!encoded) {
      fields.push({ name: field, field: null, wire: null, defaultKind: Array.isArray(defaultValue) ? 'array' : (defaultValue === null ? 'message' : typeof defaultValue) });
      continue;
    }
    const tags = allTags(encoded.bytes);
    const kind = Array.isArray(defaultValue) ? 'array' : (defaultValue === null ? 'message' : typeof defaultValue);
    fields.push({ name: field, field: tags.length ? tags[0].field : null, wire: tags.length ? tags[0].wire : null, defaultKind: kind, nestedType: inferNestedType(Type, field, defaultValue), sampleLength: encoded.bytes.length, tagCount: tags.length });
  }
  fields.sort((a, b) => (a.field ?? 1e9) - (b.field ?? 1e9));
  return { name, fields };
}

if (process.argv.includes('--native-codec')) {
  const registry = {}, failures = [];
  for (const [Type, fullName] of protobufTypeNames) {
    const name = fullName.replace(/^gamepb\./, ''), defaults = Type.create ? Type.create() : new Type(), fields = {};
    for (const field of Object.getOwnPropertyNames(Type.prototype || {})) {
      if (field === 'constructor' || field === 'toJSON' || field.startsWith('_')) continue;
      if (typeof Object.getOwnPropertyDescriptor(Type.prototype, field)?.get === 'function') continue; // protobuf oneof selector, not a wire field
      const defaultValue = defaults[field];
      let encoded = encodeOne(Type, field, defaultValue);
      if (!encoded && Array.isArray(defaultValue)) {
        try { const msg = Type.create(); msg[field] = ['x']; encoded = { bytes: Type.encode(msg).finish(), value: ['x'] }; } catch {}
      }
      if (!encoded) { failures.push(name + '.' + field); continue; }
      const tag = firstTag(encoded.bytes), operations = [];
      let writer; writer = new Proxy({}, { get: (_, method) => method === 'len' ? 0 : (...args) => { operations.push(String(method)); return writer; } });
      const message = Type.create ? Type.create() : new Type(); message[field] = encoded.value;
      try { Type.encode(message, writer); } catch (error) { throw new Error(name + '.' + field + ': writer trace failed'); }
      let nested = inferNestedType(Type, field, defaultValue)?.replace(/^gamepb\./, '');
      if (!nested) {
        try {
          let value = Type.decode(encoded.bytes)[field];
          if (Array.isArray(value)) value = value[0];
          if (value && !protobufTypeNames.has(value.constructor) && typeof value === 'object' && !ArrayBuffer.isView(value)) value = Object.values(value)[0];
          nested = value && protobufTypeNames.get(value.constructor)?.replace(/^gamepb\./, '');
        } catch {}
      }
      const scalar = operations.slice(1).find(x => !['fork', 'ldelim', 'finish'].includes(x));
      const isLong = defaultValue && typeof defaultValue === 'object' && Object.prototype.hasOwnProperty.call(defaultValue, 'low');
      const isMap = defaultValue && typeof defaultValue === 'object' && !isLong && !Array.isArray(defaultValue) && !ArrayBuffer.isView(defaultValue);
      let kind;
      if (isMap) {
        const fork = operations.indexOf('fork'), keyKind = operations[fork + 2], valueKind = nested ? 'message:' + nested : operations[fork + 4];
        if (!keyKind || !valueKind) throw new Error('Cannot infer map ' + name + '.' + field);
        kind = 'map:' + keyKind + ':' + valueKind;
      } else kind = nested ? 'message:' + nested : scalar;
      if (!kind) { let detail; try {const v=Type.decode(encoded.bytes)[field];detail={ctor:v?.constructor?.name,keys:v&&Object.keys(v),staticKeys:v?.constructor&&Object.keys(v.constructor)};}catch(e){detail={error:String(e)}};throw new Error('Cannot infer field ' + name + '.' + field + ': ' + JSON.stringify({ operations, nested, defaultKind: typeof defaultValue, array: Array.isArray(defaultValue), value: encoded.value, bytes: [...encoded.bytes],detail })); }
      if (Array.isArray(defaultValue)) kind = 'repeated:' + kind;
      fields[field] = [tag.field, kind, Array.isArray(defaultValue) && operations.includes('fork') && !nested];
    }
    registry[name] = fields;
  }
  if (failures.length) throw new Error('Native schema fields were not recovered: ' + failures.join(', '));
  for (const [name, fields] of Object.entries(registry)) for (const [field, spec] of Object.entries(fields)) {
    const match = /message:(.+)$/.exec(spec[1]); if (match && !registry[match[1]]) throw new Error('Missing native nested type ' + name + '.' + field + ': ' + match[1]);
  }
  fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(registry));
  if (process.argv.includes('--codec-fixtures')) {
    // Expected wire bytes come from the cached game's generated factories,
    // independently of the C# codec under test. These contain synthetic data.
    const types = new Map([...protobufTypeNames].map(([type, name]) => [name.replace(/^gamepb\./, ''), type]));
    function sample(kind, depth) {
      if (kind.startsWith('repeated:')) return [sample(kind.slice(9), depth), sample(kind.slice(9), depth)];
      if (kind.startsWith('map:')) {
        const match = /^map:([^:]+):(.+)$/.exec(kind);
        return { [match[1] === 'string' ? 'farm' : '24']: sample(match[2], depth) };
      }
      if (kind.startsWith('message:')) return depth > 2 ? {} : message(kind.slice(8), depth + 1);
      return kind === 'bool' ? true : kind === 'string' ? '农场 fixture' : kind === 'bytes' ? 'AAH/gAE=' : kind === 'int64' ? '9007199254740993' : kind === 'int32' ? -17 : 1.25;
    }
    function message(name, depth) { return Object.fromEntries(Object.entries(registry[name]).map(([key, spec]) => [key, sample(spec[1], depth)])); }
    function native(kind, value) {
      if (kind.startsWith('repeated:')) return value.map(v => native(kind.slice(9), v));
      if (kind.startsWith('map:')) { const subtype = /^map:[^:]+:(.+)$/.exec(kind)[1]; return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, native(subtype, v)])); }
      if (kind.startsWith('message:')) return convert(kind.slice(8), value);
      return kind === 'bytes' ? Buffer.from(value, 'base64') : value;
    }
    function convert(name, input) { return Object.fromEntries(Object.entries(input).map(([key, value]) => [key, native(registry[name][key][1], value)])); }
    function canonical(kind, value) {
      if (kind.startsWith('repeated:')) return value.map(v => canonical(kind.slice(9), v));
      if (kind.startsWith('map:')) {
        const [, keyType, subtype] = /^map:([^:]+):(.+)$/.exec(kind);
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [keyType === 'int64' && !/^-?\d+$/.test(k) ? protobuf.util.longFromHash(k, false).toString() : k, canonical(subtype, v)]));
      }
      if (kind.startsWith('message:')) return canonicalMessage(kind.slice(8), value);
      return kind === 'bytes' ? Buffer.from(value).toString('base64') : kind === 'int64' ? value.toString() : value;
    }
    function canonicalMessage(name, value) {
      return Object.fromEntries(Object.entries(value).filter(([key, v]) => registry[name][key] && !(Array.isArray(v) && !v.length) && !(registry[name][key][1].startsWith('map:') && !Object.keys(v).length)).map(([key, v]) => [key, canonical(registry[name][key][1], v)]));
    }
    const fixtures = [...types].map(([name, type]) => {
      const input = message(name, 0), bytes = type.encode(convert(name, input)).finish();
      return { name, input, wire: Buffer.from(bytes).toString('base64'), expected: canonicalMessage(name, type.decode(bytes)) };
    });
    fs.writeFileSync(path.join(path.dirname(output), 'codec-fixtures.json'), JSON.stringify(fixtures));
    console.log('Independent codec fixtures: ' + fixtures.length);
  }
  console.log(JSON.stringify({ output, messages: Object.keys(registry).length, fields: Object.values(registry).reduce((n, x) => n + Object.keys(x).length, 0) }));
  process.exit(0);
}

const wanted = {
  friendpb: [],
  visitpb: [],
  itempb: [],
  plantpb: ['AllLandsRequest', 'PlantRequest', 'PlantReply', 'HarvestRequest', 'HarvestReply', 'FertilizeRequest', 'FertilizeReply', 'LandInfo', 'PlantInfo', 'PlantPhaseInfo'],
  userpb: ['LoginRequest', 'LoginReply', 'HeartbeatRequest', 'HeartbeatReply', 'PlayerLoginRequest', 'PlayerLoginReply'],
  taskpb: ['TaskInfoRequest', 'TaskInfoReply', 'ClaimTaskRewardRequest', 'ClaimTaskRewardReply', 'BatchClaimTaskRewardRequest', 'BatchClaimTaskRewardReply', 'ClaimDailyRewardRequest', 'ClaimDailyRewardReply'],
  shoppb: ['ShopInfoRequest', 'ShopInfoReply', 'BuyGoodsRequest', 'BuyGoodsReply', 'GoodsInfo'],
  mallpb: ['GetMallProfilesRequest', 'GetMallProfilesReply', 'GetMallListBySlotTypeRequest', 'GetMallListBySlotTypeReply', 'PurchaseRequest', 'PurchaseReply', 'ProductInfo'],
  qqvippb: ['GetDailyGiftStatusRequest', 'GetDailyGiftStatusReply', 'ClaimDailyGiftRequest', 'ClaimDailyGiftReply', 'ClaimQQVipRewardsRequest', 'ClaimQQVipRewardsReply', 'GetQQVipRewardsStatusRequest', 'GetQQVipRewardsStatusReply'],
};
if (process.argv.includes('--inspect-services')) {
  for (const pkg of ['userpb', 'taskpb', 'qqvippb', 'mallpb', 'plantpb', 'itempb']) {
    const ns = root.gamepb[pkg] || {};
    const report = {};
    for (const [name, value] of Object.entries(ns)) {
      if (typeof value === 'function') report[name] = { static: Object.getOwnPropertyNames(value), proto: Object.getOwnPropertyNames(value.prototype || {}) };
      else if (value && typeof value === 'object') report[name] = Object.keys(value).slice(0, 100);
    }
    console.log('SERVICE_NS', pkg, JSON.stringify(report));
  }
}
if (process.argv.includes('--inspect-gate')) {
  const gate = root.gatepb || {};
  const report = {};
  for (const [name, value] of Object.entries(gate)) {
    if (Array.isArray(value)) report[name] = value;
    else if (value && typeof value === 'object') report[name] = Object.keys(value).map(key => [key, value[key]]);
    else if (typeof value === 'function') report[name] = { proto: Object.getOwnPropertyNames(value.prototype || {}) };
  }
  console.log('GATEPB', JSON.stringify(report));
}
if (process.argv.includes('--rpc-map')) {
  const rpcMap = { generatedFrom: path.resolve(gamePath), services: {} };
  for (const pkg of ['userpb', 'taskpb', 'qqvippb', 'shoppb', 'mallpb', 'plantpb', 'itempb']) {
    const ns = root.gamepb[pkg] || {};
    for (const [serviceName, Service] of Object.entries(ns)) {
      if (typeof Service !== 'function' || !/Service$/.test(serviceName)) continue;
      const methods = {};
      for (const methodName of Object.getOwnPropertyNames(Service.prototype || {})) {
        if (methodName === 'constructor') continue;
        const implementation = Service.prototype[methodName];
        if (typeof implementation !== 'function') continue;
        let rpcArguments = null;
        const receiver = new Proxy({}, { get: () => (...args) => { rpcArguments = args; } });
        try { implementation.call(receiver, {}, () => {}); } catch (_) {}
        const typeName = Type => {
          if (typeof Type !== 'function') return null;
          for (const [name, candidate] of Object.entries(ns)) if (candidate === Type) return `gamepb.${pkg}.${name}`;
          return null;
        };
        methods[methodName] = {
          requestType: typeName(rpcArguments?.[1]),
          responseType: typeName(rpcArguments?.[2]),
          extractedBy: 'invoked generated method against an offline rpcCall capture stub',
        };
      }
      rpcMap.services[`gamepb.${pkg}.${serviceName}`] = methods;
    }
  }
  const rpcOutput = process.argv[process.argv.indexOf('--rpc-map') + 1] || 'artifacts/rpc-map.json';
  fs.mkdirSync(path.dirname(rpcOutput), { recursive: true });
  fs.writeFileSync(rpcOutput, JSON.stringify(rpcMap, null, 2));
  console.log(JSON.stringify({ output: rpcOutput, services: Object.keys(rpcMap.services).length,
    methods: Object.values(rpcMap.services).reduce((n, methods) => n + Object.keys(methods).length, 0) }, null, 2));
  process.exit(0);
}
const schema = { generatedFrom: path.resolve(gamePath), modules: {} };
const fullSchema = process.argv.includes('--full-schema');
for (const [pkg, selectedNames] of Object.entries(wanted)) {
  const ns = root.gamepb[pkg] || {};
  schema.modules[pkg] = {};
  const names = fullSchema
    ? Object.entries(ns).filter(([, Type]) => typeof Type === 'function' && typeof Type.encode === 'function' && typeof Type.decode === 'function').map(([name]) => name)
    : selectedNames;
  for (const name of names) if (typeof ns[name] === 'function') schema.modules[pkg][name] = inferMessage(ns[name], name);
}
schema.envelope = {};
for (const name of ['Message', 'Meta', 'EventMessage', 'KickoutNotify', 'RedirectNotify', 'Error']) {
  const Type = root.gatepb?.[name];
  if (typeof Type === 'function') schema.envelope[name] = inferMessage(Type, name);
}
schema.gateEnums = {};
for (const [name, value] of Object.entries(root.gatepb || {})) {
  if (value && typeof value === 'object' && !Array.isArray(value)) schema.gateEnums[name] = Object.fromEntries(Object.entries(value));
}
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(schema, null, 2));
console.log(JSON.stringify({ output, modules: Object.fromEntries(Object.entries(schema.modules).map(([k, v]) => [k, Object.keys(v).length])), envelopeMessages: Object.keys(schema.envelope).length }, null, 2));

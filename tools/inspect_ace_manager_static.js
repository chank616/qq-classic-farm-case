const fs = require('fs');
const vm = require('vm');

const cachePath = process.argv[2] || 'C:/Users/chank616/AppData/Roaming/QQEX/miniapp/temps/miniapp_src/1112386029_3_3443f89042dffbf93d20ced1d652d031/game.js';
const outPath = process.argv[3] || 'artifacts/ace-manager-static.json';
const source = fs.readFileSync(cachePath, 'utf8');
const a = source.indexOf('globalThis._Аce_7716=function(){');
const b = source.indexOf('}();var', a) + 3;
const c = source.indexOf('define("assets/main/index.4fbdd.js"');
const d = source.indexOf('{', c);
const e = source.indexOf('\n});\ndefine(', d);
if (a < 0 || b < 3 || c < 0 || e < 0) throw new Error('Cached main bundle not found');

const any = () => new Proxy(function () {}, {
  get: (_t, k) => k === 'then' ? undefined : any(),
  apply: () => any(),
  construct: () => any(),
});
const classBuilds = [];
const helperAccesses = [];
const dependencyAccesses = [];
function defineProperties(target, descriptors) {
  classBuilds.push({ target: target?.name || typeof target, descriptors: Array.from(descriptors || []).map(item => ({ key: item.key, type: typeof item.value })) });
  for (const descriptor of descriptors || []) {
    const property = {
      configurable: descriptor.configurable ?? true,
      enumerable: descriptor.enumerable ?? false,
    };
    if (descriptor.get || descriptor.set) { property.get = descriptor.get; property.set = descriptor.set; }
    else { property.writable = descriptor.writable ?? true; property.value = descriptor.value; }
    Object.defineProperty(target, descriptor.key, property);
  }
}
const helpers = new Proxy({}, { get: (_target, key) => {
  helperAccesses.push(String(key));
  if (key === 'createClass') return (Ctor, protoProps, staticProps) => { defineProperties(Ctor.prototype, protoProps); defineProperties(Ctor, staticProps); return Ctor; };
  if (key === 'classCallCheck') return (instance, Ctor) => { if (!(instance instanceof Ctor)) throw new TypeError('class called without new'); };
  if (key === 'inherits') return (sub, sup) => { Object.setPrototypeOf(sub.prototype, sup && sup.prototype); Object.setPrototypeOf(sub, sup); };
  if (key === 'possibleConstructorReturn') return (_self, value) => value;
  if (key === 'assertThisInitialized') return value => value;
  if (key === 'getPrototypeOf') return Object.getPrototypeOf;
  if (key === 'setPrototypeOf') return Object.setPrototypeOf;
  if (key === 'createSuper') return Ctor => function () { return Object.getPrototypeOf(Ctor).apply(this, arguments) || this; };
  return any();
} });
const ctx = {
  console, Function, Date, JSON, Array, Object, String, Number, Boolean, RegExp, Math,
  Uint8Array, Int8Array, ArrayBuffer, decodeURIComponent, encodeURIComponent, parseInt,
  parseFloat, Promise, setTimeout, clearTimeout, Map, Set, globalThis: null,
};
ctx.globalThis = ctx;
ctx.window = any(); ctx.document = any(); ctx.canvas = any(); ctx.qq = any(); ctx.wx = any();
const identityDecorator = (..._decoratorArgs) => target => target;
ctx.cc = {
  cclegacy: { _RF: { push() {}, pop() {} } },
  _decorator: new Proxy({}, { get: () => identityDecorator }),
};
ctx.SystemRecords = [];
ctx.System = new Proxy({}, { get: (_t, key) => (...args) => {
  const rec = { key: String(key), args, exports: {} };
  ctx.SystemRecords.push(rec);
  if (typeof args[2] === 'function') rec.reg = args[2]((name, value) => {
    if (typeof name === 'string') rec.exports[name] = value;
    else if (name && typeof name === 'object') Object.assign(rec.exports, name);
    return value;
  });
  return any();
} });
ctx.require = id => id.includes('interopRequireDefault') ? value => ({ default: value }) : any();
vm.createContext(ctx);
vm.runInContext(source.slice(a, b) + ';', ctx);
const mainFactory = vm.runInContext(`(function(require,module,exports){${source.slice(d + 1, e)}\n})`, ctx);
mainFactory(ctx.require, { exports: {} }, {});
const rec = ctx.SystemRecords.find(item => item.args[0] === 'chunks:///_virtual/AceManager.ts');
if (!rec) throw new Error('AceManager module not registered');
for (let index = 0; index < rec.reg.setters.length; index++) {
  const setter = rec.reg.setters[index];
  if (typeof setter !== 'function') continue;
  if (index === 0) setter(helpers);
  else if (rec.args[1][index] === 'cc') setter(ctx.cc);
  else {
    const dependency = rec.args[1][index];
    const proxy = new Proxy(function () {}, {
      get(_target, key) { if (key !== 'then') dependencyAccesses.push({ dependency, export: String(key) }); return any(); },
      apply() { return any(); },
      construct() { return any(); },
    });
    setter(proxy);
  }
}
rec.reg.execute();
const AceManager = rec.exports.AceManager;
const methods = [];
for (const key of Object.getOwnPropertyNames(AceManager.prototype || {})) {
  if (key === 'constructor') continue;
  const descriptor = Object.getOwnPropertyDescriptor(AceManager.prototype, key);
  const fn = descriptor?.value;
  if (typeof fn === 'function') methods.push({ name: key, source: Function.prototype.toString.call(fn) });
}
const statics = [];
for (const key of Object.getOwnPropertyNames(AceManager)) {
  if (['length', 'name', 'prototype'].includes(key)) continue;
  const descriptor = Object.getOwnPropertyDescriptor(AceManager, key);
  const fn = descriptor?.value;
  if (typeof fn === 'function') statics.push({ name: key, source: Function.prototype.toString.call(fn) });
  else statics.push({ name: key, type: typeof fn, value: typeof fn === 'string' || typeof fn === 'number' || typeof fn === 'boolean' ? fn : undefined });
}
const result = {
  module: rec.args[0], dependencies: rec.args[1],
  exportNames: Object.keys(rec.exports),
  exportedClassSource: typeof AceManager === 'function' ? Function.prototype.toString.call(AceManager) : null,
  exportedPrototypeNames: Object.getOwnPropertyNames(AceManager?.prototype || {}),
  methods, statics, classBuilds,
  tokenMethodSeparation: {
    randomStr: methods.find(item => item.name === 'randomStr')?.source || null,
    getToken: methods.find(item => item.name === 'getToken')?.source || null,
    getToken2: methods.find(item => item.name === 'getToken2')?.source || null,
  },
  helperAccesses, dependencyAccesses,
  factorySource: Function.prototype.toString.call(rec.args[2]),
  tsdkCallSiteCounts: Object.fromEntries([
    ['RegisterInitCallback', /\be\(/g], ['SdkInitEx', /\bu\(/g], ['AnoUserLogin', /\bh\(/g],
    ['getToken', /\bs\(/g], ['encryptData', /\bz\(/g], ['getDataToServer', /\bH\(/g], ['sendDataFromServer', /\bP\(/g],
  ].map(([name, pattern]) => [name, [...Function.prototype.toString.call(rec.args[2]).matchAll(pattern)].length])),
  boundary: 'Offline class-factory extraction from cached bundle. Host crypto, login, and network APIs were not invoked.',
};
fs.writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n');
const candidate = result.factorySource.match(/n\[T\[19042\]\]=function\(\)\{for\(var i=Ti\(\)\[M\[739\]\]\(64\*Ti\(\)\[T\[604\]\]\(\)\)\+64,t="",n=J\[15940\],r=n\[R\[7\]\],e=0;e<i;e\+\+\)t\+=n\[Y\[7854\]\]\(Ti\(\)\[f\[739\]\]\(Ti\(\)\[v\[604\]\]\(\)\*r\)\);return t\+"="\}/);
const analysisPath = 'artifacts/wsframes-analysis.json';
const analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf8'));
const histogram = {};
let session = -1;
const perConnection = {};
for (const event of analysis.events) {
  if (event.dir === 'BOOT') { session++; perConnection[session] = { count: 0, over128: 0, maxLength: 0 }; continue; }
  if (event.dir !== 'S') continue;
  const token = event.envelopeFields?.find(field => field.field === 3);
  if (!token) continue;
  const row = perConnection[session];
  row.count++;
  row.maxLength = Math.max(row.maxLength, token.length || 0);
  if (token.length > 128) { row.over128++; row.firstOver128Method ||= event.method; row.firstOver128Time ||= event.iso; }
  histogram[token.length] = (histogram[token.length] || 0) + 1;
}
const tokenReport = {
  source: 'latest cached AceManager.ts factory plus sanitized wsframes-analysis metadata',
  dependencies: result.dependencies,
  candidateFunctionSource: candidate?.[0] || null,
  candidateInterpretation: candidate ? 'Runtime extraction with the Cocos class decorator stub maps this exact implementation to AceManager.prototype.randomStr. It chooses an integer in [64,127], appends that many characters sampled with Math.random from the bundle alphabet, then appends "=". NetNode.send directly calls AceManager.ins.randomStr() before setting gatepb.Message.token. This establishes the local token source for that send path, while not explaining the 152-byte first-per-connection samples.' : 'Candidate code pattern not found.',
  candidateOutputLengthRange: candidate ? [65, 128] : null,
  observedEnvelopeField3: {
    samples: Object.values(perConnection).reduce((total, row) => total + row.count, 0),
    minLength: Math.min(...Object.keys(histogram).map(Number)),
    maxLength: Math.max(...Object.keys(histogram).map(Number)),
    histogram,
    perConnection,
  },
  interpretation: 'Most observed field-3 lengths fit AceManager.randomStr output, but 18 field-3 values of length 152 exceed its maximum, one on each captured connection. AceManager.getToken and getToken2 separately forward input to the TSDK getToken export; no call-site or value-equivalence evidence links those methods to the 152-byte field-3 values. Keep the first-message anomaly unresolved. No token contents are emitted.',
  boundary: 'Static analysis only. No random values are generated or logged; no host APIs or network are used.',
};
fs.writeFileSync('artifacts/ace-token-candidate.json', JSON.stringify(tokenReport, null, 2) + '\n');
console.log(JSON.stringify({ output: outPath, tokenReport: 'artifacts/ace-token-candidate.json', dependencies: result.dependencies, methods: methods.map(item => item.name), candidateFound: Boolean(candidate), over128: tokenReport.observedEnvelopeField3.perConnection }, null, 2));

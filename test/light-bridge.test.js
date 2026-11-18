const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../tools/tsdk-extract/light.js'), 'utf8');

function fixture() {
  const state = { ready: false, cryptoReady: false, requests: [], timers: [], jobs: [], logins: 0 };
  const api = {
    encryptData: bytes => state.cryptoReady ? Uint8Array.from(bytes) : new Uint8Array(),
    decryptData: bytes => Uint8Array.from(bytes),
  };
  const context = vm.createContext({
    Uint8Array, Date, Math, location: { href: 'https://farm/1112386029' },
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    System: { get: name => state.ready ? name.includes('tsdk_info') ? api : { gamepb: {} } : null },
    wx: { login: options => { state.logins++; options.success({ code: 'fixture-only' }); } },
    setTimeout: (fn, delay) => state.timers.push({ fn, delay }),
    setInterval: (fn, delay) => state.timers.push({ fn, delay, interval: true }),
    fetch: async (url, options = {}) => {
      const route = new URL(url).pathname;
      const body = options.body ? JSON.parse(options.body) : null;
      state.requests.push({ route, url, body });
      return { json: async () => route === '/host-ready' ? { active: true, needsCode: !!state.needsCode } :
        route === '/crypto-task' ? state.jobs.shift() || {} : {} };
    },
  });
  state.flush = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
  state.tick = async delay => {
    const index = state.timers.findIndex(t => t.delay === delay);
    assert.notEqual(index, -1, 'expected a scheduled retry');
    const timer = state.timers.splice(index, 1)[0]; timer.fn(); await state.flush();
  };
  vm.runInContext(source, context);
  state.api = api;
  return state;
}

test('cold farm startup waits for the real game without loading a second WASM runtime', async () => {
  const f = fixture(); await f.flush();
  assert.equal(f.requests.some(r => r.route === '/tsdk-mini.js'), false);
  assert.equal(f.requests.some(r => r.route === '/host-ready'), false);
  assert.equal(f.logins, 0);
  f.ready = true;
  await f.tick(1000);
  assert.equal(f.requests.some(r => r.route === '/host-ready'), false, 'empty encryption must not mark the page ready');
  f.cryptoReady = true;
  await f.tick(1000);
  const registration = f.requests.find(r => r.route === '/host-ready');
  assert.equal(registration.body.version, 2);
  assert.equal(registration.body.cryptoReady, true);
  assert.equal(f.logins, 1);
  assert.equal(f.requests.find(r => r.route === '/code').body.hostId, registration.body.hostId);
});

test('crypto failure is returned as an error instead of a successful empty ciphertext', async () => {
  const f = fixture(); f.ready = true; f.cryptoReady = true;
  await f.tick(1000);
  f.cryptoReady = false;
  f.jobs.push({ id: 'job-1', op: 'e', b64: 'CAI=' });
  await f.tick(1000);
  await f.tick(1000);
  const result = f.requests.find(r => r.route === '/crypto-result');
  assert.equal(result.body.id, 'job-1');
  assert.match(result.body.error, /not ready/);
  assert.equal(result.body.b64, undefined);
  assert.ok(new URL(f.requests.find(r => r.route === '/crypto-task').url).searchParams.get('hostId'));
});

test('the existing farm page automatically supplies a new code after the C# host restarts', async () => {
  const f = fixture(); f.ready = true; f.cryptoReady = true;
  await f.tick(1000);
  assert.equal(f.logins, 1);
  f.needsCode = true;
  await f.tick(10000);
  assert.equal(f.logins, 2);
  assert.equal(f.requests.filter(r => r.route === '/code').length, 2);
});

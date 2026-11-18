'use strict';

const { buildFrame, parseFrame, randomToken } = require('./protocol');
const { services, registry } = require('./schema');
const { encodeMessage, decodeMessage } = require('./pb');

const VERSION = '1.15.0.2_20261001';
const BASE = process.env.FARM_SINK || 'http://127.0.0.1:17841';

async function http(path, data) {
  const response = await fetch(BASE + path, {
    method: data === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: data === undefined ? undefined : JSON.stringify(data),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error('Local farm service ' + path + ': HTTP ' + response.status);
  return response.json();
}

async function bridge(job) {
  const r = await http('/bridge', job);
  if (r.error) throw new Error(r.error);
  return r;
}

function paths(service, method) {
  const entry = services[service]?.[method];
  const ns = service.split('.')[1];
  return entry || [ns + '.' + method + 'Request', ns + '.' + method + 'Reply'];
}

async function connect() {
  const code = await http('/code');
  if (!code.code || Date.now() - code.at > 90000) throw new Error('QQ farm login code is unavailable or stale');
  const ws = new WebSocket('wss://gate-obt.nqf.qq.com/prod/ws?os=Windows&ver=' + VERSION + '&code=' +
    encodeURIComponent(code.code) + '&platform=qq');
  ws.binaryType = 'arraybuffer';
  let seq = 1;
  const pending = new Map();
  let closed = false;
  const rejectAll = error => { for (const p of pending.values()) p.reject(error); pending.clear(); };
  ws.addEventListener('close', () => { closed = true; rejectAll(new Error('Farm connection closed')); });
  ws.addEventListener('error', () => rejectAll(new Error('Farm connection error')));
  ws.addEventListener('message', async event => {
    let frame;
    try { frame = parseFrame(Buffer.from(event.data)); } catch (_) { return; }
    if (Number(frame.meta?.message_type) !== 2) return;
    const p = pending.get(Number(frame.meta.client_seq));
    if (!p) return;
    pending.delete(Number(frame.meta.client_seq));
    try {
      let decoded;
      try {
        decoded = (await bridge({ op: 'decode', path: p.reply, b64: Buffer.from(frame.body || []).toString('base64') })).value;
      } catch (error) {
        // A missing class is the only reason to use a pinned offline schema.
        if (!/missing class/.test(error.message) || !registry[p.reply]) throw error;
        decoded = decodeMessage(p.reply, frame.body || [], registry);
      }
      p.resolve({ err: Number(frame.meta.error_code) || 0, msg: frame.meta.error_message || '', decoded });
    } catch (error) { p.reject(error); }
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { ws.close(); reject(new Error('Farm websocket open timeout')); }, 15000);
    ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Farm websocket open failed')); }, { once: true });
  });
  async function rpc(service, method, value = {}) {
    if (closed || ws.readyState !== 1) throw new Error('Farm is disconnected');
    const [request, reply] = paths(service, method);
    let encoded;
    try { encoded = Buffer.from((await bridge({ op: 'encode', path: request, value })).b64 || '', 'base64'); }
    catch (error) {
      if (!/missing class/.test(error.message) || !registry[request]) throw error;
      encoded = Buffer.from(encodeMessage(request, value, registry));
    }
    let body = Buffer.alloc(0);
    if (encoded.length) {
      const encrypted = await http('/crypto-task', { op: 'e', b64: encoded.toString('base64') });
      if (!encrypted.b64) throw new Error('QQ farm encryption host unavailable');
      body = Buffer.from(encrypted.b64, 'base64');
    }
    const s = seq++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(s); reject(new Error('RPC timeout: ' + method)); }, 25000);
      pending.set(s, {
        reply,
        resolve: result => { clearTimeout(timer); resolve(result); },
        reject: error => { clearTimeout(timer); reject(error); },
      });
      try { ws.send(buildFrame({ service, method, messageType: 1, seq: s, body, token: randomToken() })); }
      catch (error) { pending.delete(s); clearTimeout(timer); reject(error); }
    });
  }
  return { rpc, close() { closed = true; rejectAll(new Error('Farm pass ended')); ws.close(); } };
}

module.exports = { connect, http, VERSION, bridge };

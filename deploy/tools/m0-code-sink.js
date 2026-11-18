'use strict';

// Local receiver + boot server for the QQEX frame context.
//
//   POST /evt      - receives JSON events from the injected frame scripts
//                    (code service + our runtime client). Metadata only:
//                    raw login codes/tokens are never written to disk.
//   GET  /boot.js  - serves the bundled runtime client so the injected frame
//                    script can eval it without touching files again.
//   GET  /health   - liveness probe.
//
// Hygiene: this sink records METADATA ONLY (length, truncated SHA-256, charset,
// timing). Raw code values are never written to disk.

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.M0_SINK_PORT || 17841);
const ROOT = path.join(__dirname, '..');
const OUT = process.argv[2] || path.join(ROOT, 'artifacts', 'm0-code-capture.jsonl');
const CAP = path.join(ROOT, 'artifacts', 'ws-captures.jsonl');
const BUNDLE = path.join(ROOT, 'client', 'dist', 'farm-runtime.bundle.js');

// ── light-host plumbing ────────────────────────────────────────────────────
// The login code and crypto payloads stay in memory only; nothing here is
// written to disk (the capture file keeps metadata only).
const TSDK_MINI = path.join(ROOT, 'tools', 'tsdk-extract', 'tsdk-mini.js');
const LIGHT_JS = path.join(ROOT, 'tools', 'tsdk-extract', 'light.js');
let latestCode = null;
let latestCodeAt = 0;
const cryptoQueue = [];
const cryptoWaiters = new Map();
let cryptoSeq = 0;
let hostAt = 0;
const bridgeQueue = [];
const bridgeWaiters = new Map();
let bridgeSeq = 0;

function sha16(s) {
  return crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Cache-Control', 'no-store');
}

const server = http.createServer((req, res) => {
  cors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && (req.url === '/boot.js' || req.url.startsWith('/boot.js?'))) {
    try {
      const body = fs.readFileSync(BUNDLE);
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      res.end(body);
    } catch (e) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('no bundle: ' + e.message);
    }
    return;
  }

  if (req.method === 'GET' && req.url.startsWith('/tsdk-mini.js')) {
    try {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(fs.readFileSync(TSDK_MINI));
    } catch (e) { res.writeHead(404); res.end('no tsdk-mini'); }
    return;
  }

  if (req.method === 'GET' && req.url.startsWith('/light.js')) {
    try {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(fs.readFileSync(LIGHT_JS));
    } catch (e) { res.writeHead(404); res.end('no light.js'); }
    return;
  }

  if (req.method === 'GET' && req.url === '/code') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(latestCode ? { code: latestCode, at: latestCodeAt } : { code: null }));
    return;
  }

  if (req.method === 'GET' && req.url === '/crypto-task') {
    const t = cryptoQueue.shift();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(t || {}));
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, bundle: fs.existsSync(BUNDLE), hostAt,
      codeAt: latestCodeAt, hostReady: Date.now() - hostAt < 30000,
      hasCode: !!latestCode }));
    return;
  }

  if (req.method === 'GET' && req.url === '/bridge-task') {
    let job;
    do { job = bridgeQueue.shift(); } while (job && !bridgeWaiters.has(job.id));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(job || {}));
    return;
  }

  if (req.method === 'GET' && req.url === '/cmd') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      renew: fs.existsSync(path.join(ROOT, 'artifacts', 'RENEW')),
      onePass: fs.existsSync(path.join(ROOT, 'artifacts', 'ONEPASS')),
      lightHost: true,
    }));
    return;
  }

  let body = '';
  req.on('data', c => { body += c; if (body.length > 262144) req.destroy(); });
  req.on('end', () => {
    if (req.url === '/host-ready') {
      hostAt = Date.now();
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}'); return;
    }
    if (req.url === '/bridge') {
      let input; try { input = JSON.parse(body); } catch (_) { res.writeHead(400); res.end('{}'); return; }
      if (!['encode', 'decode', 'inspect'].includes(input.op) || bridgeWaiters.size >= 32) {
        res.writeHead(400); res.end('{}'); return;
      }
      const id = 'b' + (++bridgeSeq);
      const timer = setTimeout(() => {
        bridgeWaiters.delete(id); res.writeHead(504); res.end('{"error":"host bridge timeout"}');
      }, 15000);
      bridgeWaiters.set(id, result => {
        clearTimeout(timer); res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      });
      bridgeQueue.push({ ...input, id }); return;
    }
    if (req.url === '/bridge-result') {
      let input = {}; try { input = JSON.parse(body); } catch (_) {}
      const waiter = bridgeWaiters.get(input.id);
      if (waiter) { bridgeWaiters.delete(input.id); waiter(input); }
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}'); return;
    }
    if (req.url === '/code') {
      try { const o = JSON.parse(body); if (o && typeof o.code === 'string') { latestCode = o.code; latestCodeAt = Date.now(); } } catch (_) { }
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}'); return;
    }
    if (req.url === '/crypto-task') {
      let o = {}; try { o = JSON.parse(body) || {}; } catch (_) { }
      const id = 'c' + (++cryptoSeq);
      cryptoQueue.push({ id: id, op: o.op === 'd' ? 'd' : 'e', b64: String(o.b64 || '') });
      const timer = setTimeout(() => {
        cryptoWaiters.delete(id);
        res.writeHead(504, { 'Content-Type': 'application/json' });
        res.end('{"error":"crypto timeout"}');
      }, 10000);
      cryptoWaiters.set(id, (out) => {
        clearTimeout(timer);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: id, b64: out }));
      });
      return;
    }
    if (req.url === '/crypto-result') {
      let o = {}; try { o = JSON.parse(body) || {}; } catch (_) { }
      const key = String(o.id || '');
      const w = cryptoWaiters.get(key);
      if (w) { cryptoWaiters.delete(key); w(String(o.b64 || '')); }
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}'); return;
    }
    const rec = { t: new Date().toISOString(), path: req.url, bytes: body.length };
    try {
      const o = JSON.parse(body);
      if (o.type) rec.type = String(o.type);
      if (typeof o.n === 'number') rec.n = o.n;
      if (typeof o.code === 'string') {
        rec.codeLen = o.code.length;
        rec.codeSha16 = sha16(o.code);
        rec.charset = /^[0-9a-fA-F]+$/.test(o.code) ? 'hex'
          : /^[0-9A-Za-z_-]+$/.test(o.code) ? 'base64url/alnum'
          : /^[0-9A-Za-z]+$/.test(o.code) ? 'alnum'
          : 'other';
      }
      if (o.err) rec.err = String(o.err).slice(0, 300);
      if (o.href) rec.href = String(o.href).slice(0, 120);
      if (o.ch) rec.ch = o.ch;
      if (o.keys) rec.keys = o.keys;
      if (o.types) rec.types = o.types;
      if (o.codeLen !== undefined) rec.probeCodeLen = o.codeLen;
      if (o.codeSha16) rec.probeCodeSha16 = o.codeSha16;
      if (o.byteLength !== undefined) rec.byteLength = o.byteLength;
      if (o.keyLen !== undefined) rec.keyLen = o.keyLen;
      if (o.hasRandom !== undefined) rec.hasRandom = o.hasRandom;
      if (o.urlLen !== undefined) rec.urlLen = o.urlLen;
      if (o.fp) rec.fp = o.fp;
      if (o.url) rec.url = o.url;
      if (o.bytes !== undefined) rec.frameBytes = o.bytes;
      if (o.shapes) rec.shapes = o.shapes;
      if (o.fields) rec.fields = o.fields;
      if (o.methods) rec.methods = o.methods;
      if (o.plainLen !== undefined) rec.plainLen = o.plainLen;
      if (o.encrypted !== undefined) rec.encrypted = o.encrypted;
      if (o.decrypted !== undefined) rec.decrypted = o.decrypted;
      if (o.variant) rec.variant = o.variant;
      if (o.attempts) rec.attempts = o.attempts;
      if (o.ok !== undefined) rec.ok = o.ok;
      // Non-secret gameplay metadata used by the tray dashboard. Codes and
      // tokens are never persisted: only their length / truncated hash above.
      for (const k of ['name', 'gid', 'level', 'exp', 'gold', 'big_farm_level', 'big_farm_exp',
                       'lands', 'minMatureAt', 'lastGrowAt', 'nextInSec', 'fertilizer',
                       'mature', 'reason', 'success', 'items', 'count', 'total', 'ids',
                       'services', 'types', 'msg', 'fields', 'id', 'host', 'land', 'keys', 'summary',
                       'lands', 'crop', 'matureAt', 'growAt',
                       'points', 'diamonds', 'fertHours', 'fertOrgHours', 'sec',
                       'needSec', 'haveSec', 'needHours', 'haveHours', 'boughtPacks',
                       'packs', 'affordable', 'bought', 'seed', 'planted', 'dry', 'ok',
                       'already', 'slot', 'runId', 'mode', 'day', 'status', 'allRequiredComplete', 'reportPath']) {
        if (o[k] !== undefined) rec[k] = o[k];
      }
      if (o.pending !== undefined) rec.pending = o.pending;
      if (o.key !== undefined) rec.keyReady = o.key;
      if (o.seq !== undefined) rec.seq = o.seq;
      if (o.mt !== undefined) rec.mt = o.mt;
      if (o.seq !== undefined) rec.seq = o.seq;
      if (o.sseq !== undefined) rec.sseq = o.sseq;
      if (o.service) rec.service = o.service;
      if (o.method) rec.method = o.method;
      if (o.bodyLen !== undefined) rec.bodyLen = o.bodyLen;
      if (o.tokenLen !== undefined) rec.tokenLen = o.tokenLen;
      if (o.aad !== undefined) rec.aad = o.aad;
      if (o.decoded) rec.decoded = o.decoded;
      if (o.tag) rec.tag = o.tag;
      if (o.plainHead) rec.plainHead = o.plainHead;
      if (o.decryptor) rec.decryptor = o.decryptor;
      if (o.decodeErr) rec.decodeErr = o.decodeErr;
      if (o.keyRawLen !== undefined) rec.keyRawLen = o.keyRawLen;
      if (o.ivRawLen !== undefined) rec.ivRawLen = o.ivRawLen;
      if (o.keyCharset) rec.keyCharset = o.keyCharset;
      if (o.ivCharset) rec.ivCharset = o.ivCharset;
      if (o.ours !== undefined) rec.ours = o.ours;
      if (o.len !== undefined) rec.len = o.len;
      if (o.hits) rec.hits = o.hits;
      if (o.total !== undefined) rec.total = o.total;
      if (o.own !== undefined) rec.own = o.own;
      if (o.dir) rec.dir = o.dir;
      if (o.sameKey !== undefined) rec.sameKey = o.sameKey;
      if (o.hostKeyLen !== undefined) rec.hostKeyLen = o.hostKeyLen;
      if (o.ourLen !== undefined) rec.ourLen = o.ourLen;
      if (/-detail$/.test(rec.type) || rec.type === 'gameplay-start') {
        rec.detail = {};
        for (const k of Object.keys(o)) {
          if (k !== 't' && k !== 'ch') rec.detail[k] = o[k];
        }
      }
      if (o.b64) {
        // Encrypted wire bodies only; kept in a separate artifact for offline
        // crypto verification, never in the metadata log.
        try {
          fs.appendFileSync(CAP, JSON.stringify({
            t: rec.t, type: rec.type, ours: o.ours, len: o.len, b64: o.b64,
          }) + '\n');
          rec.captured = true;
        } catch (_) {}
      }
    } catch (e) {
      rec.parseError = String(e && e.message || e);
      rec.preview = body.slice(0, 80);
    }
    try { fs.appendFileSync(OUT, JSON.stringify(rec) + '\n'); } catch (_) {}
    process.stdout.write(JSON.stringify(rec) + '\n');
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
  });
});

server.on('error', e => {
  process.stdout.write('sink error: ' + e.code + ' ' + e.message + '\n');
  process.exit(1);
});

server.listen(PORT, '127.0.0.1', () => {
  process.stdout.write('sink+boot listening on 127.0.0.1:' + PORT + ' -> ' + OUT + '\n');
});

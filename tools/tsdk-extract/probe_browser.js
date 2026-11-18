'use strict';

// Boots the extracted tsdk bundle inside headless Chrome and reports whether
// _encrypt_data / _decrypt_data work outside the game.
//
//   node tools/tsdk-extract/probe_browser.js <versionDir> [--chrome <exe>]

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const DIR = __dirname;
const VDIR = process.argv[2];
const CHROME_DEFAULT = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
let chromeExe = CHROME_DEFAULT;
const ci = process.argv.indexOf('--chrome');
if (ci > 0 && process.argv[ci + 1]) chromeExe = process.argv[ci + 1];

if (!VDIR) { console.error('usage: node probe_browser.js <versionDir>'); process.exit(2); }

const PORT = 9455;
const CDP = 9444;

const server = http.createServer(function (req, res) {
  const u = req.url.split('?')[0];
  try {
    if (u === '/' || u === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><meta charset="utf-8"><title>tsdk probe</title><script src="/bundle.js"></script>');
      return;
    }
    if (u === '/bundle.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      res.end(fs.readFileSync(path.join(DIR, 'tsdk-browser.js')));
      return;
    }
    if (u === '/tsdk/tsdk.wasm') {
      res.writeHead(200, { 'Content-Type': 'application/wasm' });
      res.end(fs.readFileSync(path.join(VDIR, 'tsdk', 'tsdk.wasm')));
      return;
    }
  } catch (e) {
    res.writeHead(500); res.end(String(e));
    return;
  }
  res.writeHead(404); res.end('not found');
});

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

async function getJson(url) {
  const r = await fetch(url);
  return r.json();
}

async function main() {
  await new Promise(function (r) { server.listen(PORT, '127.0.0.1', r); });
  console.log('serving on ' + PORT);

  const profile = path.join(os.tmpdir(), 'tsdk-chrome-' + Date.now());
  const chrome = spawn(chromeExe, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--remote-debugging-port=' + CDP,
    '--user-data-dir=' + profile,
    'http://127.0.0.1:' + PORT + '/',
  ], { stdio: 'ignore' });

  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(500);
    try {
      const list = await getJson('http://127.0.0.1:' + CDP + '/json/list');
      target = list.find(function (t) { return t.type === 'page' && t.url.indexOf('127.0.0.1:' + PORT) !== -1; });
    } catch (_) { }
  }
  if (!target) throw new Error('chrome page target not found');
  console.log('target: ' + target.url);

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let nextId = 1;
  const pending = new Map();
  ws.addEventListener('message', function (ev) {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(JSON.stringify(msg.error)));
      else p.resolve(msg.result);
    }
  });
  await new Promise(function (res, rej) { ws.addEventListener('open', res); ws.addEventListener('error', rej); });

  function send(method, params) {
    const id = nextId++;
    return new Promise(function (resolve, reject) {
      pending.set(id, { resolve: resolve, reject: reject });
      ws.send(JSON.stringify({ id: id, method: method, params: params || {} }));
    });
  }

  await send('Runtime.enable', {});
  await send('Page.enable', {});

  async function evalJs(expr) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return { error: r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || '') };
    return { value: r.result && r.result.value };
  }

  let state = null;
  for (let i = 0; i < 120; i++) {
    await sleep(500);
    const r = await evalJs('window.__tsdkState + "|" + (window.__tsdkError || "")');
    state = r.value || '';
    if (state.indexOf('ready') === 0 || state.indexOf('error') === 0) break;
  }
  console.log('state: ' + state);

  if (state && state.indexOf('ready') === 0) {
    const r = await evalJs(`(function(){
      var api = window.__tsdk || window.tsdk;
      if (!api) return 'no-tsdk';
      var names = Object.keys(api).filter(function(k){ return k.indexOf('_') === 0; });
      var data = new TextEncoder().encode('hello-tsdk');
      var ptr = api._malloc(data.length);
      api.HEAPU8.set(data, ptr);
      var out = api._encrypt_data(ptr, data.length);
      var res = { exports: names.join(','), out: out };
      if (out) {
        var enc = api.HEAPU8.slice(out, out + data.length);
        res.hex = Array.from(enc).map(function(b){ return ('0'+b.toString(16)).slice(-2); }).join('');
        var p2 = api._malloc(enc.length);
        api.HEAPU8.set(enc, p2);
        var dec = api._decrypt_data(p2, enc.length);
        if (dec) res.back = new TextDecoder().decode(api.HEAPU8.slice(dec, dec + data.length));
      }
      return JSON.stringify(res);
    })()`);
    console.log('selftest: ' + (r.value || JSON.stringify(r)));
  }

  try { ws.close(); } catch (_) { }
  try { chrome.kill(); } catch (_) { }
  server.close();
  setTimeout(function () { process.exit(0); }, 300);
}

main().catch(function (e) {
  console.error('PROBE FAIL: ' + (e && e.stack || e));
  try { server.close(); } catch (_) { }
  process.exit(1);
});

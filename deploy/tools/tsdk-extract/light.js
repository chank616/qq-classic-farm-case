// Light host: runs inside the mini-app page, loads ONLY the extracted tsdk
// modules (no Cocos / no game), then provides two things to the local sink:
//   - wx.login codes          -> POST /code
//   - TSDK encrypt/decrypt    -> GET /crypto-task  / POST /crypto-result
//
// The game itself is never initialised by this script.

(function () {
  if (globalThis.__farmLightStarted) return;
  globalThis.__farmLightStarted = true;
  var SINK = 'http://127.0.0.1:17841';

  function tell(o) {
    try {
      fetch(SINK + '/evt', { method: 'POST', body: JSON.stringify(o) }).catch(function () { });
    } catch (_) { }
  }

  function post(path, obj) {
    return fetch(SINK + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(obj),
    }).then(function (r) { return r.json(); });
  }

  function b64ToBytes(b64) {
    var bin = atob(b64), n = bin.length, u = new Uint8Array(n);
    for (var i = 0; i < n; i++) u[i] = bin.charCodeAt(i);
    return u;
  }

  function bytesToB64(u) {
    var s = '';
    for (var i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
    return btoa(s);
  }

  tell({ type: 'light-boot', href: String(location.href).slice(0, 120) });

  // Prefer the game's own tsdk wrapper (already initialised in this realm).
  // Fall back to our extracted modules when it is unavailable.
  function systemTsdk() {
    try {
      var Sy = globalThis.System;
      var m = Sy && Sy.get('chunks:///_virtual/tsdk_info.mjs');
      if (m && typeof m.encryptData === 'function') return m;
    } catch (_) { }
    return null;
  }

  var sysApi = systemTsdk();
  if (sysApi) {
    tell({ type: 'light-tsdk-system', ok: true });
    start({ mode: 'system', mod: sysApi });
    return;
  }

  fetch(SINK + '/tsdk-mini.js', { cache: 'no-store' })
    .then(function (r) { if (!r.ok) throw new Error('tsdk-mini ' + r.status); return r.text(); })
    .then(function (t) {
      (0, eval)(t);
      tell({ type: 'light-tsdk-loaded', state: window.__tsdkState });
      return new Promise(function (resolve, reject) {
        var t0 = Date.now();
        var iv = setInterval(function () {
          if (window.__tsdkState === 'ready') { clearInterval(iv); resolve(); }
          else if (window.__tsdkState === 'error') { clearInterval(iv); reject(new Error(window.__tsdkError || 'tsdk error')); }
          else if (Date.now() - t0 > 60000) { clearInterval(iv); reject(new Error('tsdk timeout')); }
        }, 300);
      });
    })
    .then(function () {
      tell({ type: 'light-tsdk-ready' });
      start({ mode: 'wasm', mod: window.__tsdk || window.tsdk });
    })
    .catch(function (e) {
      tell({ type: 'light-fail', err: String(e && e.stack || e).slice(0, 300) });
    });

  function start(api) {
    if (!api) {
      tell({ type: 'light-fail', err: 'tsdk api missing' });
      return;
    }
    if (api.mode === 'wasm' && (!api.mod || typeof api.mod._encrypt_data !== 'function')) {
      tell({ type: 'light-fail', err: 'tsdk api missing' });
      return;
    }
    tell({ type: 'light-tsdk-api', ok: true, mode: api.mode });
    function heartbeat() { post('/host-ready', {}).catch(function () {}); }
    heartbeat();
    setInterval(heartbeat, 10000);

    function pbRoot() {
      var g = globalThis.System && System.get('chunks:///_virtual/mygamepb.ts');
      return g && (g.gamepb || (g.default && (g.default.gamepb || g.default)) || g);
    }
    function resolve(path) {
      var root = pbRoot();
      if (!root || !/^[a-z]+pb\.[A-Za-z0-9_]+$/.test(path)) throw new Error('invalid protobuf path');
      return path.split('.').reduce(function (a, k) { return a && a[k]; }, root);
    }
    function plain(value) {
      return JSON.parse(JSON.stringify(value, function (k, v) {
        if (v && typeof v === 'object' && typeof v.low === 'number' && typeof v.high === 'number') return v.toString();
        if (v instanceof Uint8Array) return { base64: bytesToB64(v) };
        return v;
      }));
    }
    function bridgePoll() {
      fetch(SINK + '/bridge-task', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (job) {
        if (!job.id) return;
        var result = { id: job.id };
        try {
          if (job.op === 'inspect') {
            var root = pbRoot();
            result.value = { namespaces: Object.keys(root || {}), ready: !!root };
            if (job.path) {
              var Cls = resolve(job.path);
              result.value = { exists: !!Cls, fields: Cls ? Object.keys(new Cls()) : [] };
              if (Cls) result.value.defaults = plain(new Cls());
            }
          } else {
            var C = resolve(job.path);
            if (!C) throw new Error('missing class ' + job.path);
            if (job.op === 'encode') result.b64 = bytesToB64(C.encode(job.value || {}).finish());
            else result.value = plain(C.decode(b64ToBytes(job.b64 || '')));
          }
        } catch (e) { result.error = String(e && e.message || e); }
        return post('/bridge-result', result);
      }).catch(function () {}).then(function () { setTimeout(bridgePoll, 80); });
    }
    bridgePoll();

    // ── code ──────────────────────────────────────────────────────────────
    function mint() {
      try {
        wx.login({
          success: function (r) {
            if (r && r.code) {
              post('/code', { code: r.code }).then(function () {
                tell({ type: 'light-code', len: r.code.length });
              }).catch(function () { });
            } else {
              tell({ type: 'light-code-empty' });
            }
          },
          fail: function (e) {
            tell({ type: 'light-code-fail', err: String(e && e.errMsg || e).slice(0, 120) });
          },
        });
      } catch (e) {
        tell({ type: 'light-code-exc', err: String(e && e.message || e).slice(0, 120) });
      }
    }
    mint();
    setInterval(mint, 60000);

    // ── crypto ────────────────────────────────────────────────────────────
    function runCrypto(op, b64) {
      var data = b64ToBytes(b64);
      if (api.mode === 'system') {
        var m = api.mod;
        var out = op === 'd' ? m.decryptData(data) : m.encryptData(data);
        return out && out.length ? bytesToB64(out) : '';
      }
      var mod = api.mod;
      var p = mod._malloc(data.length);
      if (!p) return '';
      mod.HEAPU8.set(data, p);
      var ptr = op === 'd' ? mod._decrypt_data(p, data.length) : mod._encrypt_data(p, data.length);
      var res = '';
      if (ptr) res = bytesToB64(mod.HEAPU8.slice(ptr, ptr + data.length));
      mod._free(p);
      return res;
    }

    function poll() {
      fetch(SINK + '/crypto-task', { cache: 'no-store' })
        .then(function (r) { return r.json(); })
        .then(function (t) {
          if (t && t.id && t.b64) {
            var out = '';
            try { out = runCrypto(t.op, t.b64); }
            catch (e) { tell({ type: 'light-crypto-fail', err: String(e && e.message || e).slice(0, 120) }); }
            post('/crypto-result', { id: t.id, b64: out }).then(function () {
              tell({ type: 'light-crypto', op: t.op, len: out.length });
            }).catch(function () { });
          }
          setTimeout(poll, 60);
        })
        .catch(function () { setTimeout(poll, 500); });
    }
    poll();
  }
})();

// Bridge inside the running farm: use only its initialized TSDK instance.
// Never instantiate a second WASM runtime or replace globalThis.tsdk.
// Provides two things to the local C# host:
//   - wx.login codes          -> POST /code
//   - TSDK encrypt/decrypt    -> GET /crypto-task  / POST /crypto-result
//
// The game itself is never initialised by this script.

(function () {
  if (globalThis.__farmLightBridgeV2) return;
  globalThis.__farmLightBridgeV2 = true;
  var SINK = 'http://127.0.0.1:17841';
  var hostId = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  var selected = false;

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

  // The module can appear before its crypto runtime is initialized.
  function systemTsdk() {
    try {
      var Sy = globalThis.System;
      var m = Sy && Sy.get('chunks:///_virtual/tsdk_info.mjs');
      if (m && typeof m.encryptData === 'function') return m;
    } catch (_) { }
    return null;
  }

  function waitForGame() {
    try {
      var api = systemTsdk();
      var root = globalThis.System && System.get('chunks:///_virtual/mygamepb.ts');
      var input = new Uint8Array([8, 2]);
      if (!api || !root || typeof api.decryptData !== 'function') throw new Error('Farm runtime is loading');
      var encrypted = api.encryptData(input);
      if (!encrypted || !encrypted.length) throw new Error('Farm crypto is loading');
      var decoded = api.decryptData(encrypted);
      if (!decoded || decoded.length !== 2 || decoded[0] !== 8 || decoded[1] !== 2) throw new Error('Farm crypto check failed');
      start(api);
    } catch (_) { setTimeout(waitForGame, 1000); }
  }
  waitForGame();

  function start(api) {
    tell({ type: 'light-tsdk-api', ok: true, mode: 'system-verified' });
    function heartbeat() {
      post('/host-ready', { hostId: hostId, version: 2, cryptoReady: true }).then(function (r) {
        var newlySelected = !selected && r.active;
        selected = !!r.active;
        if (newlySelected || selected && r.needsCode) mint();
      }).catch(function () { selected = false; });
    }
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
      if (!selected) { setTimeout(bridgePoll, 1000); return; }
      fetch(SINK + '/bridge-task?hostId=' + encodeURIComponent(hostId), { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (job) {
        if (!job.id) return;
        var result = { id: job.id, hostId: hostId };
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
      if (!selected) return;
      try {
        wx.login({
          success: function (r) {
            if (r && r.code) {
              post('/code', { code: r.code, hostId: hostId }).then(function () {
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
    setInterval(mint, 60000);

    // ── crypto ────────────────────────────────────────────────────────────
    function runCrypto(op, b64) {
      var data = b64ToBytes(b64);
      var out = op === 'd' ? api.decryptData(data) : api.encryptData(data);
      if (data.length && (!out || !out.length)) throw new Error('QQ farm crypto is not ready');
      return bytesToB64(out);
    }

    function poll() {
      if (!selected) { setTimeout(poll, 1000); return; }
      fetch(SINK + '/crypto-task?hostId=' + encodeURIComponent(hostId), { cache: 'no-store' })
        .then(function (r) { return r.json(); })
        .then(function (t) {
          if (t && t.id && t.b64) {
            var result = { id: t.id, hostId: hostId };
            try { result.b64 = runCrypto(t.op, t.b64); }
            catch (e) { result.error = 'QQ farm crypto is not ready'; selected = false; }
            post('/crypto-result', result).then(function () {
              tell({ type: 'light-crypto', op: t.op, len: (result.b64 || '').length });
            }).catch(function () { });
          }
          setTimeout(poll, 60);
        })
        .catch(function () { setTimeout(poll, 500); });
    }
    poll();
  }
})();

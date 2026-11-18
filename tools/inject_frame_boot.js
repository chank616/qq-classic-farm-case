'use strict';

// Injects (or reverts) the runtime-client boot snippet in the QQEX frame
// template AND in every cached per-version out_page-frame.html, because the
// runtime may load the per-version output directly.
//
// Usage:
//   node tools/inject_frame_boot.js            # inject / refresh
//   node tools/inject_frame_boot.js --revert   # remove from template and outputs

const fs = require('fs');
const os = require('os');
const path = require('path');

// The QQEX mini-app cache lives under the current user's roaming profile. The
// runtime version directory changes on every QQ update, so discover it instead
// of pinning a version (this is what makes the tool portable across machines).
const QQEX_TEMPS = path.join(
  process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
  'QQEX', 'miniapp', 'temps'
);

function findFrameTemplate() {
  const root = path.join(QQEX_TEMPS, 'miniapp_jslib');
  let dirs;
  try { dirs = fs.readdirSync(root, { withFileTypes: true }); } catch (_) { return null; }
  const candidates = dirs
    .filter(function (d) { return d.isDirectory(); })
    .map(function (d) { return path.join(root, d.name, 'QPageFrame.html'); })
    .filter(function (p) { return fs.existsSync(p); });
  candidates.sort(function (a, b) { return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs; });
  return candidates[0] || null;
}

const FRAME = findFrameTemplate();
const BACKUP = FRAME ? FRAME + '.bootbak' : null;
const SRC_DIR = path.join(QQEX_TEMPS, 'miniapp_src');
const MARKER = '/*_FARM_BOOT_*/';

const SNIPPET = `<script>
${MARKER}
(function(){
  function tell(o){
    try { fetch('http://127.0.0.1:17841/evt', { method:'POST', body: JSON.stringify(o) }).catch(function(){}); } catch(_){}
  }
  tell({ type:'boot-script', href: String(location.href).slice(0,120) });
  if (typeof location === 'undefined' || String(location.href).indexOf('1112386029') === -1) return;

  // Capture the real client's socket traffic so the crypto can be verified
  // against ground truth instead of guessed parameters.
  try {
    if (typeof wx !== 'undefined' && wx && !wx.__farmConnectWrapped) {
      wx.__farmConnectWrapped = true;
      var origConnect = wx.connectSocket;
      wx.connectSocket = function(o){
        var task = origConnect.apply(wx, arguments);
        var url = String((o && o.url) || '');
        var isOurs = url.indexOf('127.0.0.1') !== -1;
        function b64(u8, max){
          var n = Math.min(u8.length, max || 512);
          var s = '';
          for (var i = 0; i < n; i++) s += String.fromCharCode(u8[i]);
          return btoa(s);
        }
        try {
          var origSend = task.send;
          task.send = function(p){
            try {
              var d = p && p.data;
              if (d && d.byteLength !== undefined) {
                if (!globalThis.__farmCaptures) globalThis.__farmCaptures = [];
                if (globalThis.__farmCaptures.length > 500) globalThis.__farmCaptures.shift();
                globalThis.__farmCaptures.push({ dir:'send', ours:isOurs, len:d.byteLength, url:String(url).split('?')[0].slice(0,110), b64:b64(new Uint8Array(d), 4096) });
                tell({ type:'capture-send', ours:isOurs, len:d.byteLength, b64:b64(new Uint8Array(d)) });
              }
            } catch(_){}
            return origSend.apply(task, arguments);
          };
        } catch(_){}
        try {
          var origOnMessage = task.onMessage;
          task.onMessage = function(cb){
            return origOnMessage.call(task, function(m){
              try {
                var d = m && m.data;
                if (d && d.byteLength !== undefined) {
                  if (!globalThis.__farmCaptures) globalThis.__farmCaptures = [];
                  if (globalThis.__farmCaptures.length > 500) globalThis.__farmCaptures.shift();
                  globalThis.__farmCaptures.push({ dir:'recv', ours:isOurs, len:d.byteLength, url:String(url).split('?')[0].slice(0,110), b64:b64(new Uint8Array(d), 4096) });
                  tell({ type:'capture-recv', ours:isOurs, len:d.byteLength, b64:b64(new Uint8Array(d)) });
                }
              } catch(_){}
              return cb && cb(m);
            });
          };
        } catch(_){}
        return task;
      };
      tell({ type:'connect-wrapped' });
    }
  } catch(e){ tell({ type:'wrap-fail', err:String(e && e.message || e).slice(0,150) }); }

  // Capture the first host key the running client obtains, so our own key can
  // be compared against it in-page (key values never leave the page).
  try {
    if (typeof wx !== 'undefined' && wx && !wx.__farmKeyWrapped) {
      wx.__farmKeyWrapped = true;
      var origGUC = wx.getUserCryptoManager;
      wx.getUserCryptoManager = function(){
        var mgr = origGUC.apply(wx, arguments);
        try {
          var origGLUK = mgr.getLatestUserKey;
          mgr.getLatestUserKey = function(o){
            var opts = o || {};
            var userSuccess = opts.success;
            opts.success = function(r){
              try {
                if (!globalThis.__farmHostKeyFirst) {
                  globalThis.__farmHostKeyFirst = r;
                  tell({ type:'host-key-first', keys:Object.keys(r||{}),
                         keyLen: typeof r.encryptKey === 'string' ? r.encryptKey.length : null,
                         ivLen: typeof r.iv === 'string' ? r.iv.length : null,
                         version: r.version });
                }
              } catch(_){}
              if (userSuccess) return userSuccess(r);
            };
            return origGLUK.call(mgr, opts);
          };
        } catch(_){}
        return mgr;
      };
      tell({ type:'key-api-wrapped' });
    }
  } catch(e){ tell({ type:'key-wrap-fail', err:String(e && e.message || e).slice(0,150) }); }

  // Capture HTTP traffic too (anti-cheat / TSDK heartbeats use wx.request).
  try {
    if (typeof wx !== 'undefined' && wx && wx.request && !wx.__farmReqWrapped) {
      wx.__farmReqWrapped = true;
      var origReq = wx.request;
      wx.request = function(o){
        try {
          if (!globalThis.__farmHttpCaptures) globalThis.__farmHttpCaptures = [];
          if (globalThis.__farmHttpCaptures.length > 200) globalThis.__farmHttpCaptures.shift();
          globalThis.__farmHttpCaptures.push({
            url: String((o && o.url) || '').split('?')[0].slice(0, 140),
            method: (o && o.method) || 'GET',
            dataLen: o && o.data ? (typeof o.data === 'string' ? o.data.length : (o.data.byteLength || 0)) : 0,
          });
          tell({ type:'capture-http', url: String((o && o.url) || '').split('?')[0].slice(0, 140), method: (o && o.method) || 'GET' });
        } catch(_){}
        return origReq.apply(wx, arguments);
      };
      tell({ type:'request-wrapped' });
    }
  } catch(e){ tell({ type:'request-wrap-fail', err:String(e && e.message || e).slice(0,150) }); }

  // Observe WebCrypto usage: if the client encrypts through crypto.subtle we
  // learn the exact algorithm, IV length and AAD length without touching keys.
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle && !crypto.subtle.__farmWrapped) {
      crypto.subtle.__farmWrapped = true;
      var origEnc = crypto.subtle.encrypt;
      var origDec = crypto.subtle.decrypt;
      function logCall(kind, alg){
        try {
          if (!globalThis.__farmCryptoCalls) globalThis.__farmCryptoCalls = [];
          if (globalThis.__farmCryptoCalls.length < 40) {
            globalThis.__farmCryptoCalls.push({
              kind: kind,
              name: alg && alg.name,
              ivLen: alg && alg.iv ? alg.iv.byteLength : null,
              aadLen: alg && alg.additionalData ? alg.additionalData.byteLength : null,
            });
          }
        } catch(_){}
      }
      crypto.subtle.encrypt = function(alg){ logCall('enc', alg); return origEnc.apply(crypto.subtle, arguments); };
      crypto.subtle.decrypt = function(alg){ logCall('dec', alg); return origDec.apply(crypto.subtle, arguments); };
      tell({ type:'subtle-wrapped' });
    }
  } catch(e){ tell({ type:'subtle-wrap-fail', err:String(e && e.message || e).slice(0,150) }); }

  setTimeout(function(){
    fetch('http://127.0.0.1:17841/boot.js', { cache: 'no-store' })
      .then(function(r){ if(!r.ok) throw new Error('boot http '+r.status); return r.text(); })
      .then(function(t){
        (0, eval)(t);
        if (!globalThis.__farmClientBundle) throw new Error('bundle missing');
        tell({ type:'boot-loaded' });
        return fetch('http://127.0.0.1:17841/cmd', { cache: 'no-store' })
          .then(function(r){ return r.json(); })
          .catch(function(){ return {}; })
          .then(function(c){
            if (c && c.lightHost) {
              tell({ type:'light-mode' });
              return fetch('http://127.0.0.1:17841/light.js', { cache:'no-store' })
                .then(function(r){ if(!r.ok) throw new Error('light http '+r.status); return r.text(); })
                .then(function(t){ (0, eval)(t); });
            }
            return globalThis.__farmClientBundle.runFarmClient({
              channel: 'frame', onePass: !!(c && c.onePass),
            });
          });
      })
      .catch(function(e){ tell({ type:'boot-fail', err: String(e && e.message || e).slice(0, 220) }); });
  }, 1200);
})();
</script>`;

const BLOCK_RE = /<script>\s*\/\*_FARM_BOOT_\*\/[\s\S]*?<\/script>/;

function applyTo(file) {
  const html = fs.readFileSync(file, 'utf8');
  let out;
  if (BLOCK_RE.test(html)) {
    out = html.replace(BLOCK_RE, SNIPPET);
  } else if (html.includes('</body>')) {
    out = html.replace('</body>', SNIPPET + '\n</body>');
  } else {
    return 'skip(no body)';
  }
  if (out === html) return 'unchanged';
  fs.writeFileSync(file, out);
  return 'patched ' + html.length + '->' + out.length;
}

function removeFrom(file) {
  const html = fs.readFileSync(file, 'utf8');
  if (!BLOCK_RE.test(html)) return 'clean';
  fs.writeFileSync(file, html.replace(BLOCK_RE, ''));
  return 'removed';
}

function outputFrames() {
  if (!fs.existsSync(SRC_DIR)) return [];
  return fs.readdirSync(SRC_DIR)
    .filter(d => d.startsWith('1112386029_3_'))
    .map(d => path.join(SRC_DIR, d, 'out_page-frame.html'))
    .filter(f => fs.existsSync(f));
}

function inject() {
  if (!FRAME) {
    console.error('frame template not found under ' + QQEX_TEMPS + '\\miniapp_jslib');
    console.error('open the farm mini-app once in QQ, then re-run this tool');
    process.exitCode = 2;
    return;
  }
  if (!fs.existsSync(BACKUP)) {
    fs.copyFileSync(FRAME, BACKUP);
    console.log('backup -> ' + BACKUP);
  }
  console.log('template: ' + applyTo(FRAME));
  for (const f of outputFrames()) {
    console.log(path.basename(path.dirname(f)) + ': ' + applyTo(f));
  }
}

function revert() {
  if (!FRAME) {
    console.error('frame template not found under ' + QQEX_TEMPS + '\\miniapp_jslib');
    process.exitCode = 2;
    return;
  }
  if (fs.existsSync(BACKUP)) {
    fs.copyFileSync(BACKUP, FRAME);
    console.log('template restored from backup');
  }
  for (const f of outputFrames()) {
    console.log(path.basename(path.dirname(f)) + ': ' + removeFrom(f));
  }
}

if (process.argv[2] === '--revert') revert();
else inject();

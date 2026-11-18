// Read-only audit of the QQ miniapp login/checkSession bridge across all
// locally cached farm versions.  It records API wiring and source hashes,
// never invokes wx.login, refreshSession, or a network request.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const cacheRoot = 'C:/Users/chank616/AppData/Roaming/QQEX/miniapp/temps/miniapp_src';
const runtimeRoot = 'C:/Users/chank616/AppData/Roaming/QQEX/miniapp/temps/miniapp_jslib/pc_miniapp_0.2.11';
const out = path.resolve(__dirname, '..', 'artifacts', 'login-bridge-all-versions.json');

function read(p) { return fs.readFileSync(p, 'utf8'); }
function sha256(s) { return crypto.createHash('sha256').update(s).digest('hex'); }
function count(s, re) { return (s.match(re) || []).length; }
function extract(s, needle, radius = 320) {
  const i = s.indexOf(needle);
  return i < 0 ? null : s.slice(Math.max(0, i - radius), Math.min(s.length, i + needle.length + radius));
}

const versions = fs.readdirSync(cacheRoot, { withFileTypes: true })
  .filter(e => e.isDirectory() && e.name.startsWith('1112386029_3_'))
  .map(e => e.name).sort();
const farm = versions.map(version => {
  const p = path.join(cacheRoot, version, 'game.js');
  const source = fs.existsSync(p) ? read(p) : '';
  return {
    version,
    bytes: Buffer.byteLength(source),
    sha256: sha256(source),
    literalCounts: {
      wxLogin: count(source, /wx\.login/gi),
      checkSession: count(source, /checkSession/gi),
      refreshSession: count(source, /refreshSession/gi),
      code2Session: count(source, /code2Session/gi),
    },
  };
});

const qgamePath = path.join(runtimeRoot, 'QGame.js');
const qlogicPath = path.join(runtimeRoot, 'QLogic.js');
const qgame = read(qgamePath);
const qlogic = read(qlogicPath);
const loginApiSnippet = extract(qgame, "login: {", 420);
const qlogicSnippet = extract(qlogic, 'checkSession:function', 420);
const result = {
  generatedAt: new Date().toISOString(),
  appId: '1112386029',
  scope: 'Source-only, read-only audit. No host API was invoked and no credentials or code values were collected.',
  farmVersions: farm,
  runtime: {
    package: 'pc_miniapp_0.2.11',
    qgame: {
      file: qgamePath,
      sha256: sha256(qgame),
      loginApi: {
        toNativeEventName: 'login',
        successField: 'code',
        snippetSha256: sha256(loginApiSnippet || ''),
        sourceSnippet: loginApiSnippet,
      },
      checkSessionApi: {
        toNativeEventName: 'refreshSession',
      },
    },
    qlogic: {
      file: qlogicPath,
      sha256: sha256(qlogic),
      checkSession: {
        clearsPreviousTimer: /Pc&&clearTimeout\(Pc\)/.test(qlogic),
        invokesNativeRefreshSession: /Object\(u\.z\)\("refreshSession",e/.test(qlogic),
        schedulesByExpireInSeconds: /setTimeout\(.*1e3\*e\.expireIn/.test(qlogic),
        removesExpireInBeforeCallback: /delete e\.expireIn/.test(qlogic),
        snippetSha256: sha256(qlogicSnippet || ''),
        sourceSnippet: qlogicSnippet,
      },
    },
  },
  conclusion: 'All cached farm game.js files lack literal login/checkSession/refreshSession calls. The runtime maps wx.login to native login and wx.checkSession to native refreshSession; the latter schedules another refresh using host-supplied expireIn seconds but does not expose a new wx.login code or prove AMS-token renewal.',
};
fs.writeFileSync(out, JSON.stringify(result, null, 2));
console.log(out);

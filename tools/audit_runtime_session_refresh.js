const fs = require('fs');
const path = require('path');

const appData = process.env.APPDATA || 'C:/Users/chank616/AppData/Roaming';
const runtimeRoot = path.join(appData, 'QQEX', 'miniapp', 'temps', 'miniapp_jslib', 'pc_miniapp_0.2.11');
const sourceRoot = path.join(appData, 'QQEX', 'miniapp', 'temps', 'miniapp_src', '1112386029_3_3443f89042dffbf93d20ced1d652d031');
const qlogicPath = path.join(runtimeRoot, 'QLogic.js');
const gamePath = path.join(sourceRoot, 'game.js');
const methodsPath = path.resolve('artifacts/platform-login-methods.txt');

const qlogic = fs.readFileSync(qlogicPath, 'utf8');
const game = fs.readFileSync(gamePath, 'utf8');
const methods = fs.readFileSync(methodsPath, 'utf8');
const marker = 'checkSession:function(e){Pc&&clearTimeout(Pc)';
const start = qlogic.indexOf(marker);
const end = start < 0 ? -1 : qlogic.indexOf('},authorize:', start);
const implementation = start < 0 || end < 0 ? '' : qlogic.slice(start, end);

const result = {
  runtime: 'pc_miniapp_0.2.11',
  qlogicCheckSessionOffset: start,
  qlogicRefreshSessionLoop: {
    found: start >= 0 && end >= 0,
    clearsPreviousTimer: implementation.includes('clearTimeout(Pc)'),
    callsNativeRefreshSession: implementation.includes('"refreshSession"'),
    schedulesNextCall: implementation.includes('Pc=setTimeout('),
    intervalUsesNativeExpireInSeconds: implementation.includes('1e3*e.expireIn'),
    removesInternalFieldsBeforeCallback: implementation.includes('delete e.err_code,delete e.expireIn'),
  },
  farmSourceChecks: {
    plainCheckSessionLiteralInGameJs: game.includes('checkSession'),
    checkSessionInExtractedWxPlatformUtilMethods: methods.includes('checkSession'),
    wxLoginLiteralInGameJs: game.includes('wx.login'),
  },
  interpretation: 'The QQ worker can schedule native session refreshes after wx.checkSession succeeds. Static absence checks do not prove the target app never invokes the API; this bridge does not establish a refreshed wx.login code or an AMS-token refresh.',
};

console.log(JSON.stringify(result, null, 2));

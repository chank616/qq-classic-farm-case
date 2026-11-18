const fs = require('fs');
const path = require('path');

const input = process.argv[2] || path.resolve('artifacts/ams-login-ida.json');
const output = process.argv[3] || path.resolve('artifacts/native-session-cache-summary.json');
const ida = JSON.parse(fs.readFileSync(input, 'utf8'));
const references = ida.matchingStrings.flatMap(row => row.references || []);
const getFunction = name => references.find(row => row.functionName === name && row.decompilation)?.decompilation || '';
const gameSessionSource = getFunction('sub_18001BA80');
const constructorSource = getFunction('sub_180064A70');
if (!gameSessionSource || !constructorSource) throw new Error('Expected IDA decompilation functions not found');

function excerpt(source, marker, radius = 260) {
  const index = source.indexOf(marker);
  return index < 0 ? null : source.slice(Math.max(0, index - radius), Math.min(source.length, index + marker.length + radius));
}

const events = [
  'InitWmpfSdk', 'GetLoginCodeStart', 'GetLoginCodeResult', 'GetLoginParams',
  'OnBeginLogin', 'OnLoginCancel', 'OnStartWeApp', 'InitResult', 'LoginResult',
  'OnLaunchApplet', 'OnChildWndCreate', 'OnChildWndClose', 'OnAppletClosed',
].filter(name => constructorSource.includes(`"${name}"`));
const cacheValiditySeconds = 604800;
const requestThrottleSeconds = 0x4b0;
const report = {
  source: ida.input,
  module: 'libamssdk.dll',
  evidenceFunctions: [
    { name: 'GSCacheManager::GetGameSession', address: '0x18001BA80', contains: 'sub_18001BA80' },
    { name: 'WmpfEventProcessor event-table initialization', address: '0x180064A70', contains: 'sub_180064A70' },
  ],
  nativeSessionCache: {
    validForSeconds: cacheValiditySeconds,
    validForDays: cacheValiditySeconds / 86400,
    validityConditionExcerpt: excerpt(gameSessionSource, '+ 604800LL'),
    fetchThrottleSeconds: requestThrottleSeconds,
    fetchThrottleMinutes: requestThrottleSeconds / 60,
    throttleConditionExcerpt: excerpt(gameSessionSource, '< 0x4B0'),
    lastRequestTimestampUpdateExcerpt: excerpt(gameSessionSource, '*(_QWORD *)(a1 + 8) = Xtime_get_ticks() / 10000000'),
  },
  wmpfEventNames: events,
  interpretation: 'These values belong to the AMS SDK native GSCacheManager game-session cache and request throttle. They do not establish the QQ miniapp wx.login code TTL, the farm AMS token TTL, or the observed three-hour lifetime. The WMPF GetLoginCode events are not proven equivalent to the QQ runtime native login bridge.',
  boundary: 'Summarized from IDA decompiler output for a local signed QQ SDK DLL. No login API was invoked and no account credentials were extracted.',
};
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ output, validForSeconds: cacheValiditySeconds, throttleSeconds: requestThrottleSeconds, wmpfEvents: events.length }, null, 2));

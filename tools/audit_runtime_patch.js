const fs = require('fs');
const crypto = require('crypto');

const args = process.argv.slice(2);
const currentPath = args.find(value => !value.startsWith('--out='));
const baselinePaths = args.filter(value => value !== currentPath && !value.startsWith('--out='));
if (!currentPath || !baselinePaths.length) {
  throw new Error('Usage: node tools/audit_runtime_patch.js <current-QGame.js> <baseline-file> [...]');
}

const patterns = {
  loginLiteral: /login/gi,
  loginCodePhrase: /login.{0,32}code|code.{0,32}login/gi,
  checkSession: /checkSession/gi,
  refreshSession: /refreshSession/gi,
  localLoopbackPort: /127\.0\.0\.1:17841|17841/gi,
  injectionMarker: /_M0_CODESVC_|_M0_/gi,
  farmBridgeMarker: /_FARM_BRIDGE_V1_/gi,
  wsFrameHook: /_WSFRAME_HOOK_V2_/gi,
  bridgeFiles: /bridge-(?:cmd|out|rx)\.jsonl/gi,
  wxLogin: /wx\.login/gi,
};

function summarize(file) {
  const data = fs.readFileSync(file);
  const text = data.toString('utf8');
  const markers = Object.fromEntries(Object.entries(patterns).map(([name, pattern]) => [name, [...text.matchAll(pattern)].length]));
  return { file, bytes: data.length, sha256: crypto.createHash('sha256').update(data).digest('hex'), text, markers };
}

const current = summarize(currentPath);
const comparisons = baselinePaths.map(path => {
  const baseline = summarize(path);
  let prefix = 0;
  while (prefix < current.text.length && prefix < baseline.text.length && current.text[prefix] === baseline.text[prefix]) prefix++;
  let suffix = 0;
  while (suffix < current.text.length - prefix && suffix < baseline.text.length - prefix && current.text.at(-1 - suffix) === baseline.text.at(-1 - suffix)) suffix++;
  const currentChanged = current.text.slice(prefix, current.text.length - suffix);
  const baselineChanged = baseline.text.slice(prefix, baseline.text.length - suffix);
  const changedCounts = text => Object.fromEntries(Object.entries(patterns).map(([name, pattern]) => [name, [...text.matchAll(pattern)].length]));
  return {
    baseline: { file: baseline.file, bytes: baseline.bytes, sha256: baseline.sha256, markers: baseline.markers },
    commonPrefixChars: prefix,
    commonSuffixChars: suffix,
    currentChangedChars: currentChanged.length,
    baselineChangedChars: baselineChanged.length,
    currentChangedMarkers: changedCounts(currentChanged),
    baselineChangedMarkers: changedCounts(baselineChanged),
  };
});

const report = { current: { file: current.file, bytes: current.bytes, sha256: current.sha256, markers: current.markers }, comparisons };
const output = process.argv.find(value => value.startsWith('--out='));
if (output) fs.writeFileSync(output.slice('--out='.length), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));

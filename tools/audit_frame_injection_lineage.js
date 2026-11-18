const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const runtime = process.argv[2] || 'C:/Users/chank616/AppData/Roaming/QQEX/miniapp/temps/miniapp_jslib/pc_miniapp_0.2.11';
const cacheRoot = process.argv[3] || 'C:/Users/chank616/AppData/Roaming/QQEX/miniapp/temps/miniapp_src';
const output = process.argv[4] || path.resolve('artifacts/frame-injection-lineage.json');
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const read = file => fs.readFileSync(file, 'utf8');
const extract = html => html.match(/<script>\s*(\/\*_M0_CODESVC_\*\/[\s\S]*?)<\/script>/)?.[1] || null;

const templatePath = path.join(runtime, 'QPageFrame.html');
const backupPath = path.join(runtime, 'QPageFrame.html.m0bak');
const template = read(templatePath);
const backup = read(backupPath);
const templateScript = extract(template);
const backupScript = extract(backup);
const intervalMs = templateScript?.match(/\},\s*(\d+)\s*\);/)?.[1];
const maxTicks = templateScript?.match(/n\s*>\s*(\d+)/)?.[1];
const appDirs = fs.readdirSync(cacheRoot, { withFileTypes: true })
  .filter(entry => entry.isDirectory() && entry.name.startsWith('1112386029_3_'));
const frames = [];
for (const entry of appDirs) {
  const framePath = path.join(cacheRoot, entry.name, 'out_page-frame.html');
  if (!fs.existsSync(framePath)) continue;
  const html = read(framePath);
  const script = extract(html);
  const apiIgnoreAt = html.indexOf('apiIgnore.js');
  const markerAt = html.indexOf('_M0_CODESVC_');
  frames.push({
    version: entry.name,
    path: framePath,
    bytes: Buffer.byteLength(html),
    htmlSha256: sha256(html),
    hasMarker: Boolean(script),
    inlineScriptSha256: script ? sha256(script) : null,
    inlineScriptMatchesTemplate: Boolean(script && templateScript && script === templateScript),
    followsApiIgnoreScript: apiIgnoreAt >= 0 && markerAt > apiIgnoreAt,
  });
}

const report = {
  runtimeTemplate: {
    path: templatePath,
    bytes: Buffer.byteLength(template),
    sha256: sha256(template),
    hasInjectionMarker: template.includes('_M0_CODESVC_'),
    injectedInlineScriptSha256: templateScript ? sha256(templateScript) : null,
    timerIntervalMs: intervalMs ? Number(intervalMs) : null,
    maxLoginAttempts: maxTicks ? Number(maxTicks) : null,
    nominalAttemptWindowMs: intervalMs && maxTicks ? Number(intervalMs) * Number(maxTicks) : null,
  },
  preInjectionBackup: {
    path: backupPath,
    bytes: Buffer.byteLength(backup),
    sha256: sha256(backup),
    hasInjectionMarker: backup.includes('_M0_CODESVC_'),
    hasInlineScripts: (backup.match(/<script\b/gi) || []).length > 0,
  },
  cachedOutputFrames: frames,
  interpretation: 'The current QQEX QPageFrame.html has an inline code-forwarding script that is absent from its .m0bak template. Cached per-app out_page-frame.html files contain the same script after the QQ apiIgnore.js tag. This supports a local QQEX frame-template injection boundary rather than official farm game source; it does not identify the injector or prove the script executed or delivered a code.',
  boundary: 'Hashes, file lengths, template markers, and frame placement only. No code values are read or retained, and no script is executed.',
};
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ output, templateHasInjection: report.runtimeTemplate.hasInjectionMarker, backupHasInjection: report.preInjectionBackup.hasInjectionMarker, frames: frames.length, matchingFrames: frames.filter(frame => frame.inlineScriptMatchesTemplate).length }, null, 2));

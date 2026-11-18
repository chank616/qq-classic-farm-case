const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const packageDir = process.argv[2] || 'C:/Users/chank616/AppData/Roaming/QQ/qqex/dynamic_package/exMiniProgram/3.3.15/3.3.15';
const extractionRoot = process.argv[3] || path.resolve('artifacts/appnormal-audit');
const output = process.argv[4] || path.resolve('artifacts/appnormal-m0-patch-audit.json');
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const hashFile = file => sha256(fs.readFileSync(file));

function filesUnder(root, current = root, result = {}) {
  for (const item of fs.readdirSync(current, { withFileTypes: true })) {
    const fullPath = path.join(current, item.name);
    if (item.isDirectory()) filesUnder(root, fullPath, result);
    else result[path.relative(root, fullPath).replace(/\\/g, '/')] = hashFile(fullPath);
  }
  return result;
}
function archiveInfo(name) {
  const file = path.join(packageDir, name);
  return { path: file, bytes: fs.statSync(file).size, sha256: hashFile(file) };
}

const roots = Object.fromEntries(['current', 'backup', 'new'].map(name => [name, path.join(extractionRoot, `${name}-extracted`)]));
const maps = Object.fromEntries(Object.entries(roots).map(([name, root]) => [name, filesUnder(root)]));
const indexPath = name => path.join(roots[name], 'app', 'index.js');
const index = Object.fromEntries(['current', 'backup', 'new'].map(name => [name, fs.readFileSync(indexPath(name), 'utf8')]));
const baseline = index.backup;
const patched = index.new;
let commonPrefix = 0;
while (commonPrefix < baseline.length && commonPrefix < patched.length && baseline[commonPrefix] === patched[commonPrefix]) commonPrefix++;
let commonSuffix = 0;
while (commonSuffix < baseline.length - commonPrefix && commonSuffix < patched.length - commonPrefix && baseline.at(-1 - commonSuffix) === patched.at(-1 - commonSuffix)) commonSuffix++;
const insertion = patched.slice(commonPrefix, patched.length - commonSuffix);
const changedFiles = Object.keys(maps.new).filter(file => maps.backup[file] !== maps.new[file]);
const codeListener = /ipcMain\.on\(["']m0-code["']/;
const frameListener = /ipcMain\.on\(["']m0-frames["']/;

const report = {
  archives: {
    current: archiveInfo('appNormal.asar'),
    backup: archiveInfo('appNormal.asar.m0bak'),
    stagedVariant: archiveInfo('appNormal.asar.m0new'),
    currentMatchesBackup: archiveInfo('appNormal.asar').sha256 === archiveInfo('appNormal.asar.m0bak').sha256,
  },
  extractedComparison: {
    changedFilesBackupToStagedVariant: changedFiles,
    apiIgnoreSha256: Object.fromEntries(['current', 'backup', 'new'].map(name => [name, maps[name]['app/miniapp/apiIgnore.js']])),
    apiIgnoreUnchanged: new Set(['current', 'backup', 'new'].map(name => maps[name]['app/miniapp/apiIgnore.js'])).size === 1,
    appIndexBytes: Object.fromEntries(['current', 'backup', 'new'].map(name => [name, Buffer.byteLength(index[name])])),
    appIndexSha256: Object.fromEntries(['current', 'backup', 'new'].map(name => [name, sha256(index[name])])),
    stagedInsertionBytes: Buffer.byteLength(insertion),
    stagedInsertionSha256: sha256(insertion),
    stagedInsertionMarkers: {
      m0CdpSwitches: insertion.includes('_m0_cdp_switches_'),
      m0CodeIpcListener: codeListener.test(insertion),
      m0FramesIpcListener: frameListener.test(insertion),
      writesM0CodeLog: insertion.includes('m0_code.log'),
      writesM0FramesNdjson: insertion.includes('m0_frames.ndjson'),
      writesM0TraceLog: insertion.includes('m0_trace.log'),
    },
  },
  interpretation: 'The current appNormal.asar is byte-identical to appNormal.asar.m0bak. The staged .m0new differs from the backup only in app/index.js, where a 701-byte M0-marked prefix registers Electron IPC listeners that append received m0-code and m0-frames messages to TEMP logs. app/miniapp/apiIgnore.js is identical in all three archives. This proves a separate local M0 instrumentation variant exists; it does not prove that the listener is active in the current archive, identify who created it, or link its IPC messages to the wx.login frame script.',
  boundary: 'Hashes and added-code markers only. No Electron code was executed, no IPC was sent, and no log containing a login code was opened or copied.',
};
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ output, currentMatchesBackup: report.archives.currentMatchesBackup, changedFiles, stagedInsertionBytes: report.extractedComparison.stagedInsertionBytes, apiIgnoreUnchanged: report.extractedComparison.apiIgnoreUnchanged }, null, 2));

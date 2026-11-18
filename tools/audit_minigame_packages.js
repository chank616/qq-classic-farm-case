const fs = require('fs');
const path = require('path');

const root = process.argv[2] || path.join(process.env.APPDATA || '', 'QQEX', 'miniapp', 'temps', 'miniapp_pkgs');

function parsePackage(file) {
  const bytes = fs.readFileSync(file);
  if (bytes.length < 0x16 || bytes.readUInt32BE(0) !== 0xbe000000) {
    throw new Error(`unsupported TQAPKG header: ${path.basename(file)}`);
  }

  const count = bytes.readUInt16BE(0x10);
  let cursor = 0x14;
  const entries = [];

  for (let i = 0; i < count; i++) {
    if (cursor + 2 > bytes.length) throw new Error(`truncated path length: ${path.basename(file)}`);
    const nameLength = bytes.readUInt16BE(cursor);
    cursor += 2;
    if (cursor + nameLength + 2 + 2 + 4 + 2 > bytes.length) {
      throw new Error(`truncated entry table: ${path.basename(file)}`);
    }

    const name = bytes.subarray(cursor, cursor + nameLength).toString('utf8');
    cursor += nameLength + 2; // path and reserved field
    const offset = bytes.readUInt16BE(cursor);
    cursor += 2;
    const size = bytes.readUInt32BE(cursor);
    cursor += 4;
    cursor += 2; // entry separator

    if (offset + size > bytes.length) throw new Error(`entry outside package: ${path.basename(file)}:${name}`);
    entries.push({ name, offset, size });
  }

  return { file: path.basename(file), bytes: bytes.length, entries };
}

const files = fs.readdirSync(root)
  .filter(name => name.toLowerCase().endsWith('.tqapkg'))
  .sort()
  .map(name => parsePackage(path.join(root, name)));

const packageTypes = {};
const entryPaths = {};
let mcbootArchiveCount = 0;
let mcbootEntryCount = 0;
let entryCount = 0;

for (const archive of files) {
  const packageType = archive.file.split('___')[1]?.replace(/\.tqapkg$/i, '') || '<unknown>';
  packageTypes[packageType] = (packageTypes[packageType] || 0) + 1;
  if (/mcboot/i.test(archive.file)) mcbootArchiveCount++;
  entryCount += archive.entries.length;

  for (const entry of archive.entries) {
    entryPaths[entry.name] = (entryPaths[entry.name] || 0) + 1;
    if (/mcboot/i.test(entry.name)) mcbootEntryCount++;
  }
}

console.log(JSON.stringify({
  root,
  archiveCount: files.length,
  versionIdCount: new Set(files.map(file => file.file.split('___')[0])).size,
  totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
  entryCount,
  packageTypes,
  entryPaths,
  mcbootArchiveCount,
  mcbootEntryCount,
  errors: [],
}, null, 2));

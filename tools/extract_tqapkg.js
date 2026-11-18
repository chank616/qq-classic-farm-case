const fs = require('fs');
const path = require('path');

function extract(input, outDir) {
  const b = fs.readFileSync(input);
  if (b.length < 0x16 || b.readUInt32BE(0) !== 0xbe000000) throw new Error(`unsupported package: ${input}`);
  const count = b.readUInt16BE(0x10);
  let p = 0x14;
  const entries = [];
  for (let i = 0; i < count; i++) {
    if (p + 2 > b.length) throw new Error('truncated path length');
    const nameLen = b.readUInt16BE(p); p += 2;
    const name = b.subarray(p, p + nameLen).toString('utf8'); p += nameLen;
    p += 2; // two-byte terminator/reserved field
    const offset = b.readUInt16BE(p); p += 2;
    const size = b.readUInt32BE(p); p += 4;
    if (offset + size > b.length) throw new Error(`entry out of range: ${name}`);
    entries.push({ name, offset, size });
    p += 2; // entry separator before the next path length
  }
  for (const e of entries) {
    const target = path.join(outDir, e.name.replace(/^\/+/, '').replaceAll('/', path.sep));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, b.subarray(e.offset, e.offset + e.size));
  }
  return { input, count, entries };
}

const input = process.argv[2];
const outDir = process.argv[3] || path.resolve('artifacts/tqapkg');
if (!input) throw new Error('usage: node extract_tqapkg.js <package> [outDir]');
const result = extract(input, outDir);
console.log(JSON.stringify({ input: result.input, count: result.count, entries: result.entries }, null, 2));

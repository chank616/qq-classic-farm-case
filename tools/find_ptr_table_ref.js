'use strict';

// Two-level reference finder for PE x64 binaries.
//
//   node tools/find_ptr_table_ref.js <pe> <needle>
//
// Why: some strings (for example djinni method names) are never referenced by a
// direct RIP-relative LEA. Instead the binary keeps a pointer table
// ({const char*, size_t} pairs) in .rdata and loads the entry. A one-level scan
// therefore reports 0 refs even though the code exists.
//
// This tool does:
//   1. locate the needle in the file and compute its VA
//   2. locate every 8-byte little-endian value equal to that VA (pointer table)
//   3. scan .text for RIP-relative LEA/MOV references to those table entries
//   4. print candidate code sites and their containing function estimate
//
// Offline and read-only.

const fs = require('fs');

const FILE = process.argv[2];
const NEEDLE = process.argv[3];
if (!FILE || !NEEDLE) {
  console.error('usage: node tools/find_ptr_table_ref.js <pe> <needle>');
  process.exit(2);
}

function parsePE(buf) {
  if (buf.readUInt16LE(0) !== 0x5a4d) throw new Error('not MZ');
  const peOff = buf.readUInt32LE(0x3c);
  if (buf.readUInt32LE(peOff) !== 0x00004550) throw new Error('not PE');
  const numSec = buf.readUInt16LE(peOff + 4 + 2);
  const optSize = buf.readUInt16LE(peOff + 4 + 16);
  const opt = peOff + 24;
  const magic = buf.readUInt16LE(opt);
  const imageBase = magic === 0x20b
    ? Number(buf.readBigUInt64LE(opt + 24))
    : buf.readUInt32LE(opt + 28);
  const secOff = opt + optSize;
  const secs = [];
  for (let i = 0; i < numSec; i++) {
    const o = secOff + i * 40;
    secs.push({
      name: buf.slice(o, o + 8).toString('latin1').replace(/\0/g, ''),
      vs: buf.readUInt32LE(o + 8),
      va: buf.readUInt32LE(o + 12),
      rs: buf.readUInt32LE(o + 16),
      raw: buf.readUInt32LE(o + 20),
    });
  }
  return { imageBase, secs };
}

function offToRva(secs, off) {
  for (const s of secs) {
    if (off >= s.raw && off < s.raw + s.rs) return s.va + (off - s.raw);
  }
  return -1;
}

function u64le(v) {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(v));
  return b;
}

const buf = fs.readFileSync(FILE);
const { imageBase, secs } = parsePE(buf);
console.log('imageBase 0x' + imageBase.toString(16));
console.log(secs.map(s => s.name + '@rva0x' + s.va.toString(16) + '+0x' + s.rs.toString(16)).join(' '));

// 1) needle -> VA(s)
const pat = Buffer.from(NEEDLE, 'latin1');
const strVAs = [];
let i = 0;
while ((i = buf.indexOf(pat, i)) !== -1) {
  const rva = offToRva(secs, i);
  if (rva >= 0) strVAs.push(imageBase + rva);
  i += 1;
}
if (!strVAs.length) { console.log('needle not found'); process.exit(0); }
console.log('needle occurrences: ' + strVAs.length + ' -> ' + strVAs.map(v => '0x' + v.toString(16)).join(', '));

// 2) pointer table entries pointing at the needle
const tableVAs = new Set();
for (const va of strVAs) {
  const needlePtr = u64le(va);
  let j = 0;
  let n = 0;
  while ((j = buf.indexOf(needlePtr, j)) !== -1) {
    const rva = offToRva(secs, j);
    if (rva >= 0) { tableVAs.add(imageBase + rva); n += 1; }
    j += 8;
    if (n > 64) break;
  }
}
if (!tableVAs.size) { console.log('no pointer-table entries found'); process.exit(0); }
const tables = [...tableVAs];
console.log('pointer-table entries: ' + tables.length + ' -> ' + tables.slice(0, 12).map(v => '0x' + v.toString(16)).join(', '));

// 3) code refs (RIP-relative LEA / MOV) to any table entry
const text = secs.find(s => s.name === '.text');
if (!text) { console.log('no .text'); process.exit(0); }
const tStart = text.raw;
const tEnd = Math.min(buf.length, text.raw + Math.max(text.vs, text.rs));
const want = new Set(tables.map(v => v - imageBase)); // compare in RVA space
const hits = [];
for (let o = tStart; o + 7 <= tEnd; o++) {
  const b0 = buf[o], b1 = buf[o + 1], b2 = buf[o + 2];
  // 48/4C 8B/8D with modrm mod=00 rm=101 (RIP-relative)
  if ((b0 === 0x48 || b0 === 0x4c) && (b1 === 0x8d || b1 === 0x8b) && (b2 & 0xc7) === 0x05) {
    const disp = buf.readInt32LE(o + 3);
    const insnRva = offToRva(secs, o);
    if (insnRva < 0) continue;
    const tgtRva = insnRva + 7 + disp;
    if (want.has(tgtRva)) hits.push({ rva: insnRva, tgt: tgtRva, op: b1 === 0x8d ? 'lea' : 'mov' });
  }
}
console.log('code refs to pointer table: ' + hits.length);
hits.slice(0, 20).forEach(h => console.log('  0x' + (imageBase + h.rva).toString(16) + ' ' + h.op + ' -> 0x' + (imageBase + h.tgt).toString(16)));

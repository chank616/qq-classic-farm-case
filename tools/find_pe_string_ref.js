'use strict';

// Locates code that references a target string in a PE (x64), without a full
// disassembler: parses sections, computes the string VA, then scans .text for
// RIP-relative LEA/MOV references pointing at it.

const fs = require('fs');

const PE = process.argv[2] || 'D:/Program Files/Tencent/QQNT/versions/9.9.35-52892/resources/app/wrapper.node';
const NEEDLE = process.argv[3] || 'SetDBKey sqlite3_key failed';

function parsePE(buf) {
  if (buf.readUInt16LE(0) !== 0x5a4d) throw new Error('not MZ');
  const peOff = buf.readUInt32LE(0x3c);
  if (buf.readUInt32LE(peOff) !== 0x00004550) throw new Error('not PE');
  const coff = peOff + 4;
  const numSections = buf.readUInt16LE(coff + 2);
  const optSize = buf.readUInt16LE(coff + 16);
  const opt = coff + 20;
  const magic = buf.readUInt16LE(opt);
  const is64 = magic === 0x20b;
  const imageBase = is64
    ? Number(buf.readBigUInt64LE(opt + 24))
    : buf.readUInt32LE(opt + 28);
  const sections = [];
  const secOff = opt + optSize;
  for (let i = 0; i < numSections; i++) {
    const o = secOff + i * 40;
    sections.push({
      name: buf.toString('latin1', o, o + 8).replace(/\0+$/, ''),
      vsize: buf.readUInt32LE(o + 8),
      va: buf.readUInt32LE(o + 12),
      rawSize: buf.readUInt32LE(o + 16),
      rawPtr: buf.readUInt32LE(o + 20),
      chars: buf.readUInt32LE(o + 36),
    });
  }
  return { imageBase, sections, is64 };
}

function rvaToOff(sections, rva) {
  for (const s of sections) {
    if (rva >= s.va && rva < s.va + Math.max(s.vsize, s.rawSize)) {
      return s.rawPtr + (rva - s.va);
    }
  }
  return -1;
}

function offToRva(sections, off) {
  for (const s of sections) {
    if (off >= s.rawPtr && off < s.rawPtr + s.rawSize) {
      return s.va + (off - s.rawPtr);
    }
  }
  return -1;
}

function main() {
  const buf = fs.readFileSync(PE);
  const { imageBase, sections } = parsePE(buf);
  console.log('imageBase', '0x' + imageBase.toString(16));
  console.log('sections', sections.map(s => `${s.name}@rvа0x${s.va.toString(16)}+0x${s.vsize.toString(16)}`).join(' '));

  const needle = Buffer.from(NEEDLE, 'latin1');
  const strOff = buf.indexOf(needle);
  if (strOff < 0) { console.log('string not found'); return; }
  const strRva = offToRva(sections, strOff);
  const strVa = imageBase + strRva;
  console.log('string file offset', strOff, 'rva 0x' + strRva.toString(16), 'va 0x' + strVa.toString(16));

  const text = sections.find(s => s.name === '.text') || sections[0];
  const start = text.rawPtr;
  const end = Math.min(buf.length, text.rawPtr + text.rawSize);
  console.log('scan .text', '0x' + (imageBase + text.va).toString(16), '-', '0x' + (imageBase + text.va + text.rawSize).toString(16));

  const hits = [];
  for (let p = start; p + 7 <= end; p++) {
    const b = buf[p];
    // 48/4C 8D <modrm with rip rel>  : lea r64, [rip+disp32]
    if ((b === 0x48 || b === 0x4c) && buf[p + 1] === 0x8d) {
      const modrm = buf[p + 2];
      if ((modrm & 0xc7) === 0x05) {
        const disp = buf.readInt32LE(p + 3);
        const nextRva = offToRva(sections, p) + 7;
        const target = imageBase + nextRva + disp;
        if (target === strVa) hits.push(offToRva(sections, p));
      }
    }
    // 48/4C 8B <modrm rip rel> : mov r64, [rip+disp32]
    if ((b === 0x48 || b === 0x4c) && buf[p + 1] === 0x8b) {
      const modrm = buf[p + 2];
      if ((modrm & 0xc7) === 0x05) {
        const disp = buf.readInt32LE(p + 3);
        const nextRva = offToRva(sections, p) + 7;
        const target = imageBase + nextRva + disp;
        if (target === strVa) hits.push(offToRva(sections, p));
      }
    }
  }
  console.log('code refs', hits.length, hits.slice(0, 20).map(h => '0x' + (imageBase + h).toString(16)).join(', '));
}

main();

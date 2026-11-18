'use strict';

// Generic protobuf wire walker for schema discovery. Prints tag/wire/value
// trees for messages whose .proto we have not reconstructed yet.

function readVarint(view, pos) {
  let result = 0n;
  let shift = 0n;
  while (true) {
    if (pos >= view.length) throw new Error('truncated varint');
    const b = view[pos++];
    result |= BigInt(b & 0x7f) << shift;
    if ((b & 0x80) === 0) break;
    shift += 7n;
    if (shift > 63n) throw new Error('varint too long');
  }
  return { value: result, pos };
}

function looksLikeText(u8) {
  if (!u8.length) return false;
  let printable = 0;
  for (const b of u8) {
    if (b === 9 || b === 10 || b === 13 || (b >= 0x20 && b < 0x7f)) printable++;
  }
  return printable / u8.length > 0.85;
}

function dump(bytes, opts) {
  const o = Object.assign({ depth: 0, maxDepth: 6, maxItems: 24 }, opts || {});
  const view = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
  const lines = [];
  walk(view, o.depth, o, lines);
  return lines;
}

function walk(view, depth, o, lines) {
  const pad = '  '.repeat(depth);
  let pos = 0;
  let count = 0;
  while (pos < view.length) {
    if (count++ > o.maxItems) { lines.push(pad + '... (truncated)'); return; }
    let t;
    try { t = readVarint(view, pos); } catch (_) { lines.push(pad + '! truncated at ' + pos); return; }
    pos = t.pos;
    const tagValue = Number(t.value);
    const tag = Math.floor(tagValue / 8);
    const wire = tagValue & 7;
    if (wire === 0) {
      const r = readVarint(view, pos); pos = r.pos;
      lines.push(pad + tag + ': varint ' + r.value.toString());
    } else if (wire === 1) {
      const dv = new DataView(view.buffer, view.byteOffset + pos, 8);
      lines.push(pad + tag + ': fixed64 ' + dv.getBigUint64(0, true).toString());
      pos += 8;
    } else if (wire === 5) {
      const dv = new DataView(view.buffer, view.byteOffset + pos, 4);
      lines.push(pad + tag + ': fixed32 ' + dv.getUint32(0, true));
      pos += 4;
    } else if (wire === 2) {
      const r = readVarint(view, pos); pos = r.pos;
      const n = Number(r.value);
      const chunk = view.subarray(pos, pos + n); pos += n;
      if (looksLikeText(chunk)) {
        lines.push(pad + tag + ': str(' + n + ') "' + Buffer.from(chunk).toString('utf8') + '"');
      } else if (depth < o.maxDepth) {
        const sub = [];
        try {
          walk(chunk, depth + 1, o, sub);
        } catch (_) { sub.length = 0; }
        // A submessage must consume the whole chunk; otherwise treat as bytes.
        if (sub.length && sub.every(function (l) { return !l.includes('! truncated'); })) {
          lines.push(pad + tag + ': msg(' + n + ') {');
          lines.push.apply(lines, sub);
          lines.push(pad + '}');
        } else {
          lines.push(pad + tag + ': bytes(' + n + ') ' + Buffer.from(chunk).slice(0, 16).toString('hex'));
        }
      } else {
        lines.push(pad + tag + ': bytes(' + n + ') ' + Buffer.from(chunk).slice(0, 16).toString('hex'));
      }
    } else {
      lines.push(pad + '! unsupported wire ' + wire + ' at ' + pos);
      return;
    }
  }
}

module.exports = { dump, readVarint };

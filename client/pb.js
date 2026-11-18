'use strict';

// Minimal protobuf wire codec, browser + Node compatible.
// Only the wire types the farm protocol actually uses:
//   0 varint, 1 fixed64, 2 length-delimited, 5 fixed32
// A message schema is a plain object: { fieldName: [tag, kind] }
// kind: 'int32' | 'uint32' | 'int64' | 'uint64' | 'bool' | 'string' | 'bytes'
//       | 'float' | 'double' | 'message:<Name>' | 'repeated:<kind>'

function Writer() {
  this.parts = [];
  this.len = 0;
}
Writer.prototype.byte = function (b) {
  this.parts.push(Uint8Array.of(b & 0xff));
  this.len += 1;
};
Writer.prototype.bytes = function (arr) {
  this.parts.push(arr);
  this.len += arr.length;
};
Writer.prototype.varint = function (value) {
  let v = typeof value === 'bigint' ? value : BigInt(Math.trunc(Number(value)));
  if (v < 0n) v += 1n << 64n;
  const out = [];
  while (v > 0x7fn) {
    out.push(Number(v & 0x7fn) | 0x80);
    v >>= 7n;
  }
  out.push(Number(v));
  this.parts.push(Uint8Array.from(out));
  this.len += out.length;
};
Writer.prototype.tag = function (field, wire) {
  this.varint((field << 3) | wire);
};
Writer.prototype.finish = function () {
  const out = new Uint8Array(this.len);
  let off = 0;
  for (const p of this.parts) { out.set(p, off); off += p.length; }
  return out;
};

function encodeVarintField(w, tag, value) {
  w.tag(tag, 0);
  w.varint(value);
}
function encodeBytesField(w, tag, value) {
  w.tag(tag, 2);
  w.varint(value.length);
  w.bytes(value);
}
function toU8(value) {
  if (value instanceof Uint8Array) return value;
  if (typeof value === 'string') return utf8Encode(value);
  if (value && value.length !== undefined) return Uint8Array.from(value);
  throw new TypeError('cannot convert to bytes');
}
function utf8Encode(str) {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
  return Uint8Array.from(Buffer.from(str, 'utf8'));
}
function utf8Decode(bytes) {
  if (typeof TextDecoder !== 'undefined') return new TextDecoder().decode(bytes);
  return Buffer.from(bytes).toString('utf8');
}

// schema: { field: [tag, kind] }, registry: { messageName: schema }
function encodeMessage(name, obj, registry) {
  const schema = registry[name];
  if (!schema) throw new Error('unknown message: ' + name);
  const w = new Writer();
  for (const [field, spec] of Object.entries(schema)) {
    const [tag, kind] = spec;
    const value = obj[field];
    if (value === undefined || value === null) continue;
    if (kind.startsWith('repeated:')) {
      const inner = kind.slice(9);
      const arr = Array.isArray(value) ? value : [value];
      for (const item of arr) encodeOne(w, tag, inner, item, registry);
      continue;
    }
    encodeOne(w, tag, kind, value, registry);
  }
  return w.finish();
}

function encodeOne(w, tag, kind, value, registry) {
  if (kind === 'int32' || kind === 'uint32' || kind === 'int64' || kind === 'uint64' || kind === 'bool') {
    encodeVarintField(w, tag, typeof value === 'boolean' ? (value ? 1 : 0) : value);
  } else if (kind === 'string') {
    encodeBytesField(w, tag, utf8Encode(String(value)));
  } else if (kind === 'bytes') {
    encodeBytesField(w, tag, toU8(value));
  } else if (kind === 'float') {
    w.tag(tag, 5);
    const buf = new ArrayBuffer(4); new DataView(buf).setFloat32(0, Number(value), true);
    w.bytes(new Uint8Array(buf));
  } else if (kind === 'double') {
    w.tag(tag, 1);
    const buf = new ArrayBuffer(8); new DataView(buf).setFloat64(0, Number(value), true);
    w.bytes(new Uint8Array(buf));
  } else if (kind.startsWith('message:')) {
    encodeBytesField(w, tag, encodeMessage(kind.slice(8), value, registry));
  } else {
    throw new Error('unsupported kind: ' + kind);
  }
}

function decodeMessage(name, bytes, registry) {
  const schema = registry[name];
  if (!schema) throw new Error('unknown message: ' + name);
  const byTag = {};
  for (const [field, [tag, kind]] of Object.entries(schema)) byTag[tag] = { field, kind };
  const out = {};
  const view = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
  let pos = 0;
  while (pos < view.length) {
    const t = readVarint(view, pos); pos = t.pos;
    const tagValue = Number(t.value);
    const tag = Math.floor(tagValue / 8);
    const wire = tagValue & 7;
    const spec = byTag[tag];
    if (!spec) { pos = skipField(view, pos, wire); continue; }
    const { field, kind } = spec;
    const repeated = kind.startsWith('repeated:');
    const inner = repeated ? kind.slice(9) : kind;
    let value;
    if (wire === 0) {
      const r = readVarint(view, pos); pos = r.pos;
      value = inner === 'bool' ? r.value !== 0 : Number(r.value);
    } else if (wire === 2) {
      const r = readVarint(view, pos); pos = r.pos;
      const chunk = view.subarray(pos, pos + Number(r.value)); pos += Number(r.value);
      if (inner === 'string') value = utf8Decode(chunk);
      else if (inner === 'bytes') value = chunk;
      else if (inner.startsWith('message:')) value = decodeMessage(inner.slice(8), chunk, registry);
      else value = Number(readVarint(chunk, 0).value); // packed scalar
    } else if (wire === 5) {
      value = new DataView(view.buffer, view.byteOffset + pos, 4).getFloat32(0, true); pos += 4;
    } else if (wire === 1) {
      value = Number(new DataView(view.buffer, view.byteOffset + pos, 8).getFloat64(0, true)); pos += 8;
    } else {
      pos = skipField(view, pos, wire);
      continue;
    }
    if (repeated) {
      if (!Array.isArray(out[field])) out[field] = [];
      out[field].push(value);
    } else {
      out[field] = value;
    }
  }
  return out;
}

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

function skipField(view, pos, wire) {
  if (wire === 0) return readVarint(view, pos).pos;
  if (wire === 1) return pos + 8;
  if (wire === 5) return pos + 4;
  if (wire === 2) {
    const r = readVarint(view, pos);
    return r.pos + Number(r.value);
  }
  throw new Error('unsupported wire type: ' + wire);
}

module.exports = { Writer, encodeMessage, decodeMessage, utf8Encode, utf8Decode, readVarint };

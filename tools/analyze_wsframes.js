const fs = require('fs');
const path = require('path');

const input = process.argv[2] || 'C:/Users/chank616/AppData/Roaming/QQEX/miniapp/fs/2351686624/1112386029/usr/wsframes.jsonl';
const output = process.argv[3] || path.resolve(__dirname, '../artifacts/wsframes-analysis.json');

function readVarint(buf, offset) {
  let value = 0n;
  let shift = 0n;
  let i = offset;
  for (let n = 0; n < 10 && i < buf.length; n++, i++) {
    const byte = buf[i];
    value |= BigInt(byte & 0x7f) << shift;
    if (!(byte & 0x80)) return { value, next: i + 1 };
    shift += 7n;
  }
  return null;
}

function safeNumber(v) {
  return v <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : v.toString();
}

function parseFields(buf, limit = 2000) {
  const fields = [];
  let offset = 0;
  while (offset < buf.length && fields.length < limit) {
    const tag = readVarint(buf, offset);
    if (!tag) break;
    offset = tag.next;
    const field = Number(tag.value >> 3n);
    const wire = Number(tag.value & 7n);
    if (!field) break;
    if (wire === 0) {
      const v = readVarint(buf, offset);
      if (!v) break;
      offset = v.next;
      fields.push({ field, wire, value: safeNumber(v.value) });
    } else if (wire === 1) {
      if (offset + 8 > buf.length) break;
      fields.push({ field, wire, length: 8, hex: buf.subarray(offset, offset + 8).toString('hex') });
      offset += 8;
    } else if (wire === 2) {
      const len = readVarint(buf, offset);
      if (!len) break;
      offset = len.next;
      const n = Number(len.value);
      if (!Number.isSafeInteger(n) || n < 0 || offset + n > buf.length) break;
      const data = buf.subarray(offset, offset + n);
      offset += n;
      const text = data.toString('utf8');
      const printable = /^[\x09\x0a\x0d\x20-\x7e\u0080-\uffff]*$/.test(text);
      fields.push({ field, wire, length: n, text: printable ? text : undefined, hex: printable ? undefined : data.subarray(0, 32).toString('hex'), data });
    } else if (wire === 5) {
      if (offset + 4 > buf.length) break;
      fields.push({ field, wire, length: 4, hex: buf.subarray(offset, offset + 4).toString('hex') });
      offset += 4;
    } else {
      break;
    }
  }
  return fields;
}

function asMethod(buf) {
  const top = parseFields(buf, 64);
  for (const f of top) {
    if (f.field !== 1 || !f.data) continue;
    const nested = parseFields(f.data, 32);
    const service = nested.find(x => x.field === 1 && typeof x.text === 'string')?.text;
    const method = nested.find(x => x.field === 2 && typeof x.text === 'string')?.text;
    if (service && method) return { service, method, nested, top };
  }
  for (const f of top) {
    if (f.field === 1 && typeof f.text === 'string' && f.text.includes('.')) return { service: f.text, method: '', nested: [], top };
  }
  return { service: '', method: '', nested: [], top };
}

function redactUrl(url) {
  return String(url).replace(/([?&](?:code|token|js_code|wxcode|session|openid)=)[^&]*/gi, '$1<redacted>');
}

function parseLine(line) {
  let item;
  try { item = JSON.parse(line); } catch { return null; }
  const base = { t: item.t, iso: item.t ? new Date(item.t).toISOString() : undefined, dir: item.dir };
  if (item.dir === 'OPEN') return { ...base, url: redactUrl(item.url || '') };
  if (item.dir !== 'S' && item.dir !== 'R') return base;
  const buf = Buffer.from(item.b64 || '', 'base64');
  const parsed = asMethod(buf);
  const top = parsed.top;
  const nested = parsed.nested;
  const status = top.find(x => x.field === 1 && x.data)?.data;
  const statusFields = status ? parseFields(status, 16) : [];
  const trace = top.flatMap(x => x.data ? parseFields(x.data, 32) : []).find(x => x.text === 'x-traceid');
  return {
    ...base,
    len: Number(item.len || buf.length),
    method: parsed.service && parsed.method ? `${parsed.service}/${parsed.method}` : undefined,
    service: parsed.service || undefined,
    rpcMethod: parsed.method || undefined,
    // Message field 3 is a session token. Keep only its wire metadata; never
    // serialize the printable token bytes into the derived analysis artifact.
    envelopeFields: top.map(x => ({ field: x.field, wire: x.wire, length: x.length, value: x.value,
      text: x.field === 3 ? undefined : x.text })),
    requestFlags: nested.filter(x => x.field >= 3 && x.field <= 5 && x.value !== undefined).map(x => ({ field: x.field, value: x.value })),
    traceIdPresent: Boolean(trace),
    statusFields: statusFields.filter(x => x.value !== undefined).map(x => ({ field: x.field, value: x.value })),
  };
}

const lines = fs.readFileSync(input, 'utf8').split(/\r?\n/).filter(Boolean);
const events = lines.map(parseLine).filter(Boolean);
const methods = new Map();
for (const e of events) {
  if (!e.method) continue;
  const key = `${e.dir} ${e.method}`;
  const x = methods.get(key) || { dir: e.dir, method: e.method, count: 0, bytes: 0, firstT: e.t, lastT: e.t };
  x.count++;
  x.bytes += e.len || 0;
  x.firstT = Math.min(x.firstT ?? e.t, e.t);
  x.lastT = Math.max(x.lastT ?? e.t, e.t);
  methods.set(key, x);
}
const opens = events.filter(e => e.dir === 'OPEN').map(e => ({ t: e.t, iso: e.iso, url: e.url }));
const io = events.filter(e => e.dir === 'S' || e.dir === 'R');
const methodCounts = [...methods.values()].sort((a, b) => a.firstT - b.firstT);
const result = {
  input,
  lineCount: lines.length,
  eventCount: events.length,
  opens,
  timeRange: io.length ? { first: io[0].iso, last: io[io.length - 1].iso, spanMs: io[io.length - 1].t - io[0].t } : null,
  serviceMethodCount: new Set(methodCounts.map(x => x.method)).size,
  methodDirectionPairCount: methodCounts.length,
  methodCounts,
  events,
};
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ output, lineCount: result.lineCount, eventCount: result.eventCount, opens: opens.length,
  serviceMethods: result.serviceMethodCount, methodDirectionPairs: result.methodDirectionPairCount }, null, 2));
console.log(result.methodCounts.map(x => `${x.dir}\t${x.count}\t${x.method}\t${x.bytes}`).join('\n'));

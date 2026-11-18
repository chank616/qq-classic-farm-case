const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const input = process.argv[2] || 'C:/Users/chank616/AppData/Roaming/QQEX/miniapp/fs/2351686624/1112386029/usr/wsframes.jsonl';
const output = process.argv[3] || path.resolve(__dirname, '../artifacts/ws-token-metadata.json');

function readVarint(buf, offset) {
  let value = 0n;
  let shift = 0n;
  let i = offset;
  for (let n = 0; n < 10 && i < buf.length; n++, i++) {
    const byte = buf[i];
    value |= BigInt(byte & 0x7f) << shift;
    if (!(byte & 0x80)) return { value: Number(value), next: i + 1 };
    shift += 7n;
  }
  return null;
}

function tokenField(buf) {
  let offset = 0;
  while (offset < buf.length) {
    const tag = readVarint(buf, offset);
    if (!tag) return null;
    offset = tag.next;
    const field = tag.value >>> 3;
    const wire = tag.value & 7;
    if (wire === 2) {
      const length = readVarint(buf, offset);
      if (!length) return null;
      offset = length.next;
      const end = offset + length.value;
      if (end > buf.length) return null;
      if (field === 3) return buf.subarray(offset, end);
      offset = end;
    } else if (wire === 0) {
      const value = readVarint(buf, offset);
      if (!value) return null;
      offset = value.next;
    } else if (wire === 1) offset += 8;
    else if (wire === 5) offset += 4;
    else return null;
  }
  return null;
}

const rows = fs.readFileSync(input, 'utf8').split(/\r?\n/).filter(Boolean);
const connections = [];
let connectionIndex = -1;
const globalDigests = new Set();
let outboundMessages = 0;
let missingToken = 0;
let minLength = Infinity;
let maxLength = 0;
const lengthCounts = new Map();

for (const row of rows) {
  let event;
  try { event = JSON.parse(row); } catch { continue; }
  if (event.dir === 'OPEN') {
    connectionIndex++;
    connections.push({ index: connectionIndex, messages: 0, uniqueValues: 0, digests: new Set() });
    continue;
  }
  if (event.dir !== 'S') continue;
  outboundMessages++;
  const token = tokenField(Buffer.from(event.b64 || '', 'base64'));
  if (!token) { missingToken++; continue; }
  const conn = connections[connectionIndex];
  if (!conn) continue;
  conn.messages++;
  minLength = Math.min(minLength, token.length);
  maxLength = Math.max(maxLength, token.length);
  lengthCounts.set(token.length, (lengthCounts.get(token.length) || 0) + 1);
  // Digests exist only in memory for deduplication and are never serialized.
  const digest = crypto.createHash('sha256').update(token).digest('hex');
  if (!conn.digests.has(digest)) conn.uniqueValues++;
  conn.digests.add(digest);
  globalDigests.add(digest);
}

const result = {
  eventCount: rows.length,
  connectionCount: connections.length,
  outboundMessages,
  messagesWithField3: connections.reduce((sum, c) => sum + c.messages, 0),
  missingField3: missingToken,
  uniqueField3Values: globalDigests.size,
  minField3Length: Number.isFinite(minLength) ? minLength : null,
  maxField3Length: maxLength || null,
  lengthHistogram: Object.fromEntries([...lengthCounts].sort((a, b) => a[0] - b[0])),
  perConnection: connections.map(({ index, messages, uniqueValues }) => ({ index, messages, uniqueValues })),
};
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ output, ...result }, null, 2));

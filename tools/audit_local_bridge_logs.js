const fs = require('fs');
const path = require('path');

const root = process.argv[2] || 'C:/Users/chank616/AppData/Roaming/QQEX/miniapp/fs/2351686624/1112386029/usr';
const output = process.argv[3] || path.resolve('artifacts/local-bridge-runtime-audit.json');
const names = ['bridge-cmd.jsonl', 'bridge-out.jsonl', 'bridge-rx.jsonl', 'wasm-calls.jsonl'];
const files = {};

function readJsonl(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const rows = [];
  let malformedLines = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    try { rows.push(JSON.parse(line)); } catch { malformedLines++; }
  }
  return { text, rows, malformedLines };
}

function bytesFromB64(value) {
  if (typeof value !== 'string') return null;
  try { return Buffer.from(value, 'base64').length; } catch { return null; }
}

for (const name of names) {
  const filePath = path.join(root, name);
  if (!fs.existsSync(filePath)) {
    files[name] = { exists: false };
    continue;
  }
  const stat = fs.statSync(filePath);
  const { rows, malformedLines } = readJsonl(filePath);
  const record = { exists: true, bytes: stat.size, modifiedUtc: stat.mtime.toISOString(), parsedRecords: rows.length, malformedLines };

  if (name === 'bridge-cmd.jsonl') {
    const payloadBytes = rows.map(row => bytesFromB64(row.b64)).filter(Number.isFinite);
    record.commands = rows.length;
    record.probes = rows.filter(row => row.probe === true).length;
    record.frameCommands = rows.filter(row => row.probe !== true && typeof row.b64 === 'string').length;
    record.decodedPayloadBytes = payloadBytes.length ? { min: Math.min(...payloadBytes), max: Math.max(...payloadBytes), total: payloadBytes.reduce((a, b) => a + b, 0) } : null;
  } else if (name === 'bridge-out.jsonl') {
    record.okCount = rows.filter(row => row.ok === true).length;
    record.failCount = rows.filter(row => row.ok === false).length;
    record.probeReadyCount = rows.filter(row => row.probe === true && row.ready === true).length;
    record.probeNotReadyCount = rows.filter(row => row.probe === true && row.ready === false).length;
    record.errorCategories = {
      socketNotReady: rows.filter(row => row.err === 'socket 未就绪').length,
      other: rows.filter(row => typeof row.err === 'string' && row.err !== 'socket 未就绪').length,
    };
    record.meanReportedFrameBytes = (() => { const values = rows.map(row => row.n).filter(Number.isFinite); return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null; })();
  } else if (name === 'bridge-rx.jsonl') {
    const counts = {};
    const frameBytes = {};
    const seqValues = [];
    for (const row of rows) {
      const category = row.dir || row.ev || 'unknown';
      counts[category] = (counts[category] || 0) + 1;
      if (typeof row.b64 === 'string') {
        const n = bytesFromB64(row.b64);
        if (n !== null) frameBytes[category] = (frameBytes[category] || 0) + n;
      }
      if (Number.isSafeInteger(row.seq)) seqValues.push(row.seq);
      if (Number.isSafeInteger(row.maxSeq)) seqValues.push(row.maxSeq);
    }
    record.eventCounts = counts;
    record.frameBytesByCategory = frameBytes;
    record.sequenceRange = seqValues.length ? { min: Math.min(...seqValues), max: Math.max(...seqValues) } : null;
  } else {
    const eventCounts = {};
    const functionCounts = {};
    const callShapeCounts = {};
    for (const row of rows) {
      const event = typeof row.ev === 'string' ? row.ev : 'unknown';
      eventCounts[event] = (eventCounts[event] || 0) + 1;
      if (typeof row.fn === 'string') functionCounts[row.fn] = (functionCounts[row.fn] || 0) + 1;
      const shape = [event, typeof row.fn === 'string' ? row.fn : '', Array.isArray(row.args) ? row.args.length : 0, Array.isArray(row.in) ? row.in.length : 0, Array.isArray(row.out) ? row.out.length : 0].join('|');
      callShapeCounts[shape] = (callShapeCounts[shape] || 0) + 1;
    }
    record.eventCounts = eventCounts;
    record.functionCounts = functionCounts;
    record.callShapeCounts = callShapeCounts;
  }
  files[name] = record;
}

const report = {
  sourceDirectory: root,
  privacy: 'Payloads, base64 values, pointer values, sequence values, request contents, and errors are not retained; only counts, byte totals, and categories are recorded.',
  interpretation: 'bridge-out success reflects the local wrapper calling socketTask.send, not a server response or accepted business operation. bridge-rx/WASM payloads are summarized without decoding or printing.',
  files,
};
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ output, files: Object.fromEntries(Object.entries(files).map(([name, value]) => [name, { exists: value.exists, parsedRecords: value.parsedRecords }])) }, null, 2));

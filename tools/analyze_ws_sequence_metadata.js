const fs = require('fs');
const path = require('path');

const input = process.argv[2] || path.resolve(__dirname, '../artifacts/wsframes-analysis.json');
const output = process.argv[3] || path.resolve(__dirname, '../artifacts/ws-sequence-metadata.json');
const analysis = JSON.parse(fs.readFileSync(input, 'utf8'));
const typeCounts = { S: {}, R: {} };
const connections = [];
const errorCodes = {};
let connection = -1;
let unsequencedSends = 0;

for (const event of analysis.events) {
  if (event.dir === 'OPEN') {
    connection++;
    connections.push({ index: connection, sends: [], replies: 0 });
    continue;
  }
  if (event.dir !== 'S' && event.dir !== 'R') continue;
  const fields = Object.fromEntries((event.statusFields || []).map(field => [field.field, field.value]));
  const type = fields[3] === undefined ? 'missing' : String(fields[3]);
  typeCounts[event.dir][type] = (typeCounts[event.dir][type] || 0) + 1;
  if (Number.isInteger(fields[6]) && fields[6] !== 0) {
    const key = `${event.dir} ${fields[6]} ${event.method || '<unknown-method>'}`;
    errorCodes[key] = (errorCodes[key] || 0) + 1;
  }
  if (event.dir === 'S') {
    if (Number.isInteger(fields[4])) connections[connection]?.sends.push(fields[4]);
    else unsequencedSends++;
  } else if (connections[connection]) connections[connection].replies++;
}

const perConnection = connections.map(({ index, sends, replies }) => {
  const unique = new Set(sends);
  const max = sends.length ? Math.max(...sends) : 0;
  const missing = [];
  for (let seq = 1; seq <= max; seq++) if (!unique.has(seq)) missing.push(seq);
  return {
    index,
    sendCount: sends.length,
    firstClientSeq: sends.length ? sends[0] : null,
    lastClientSeq: sends.length ? sends[sends.length - 1] : null,
    duplicateClientSeqCount: sends.length - unique.size,
    missingClientSeqs: missing,
    replyFrameCount: replies,
  };
});

const result = {
  eventCount: analysis.eventCount,
  connectionCount: connections.length,
  messageTypeCounts: typeCounts,
  nonzeroErrorCodeCounts: errorCodes,
  unsequencedOutboundFrames: unsequencedSends,
  perConnection,
};
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));

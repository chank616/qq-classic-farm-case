const fs = require('fs');
const path = require('path');

const usr = process.argv[2] || 'C:/Users/chank616/AppData/Roaming/QQEX/miniapp/fs/2351686624/1112386029/usr';
const analysisPath = process.argv[3] || path.resolve('artifacts/bridge-wsframes-analysis.json');
const outputPath = process.argv[4] || path.resolve('artifacts/bridge-command-method-summary.json');

const readRows = file => fs.readFileSync(path.join(usr, file), 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
const outgoing = readRows('bridge-out.jsonl').filter(row => row.ok === true && row.probe !== true && Number.isSafeInteger(row.seq));
const analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf8'));
const sendsBySeqAndLength = new Map();
for (const event of analysis.events.filter(row => row.dir === 'S' && row.method)) {
  const seq = event.requestFlags?.find(field => field.field === 4)?.value;
  if (!Number.isSafeInteger(seq) || !Number.isSafeInteger(event.len)) continue;
  const key = `${seq}:${event.len}`;
  if (!sendsBySeqAndLength.has(key)) sendsBySeqAndLength.set(key, []);
  sendsBySeqAndLength.get(key).push(event);
}

const methodCounts = {};
let matched = 0;
let methodAmbiguous = 0;
let unmatched = 0;
for (const row of outgoing) {
  const candidates = sendsBySeqAndLength.get(`${row.seq}:${row.n}`) || [];
  const methods = [...new Set(candidates.map(event => event.method))];
  if (!methods.length) { unmatched++; continue; }
  matched++;
  if (methods.length > 1) { methodAmbiguous++; continue; }
  const method = methods[0];
  methodCounts[method] = (methodCounts[method] || 0) + 1;
}

const writePattern = /\/(?:Plant|Harvest|RemovePlant|WaterLand|Fertilize|Insecticide|WeedOut|Claim\w*|Purchase|Buy\w*|Unlock\w*|Upgrade\w*)$/i;
const report = {
  capturedCommandFile: path.join(usr, 'bridge-cmd.jsonl'),
  bridgeOutSuccesses: outgoing.length,
  matchedToOutgoingFrameMetadata: matched,
  methodAmbiguousMatches: methodAmbiguous,
  unmatchedSuccesses: unmatched,
  methodCounts,
  matchedMethodTotal: Object.values(methodCounts).reduce((a, b) => a + b, 0),
  mutatingMethodCandidates: Object.keys(methodCounts).filter(method => writePattern.test(method)),
  interpretation: 'These are frame names correlated by the injected bridge sequence to its local send receipt. The receipt reports only that socketTask.send was called; it does not prove server acceptance or business success.',
};
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ output: outputPath, bridgeOutSuccesses: outgoing.length, matched, methodAmbiguous, unmatched, methods: Object.keys(methodCounts).length, mutatingMethodCandidates: report.mutatingMethodCandidates }, null, 2));

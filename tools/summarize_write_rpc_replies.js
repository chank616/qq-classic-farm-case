const fs = require('fs');
const path = require('path');

const inputPath = process.argv[2] || path.resolve(__dirname, '../artifacts/wsframes-analysis.json');
const outputPath = process.argv[3] || path.resolve(__dirname, '../artifacts/write-rpc-reply-summary.json');
const analysis = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

const targets = new Set([
  'gamepb.plantpb.PlantService/Plant',
  'gamepb.plantpb.PlantService/Harvest',
  'gamepb.plantpb.PlantService/Fertilize',
  'gamepb.plantpb.PlantService/Farming',
  'gamepb.taskpb.TaskService/ClaimTaskReward',
  'gamepb.taskpb.TaskService/BatchClaimTaskReward',
  'gamepb.taskpb.TaskService/ClaimDailyReward',
  'gamepb.qqvippb.QQVipService/ClaimQQVipRewards',
  'gamepb.qqvippb.QQVipService/ClaimDailyGift',
  'gamepb.mallpb.MallService/Purchase',
  'gamepb.shoppb.ShopService/BuyGoods',
]);

let session = -1;
const requests = new Map();
const replies = new Map();
for (const event of [...analysis.events].sort((a, b) => a.t - b.t)) {
  if (event.dir === 'BOOT') { session++; continue; }
  if (!targets.has(event.method) || !['S', 'R'].includes(event.dir)) continue;
  const fields = event.statusFields || [];
  const seq = fields.find(field => field.field === 4)?.value;
  if (!Number.isSafeInteger(seq)) continue;
  const key = `${session}:${event.method}:${seq}`;
  if (event.dir === 'S') {
    if (!requests.has(key)) requests.set(key, { session, method: event.method, seq, t: event.t, count: 0 });
    requests.get(key).count++;
  } else {
    // The same hook may log one frame more than once. Deduplicate identical
    // metadata records while retaining distinct message-type responses.
    const messageType = fields.find(field => field.field === 3)?.value;
    const errorCode = fields.find(field => field.field === 6)?.value ?? 0;
    const dedupeKey = `${key}:${event.len}:${messageType}:${errorCode}`;
    if (!replies.has(dedupeKey)) replies.set(dedupeKey, {
      key, session, method: event.method, seq, errorCode, messageType, len: event.len,
    });
  }
}

const perMethod = {};
for (const request of requests.values()) {
  const row = perMethod[request.method] ||= { requests: 0, requestEvents: 0, pairedRequests: 0, rpcReplies: 0, gatewayZeroRpcReplies: 0, otherMessageTypeReplies: 0, otherMessageTypes: {}, nonzeroErrorCodes: {} };
  row.requests++;
  row.requestEvents += request.count;
  const matches = [...replies.values()].filter(reply => reply.key === `${request.session}:${request.method}:${request.seq}`);
  const rpcReplies = matches.filter(reply => reply.messageType === 2);
  if (rpcReplies.length) row.pairedRequests++;
  row.rpcReplies += rpcReplies.length;
  for (const reply of rpcReplies) {
    if (reply.errorCode === 0) row.gatewayZeroRpcReplies++;
    else row.nonzeroErrorCodes[reply.errorCode] = (row.nonzeroErrorCodes[reply.errorCode] || 0) + 1;
  }
  for (const reply of matches.filter(reply => reply.messageType !== 2)) {
    row.otherMessageTypeReplies++;
    const type = reply.messageType ?? 'missing';
    row.otherMessageTypes[type] = (row.otherMessageTypes[type] || 0) + 1;
  }
}

const report = {
  source: path.basename(inputPath),
  scope: 'Write-like RPCs only. Requests/replies are paired by BOOT-delimited connection, method, and client sequence. Duplicate identical reply-hook records are collapsed.',
  perMethod,
  interpretation: 'Message type 2 is treated as the direct RPC reply; other message types are reported separately. An absent/zero Meta.error_code is only a gateway/RPC-level non-error. The response body remains encrypted in this analysis, so this is not proof of the requested business state change.',
};
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ output: outputPath, methods: Object.keys(perMethod).length, perMethod }, null, 2));

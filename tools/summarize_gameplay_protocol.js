const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const schemaPath = path.join(root, 'artifacts', 'proto-schema-full.json');
const rpcPath = path.join(root, 'artifacts', 'rpc-map.json');
const outputPath = path.join(root, 'artifacts', 'gameplay-operation-map.json');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const rpc = JSON.parse(fs.readFileSync(rpcPath, 'utf8'));

const selected = {
  'gamepb.taskpb.TaskService': ['taskInfo', 'claimTaskReward', 'batchClaimTaskReward', 'claimDailyReward'],
  'gamepb.qqvippb.QQVipService': ['getQQVipRewardsStatus', 'claimQQVipRewards', 'getDailyGiftStatus', 'claimDailyGift'],
  'gamepb.mallpb.MallService': ['getMallProfiles', 'getMallListBySlotType', 'purchase'],
  'gamepb.shoppb.ShopService': ['shopProfiles', 'shopInfo', 'buyGoods'],
  'gamepb.itempb.ItemService': ['bag'],
  'gamepb.plantpb.PlantService': ['allLands', 'plant', 'harvest', 'refreshLands'],
};

function messageFields(fullName) {
  const match = /^gamepb\.([^.]+)\.(.+)$/.exec(fullName || '');
  if (!match) return [];
  const fields = schema.modules?.[match[1]]?.[match[2]]?.fields || [];
  return fields.map(field => ({
    number: field.field,
    name: field.name,
    wire: field.wire,
    defaultKind: field.defaultKind,
    nestedType: field.nestedType || undefined,
  }));
}

const operations = [];
for (const [service, names] of Object.entries(selected)) {
  for (const name of names) {
    const method = rpc.services?.[service]?.[name];
    if (!method) continue;
    operations.push({
      service,
      method: name,
      request: { type: method.requestType, fields: messageFields(method.requestType) },
      response: { type: method.responseType, fields: messageFields(method.responseType) },
      mappingEvidence: method.extractedBy,
      runtimeStatus: 'static-type-map-only; no request is issued by this report',
    });
  }
}

const report = {
  generatedFrom: { schema: path.relative(root, schemaPath), rpcMap: path.relative(root, rpcPath) },
  boundary: 'Generated protobuf constructors and RPC request/response bindings were inspected offline. This map does not establish dynamic payload values, endpoint-specific product/seed IDs, authentication, server acceptance, or successful state changes.',
  operations,
  stateMachineHints: {
    tasks: ['TaskInfoReply.task_info.daily_tasks', 'TaskInfoReply.task_info.growth_tasks', 'Task.is_unlocked', 'Task.is_claimed', 'Task.progress'],
    vip: ['GetQQVipRewardsStatusReply.can_claim', 'claimed_today', 'active_configs', 'mall_free_can_claim'],
    mall: ['ProductInfo.id', 'slot_type', 'is_free', 'is_available_purchase', 'restriction', 'price'],
    crops: ['LandInfo.unlocked', 'LandInfo.plant.phases', 'PlantPhaseInfo.begin_time', 'PlantPhaseInfo.phase_id', 'PlantInfo.grow_sec', 'PlantInfo.planting_player_level'],
  },
  unresolvedRuntimeEvidence: [
    'which three daily task IDs are active for the account and how each is completed',
    'VIP reward config IDs and successful claim response',
    'free fertilizer slot type/product ID and one-per-day restriction behavior',
    'eligible seed IDs and level requirements for the account',
    'successful online plant/harvest/claim/purchase responses',
  ],
};

fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ output: path.relative(root, outputPath), operationCount: operations.length }));

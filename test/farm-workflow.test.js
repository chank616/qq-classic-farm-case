'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { runWorkflow, rankSeeds, chinaDay, stockFromBag, batchPlan } = require('../client/farm-workflow');

function fixture(options = {}) {
  let time = 1792239000;
  let plots = [{ id: 1, unlocked: true, plant: { id: 1020102, name: '马蹄莲', left_inorc_fert_times: 1,
    phases: [{ begin_time: time - 100 }, { begin_time: options.mature ? time - 10 : time + 5000 }] } }];
  if (options.twoPlots) plots.push({ ...structuredClone(plots[0]), id: 2 });
  if (options.wholeFarm) plots = Array.from({ length: 24 }, (_, i) => ({ ...structuredClone(plots[0]), id: i + 1 }));
  if (options.staggeredMaturity) plots[0].plant.phases.at(-1).begin_time = time - 10;
  if (options.staggeredGrowth) plots.at(-1).plant.phases[0].begin_time = time + 1000;
  if (options.partialEmpty) plots[0].plant = null;
  let stock = options.fertilizer === false ? 0 : options.fertilizerStock ?? 500000;
  let organic = options.organicStock || 0, points = options.points || 0;
  const packs = new Map(Object.entries(options.packs || {}).map(([id, count]) => [Number(id), count]));
  let seeds = options.ownedSeeds || 0;
  const daily = [
    { id: 200019, task_type: 2, cond_type: 16, is_unlocked: true, progress: 1, total_progress: 1, is_claimed: true },
    { id: 200020, task_type: 2, cond_type: 17, is_unlocked: true, progress: 0, total_progress: 1 },
    { id: 200021, task_type: 2, cond_type: 18, is_unlocked: true, progress: 0, total_progress: 1 },
  ];
  const calls = [];
  async function rpc(service, method, value) {
    calls.push({ method, value });
    let decoded = {};
    if (method === options.failMethod) return { err: 99, msg: 'fixture rejection', decoded };
    if (method === 'TaskInfo') decoded = { task_info: { tasks: options.hideDaily ? [] : daily } };
    if (method === 'AllLands') decoded = value.host_gid === 'friend' ? { lands: [{ id: 99, plant: { phases: [{ begin_time: time - 500, dry_time: time - 5 }] } }] } : { lands: plots };
    if (method === 'GetBag') decoded = { virtual_items: [{ id: 1011, count: stock }, { id: 1012, count: organic }, { id: 1002, count: points }],
      physical_items: [{ id: 20102, count: seeds }, ...[...packs].filter(([, count]) => count > 0).map(([id, count]) => ({ id, count, uid: id }))] };
    if (method === 'Fertilize') { for (const l of plots.filter(l => value.land_ids.includes(l.id))) {
      const cost = l.plant.phases.at(-1).begin_time - time;
      if (Number(value.fertilizer_id) === 1011) { assert.ok(stock >= cost); stock -= cost; }
      else { assert.ok(organic >= cost); organic -= cost; }
      l.plant.phases.at(-1).begin_time = time - 1;
    } }
    if (method === 'Use' && !options.useNoEffect) {
      const { id, count } = value.item; assert.ok((packs.get(id) || 0) >= count);
      packs.set(id, packs.get(id) - count);
      if (id === 100003) packs.set(80001, (packs.get(80001) || 0) + count);
      else {
        const [type, seconds] = require('../client/fertilizer-budget').ITEMS[id];
        if (type === 1011) stock += seconds * count; else organic += seconds * count;
      }
    }
    if (method === 'Purchase') {
      const product = options.products.find(p => p.id === value.id);
      points -= product.price.count * value.buy_num;
      if (!options.purchaseNoReward) for (const item of product.items) packs.set(item.id, (packs.get(item.id) || 0) + item.count * value.buy_num);
      decoded = { success: true };
    }
    if (method === 'Harvest') {
      if (!String(value.host_gid).startsWith('friend')) plots = plots.map(l => value.land_ids.includes(l.id) && !(options.partialHarvest && l.id === plots.length) ? { ...l, plant: null } : l);
      if (!options.harvestNoProgress) daily[1].progress = 1;
    }
    if (method === 'ShopInfo') decoded = { goods_list: [
      { id: 158, item_id: 20102, unlocked: true, price: 50, item_count: 1, conds: [{ type: 1, param: 148 }] },
      { id: 159, item_id: 20103, unlocked: true, price: 999, item_count: 1, conds: [{ type: 1, param: 140 }] },
    ] };
    if (method === 'BuyGoods' && !options.missingSeeds) seeds += value.num;
    if (method === 'Plant') { seeds -= value.items[0].land_ids.length; plots = plots.map(l => value.items[0].land_ids.includes(l.id) ? { ...l, plant: { id: 1000000 + value.items[0].seed_id, phases: [{ begin_time: time + 100 }, { begin_time: time + 10000 }] } } : l); }
    const friendIds = options.twoFriends ? ['friend', 'friend2'] : ['friend'];
    if (method === 'GetBriefInfo') decoded = { friend_gids: options.noFriends ? [] : friendIds };
    if (method === 'Enter') decoded = { lands: [{ id: 99, plant: { dry_num: 1, stealable: !!options.stealable, left_fruit_num: 10,
      phases: [{ begin_time: time - 500, dry_time: time - 5 }, { begin_time: time - 10 }] } }] };
    if (method === 'GetGameFriends') { assert.deepEqual(value.friend_gids, friendIds); decoded = { friends: friendIds.map(gid => ({ gid, plant: { dry_num: 1, steal_plant_num: options.stealable ? 1 : 0 } })) }; }
    if (method === 'WaterLand') daily[2].progress = 1;
    if (method === 'BatchClaimTaskReward') for (const t of daily) if (value.ids.includes(t.id)) t.is_claimed = true;
    if (method === 'GetDailyGiftStatus' || method === 'GetQQVipRewardsStatus') decoded = { is_qq_vip: true, claimed_today: true };
    if (method === 'GetMallListBySlotType') decoded = { products: value.slot_type === 1 ? [{ id: 10, name: '免费化肥', is_free: true,
      restriction: { max_count: 1, current_count: 1 }, is_available_purchase: false, items: [{ id: 1011 }] }, ...(options.products || [])] : [] };
    return { err: 0, decoded: structuredClone(decoded) };
  }
  let previousFertilizerDecision = null;
  return { calls, advance: seconds => { time += seconds; }, resetDaily: () => {
    for (const t of daily) { t.is_claimed = false; t.progress = Number(t.cond_type) === 16 ? 1 : 0; }
  }, run: async opts => {
    const report = await runWorkflow({ rpc, basic: { gid: 'self', name: 'test', level: 149 }, now: () => time,
      ...opts, config: { batchSize: plots.length, previousFertilizerDecision, ...opts?.config } });
    if (!opts?.dry) previousFertilizerDecision = report.fertilizerDecisionState;
    return report;
  } };
}

test('highest level seed wins even when another seed is more expensive', () => {
  const sorted = rankSeeds([{ id: 1, unlocked: true, price: 999, conds: [{ type: 1, param: 10 }] },
    { id: 2, unlocked: true, price: 1, conds: [{ type: 1, param: 20 }] }], 30);
  assert.equal(sorted[0].id, 2);
});
test('live bag format preserves fertilizer seconds and sums seed stacks', () => {
  const bag = stockFromBag({ physical_items: [{ id: 20102, count: 2 }, { id: 20102, count: 3 }], virtual_items: [{ id: 1011, count: 289739 }] });
  assert.equal(bag.get(20102), 5);
  assert.equal(bag.get(1011), 289739);
});
test('China day rolls over at 16:00 UTC', () => {
  assert.equal(chinaDay(Date.parse('2026-10-17T15:59:59Z')), '2026-10-17');
  assert.equal(chinaDay(Date.parse('2026-10-17T16:00:00Z')), '2026-10-18');
});
test('fertilize, harvest, buy exact shortage, replant and verify three tasks in the same pass', async () => {
  const f = fixture(); const report = await f.run();
  assert.equal(report.allRequiredComplete, true);
  assert.equal(report.daily.claimed, 3);
  const methods = f.calls.map(c => c.method);
  assert.ok(methods.indexOf('Fertilize') < methods.indexOf('Harvest'));
  assert.ok(methods.indexOf('Harvest') < methods.indexOf('Plant'));
  assert.equal(f.calls.find(c => c.method === 'BuyGoods').value.num, 1);
  assert.equal(f.calls.find(c => c.method === 'Plant').value.items[0].seed_id, 20102);
});
test('inspection never writes state and never passes overall acceptance', async () => {
  const f = fixture(); const report = await f.run({ dry: true });
  const writes = ['Harvest', 'Fertilize', 'Plant', 'BuyGoods', 'WaterLand', 'Enter', 'Leave', 'Purchase', 'BatchClaimTaskReward'];
  assert.equal(f.calls.some(c => writes.includes(c.method)), false);
  assert.equal(report.allRequiredComplete, false);
  assert.equal(report.status, 'inspection-only');
});
test('missing daily list remains pending', async () => {
  const f = fixture({ hideDaily: true }); const report = await f.run();
  assert.equal(report.allRequiredComplete, false);
  assert.ok(report.checks.some(c => c.id === 'daily-tasks' && c.status === 'pending'));
});
test('no friends cannot be reported as completed interaction', async () => {
  const report = await fixture({ noFriends: true }).run();
  assert.equal(report.allRequiredComplete, false);
  assert.ok(report.checks.some(c => c.id === 'friend-interaction' && c.status === 'pending'));
});
test('accepted purchase without enough seeds stops before planting', async () => {
  const f = fixture({ mature: true, missingSeeds: true }); const report = await f.run();
  assert.equal(report.allRequiredComplete, false);
  assert.equal(f.calls.some(c => c.method === 'Plant'), false);
  assert.ok(report.checks.some(c => c.id === 'farm' && c.status === 'failed'));
});
test('failed harvest cannot be promoted to complete', async () => {
  const f = fixture({ mature: true, failMethod: 'Harvest' }); const report = await f.run();
  assert.equal(report.allRequiredComplete, false);
  assert.equal(f.calls.some(c => c.method === 'Plant'), false);
});
test('existing seeds are used without buying an unnecessary pack', async () => {
  const f = fixture({ mature: true, ownedSeeds: 1 }); const report = await f.run();
  assert.equal(report.allRequiredComplete, true);
  assert.equal(f.calls.some(c => c.method === 'BuyGoods'), false);
});
test('unripe crops are preserved; no fertilizer purchase and no crop removal', async () => {
  const f = fixture({ fertilizer: false }); const report = await f.run();
  assert.equal(report.allRequiredComplete, false);
  assert.equal(f.calls.some(c => ['RemovePlant', 'Harvest', 'Purchase'].includes(c.method)), false);
});
test('limited fertilizer preserves the entire batch instead of ripening a subset', async () => {
  const f = fixture({ twoPlots: true, fertilizerStock: 6000 }); const report = await f.run();
  assert.equal(f.calls.some(c => ['Fertilize', 'Harvest', 'Plant'].includes(c.method)), false);
  assert.equal(report.farm.occupied, 2);
  assert.equal(report.cropClock.batchFertilizeAt, 0);
});
test('only the missing seed quantity is purchased for multiple empty plots', async () => {
  const f = fixture({ twoPlots: true, mature: true, ownedSeeds: 1 }); const report = await f.run();
  assert.equal(f.calls.find(c => c.method === 'BuyGoods').value.num, 1);
  assert.equal(report.farm.planted.verified, 2);
});
test('reward rejection is retained as failed even when gameplay progress is complete', async () => {
  const f = fixture({ failMethod: 'BatchClaimTaskReward' }); const report = await f.run();
  assert.equal(report.allRequiredComplete, false);
  assert.ok(report.checks.some(c => c.id === 'daily-tasks' && c.status === 'failed'));
});
test('one friend harvest completes picking task while our unripe crops remain untouched', async () => {
  const f = fixture({ fertilizer: false, stealable: true }); const report = await f.run();
  const harvests = f.calls.filter(c => c.method === 'Harvest');
  assert.equal(harvests.length, 1);
  assert.equal(harvests[0].value.host_gid, 'friend');
  assert.deepEqual(harvests[0].value.land_ids, [99]);
  assert.equal(report.friendHarvest.taskProgressVerified, true);
  assert.equal(report.daily.claimed, 3);
  assert.equal(report.allRequiredComplete, true);
  assert.equal(f.calls.some(c => ['Plant', 'BuyGoods', 'Fertilize'].includes(c.method)), false);
});
test('accepted friend harvest without task progress stays pending and does not steal again', async () => {
  const f = fixture({ fertilizer: false, stealable: true, twoFriends: true, harvestNoProgress: true }); const report = await f.run();
  assert.equal(f.calls.filter(c => c.method === 'Harvest').length, 1);
  assert.equal(report.friendHarvest.taskProgressVerified, false);
  assert.equal(report.allRequiredComplete, false);
});
test('inspection does not enter a friend farm or steal crops', async () => {
  const f = fixture({ fertilizer: false, stealable: true }); const report = await f.run({ dry: true });
  assert.equal(f.calls.some(c => c.method === 'Harvest' || c.method === 'Enter'), false);
  assert.equal(report.allRequiredComplete, false);
});

test('one early mature land waits for the other 23; the whole batch is harvested and planted once', async () => {
  const f = fixture({ wholeFarm: true, staggeredMaturity: true, fertilizer: false });
  const waiting = await f.run();
  assert.equal(f.calls.some(c => ['Harvest', 'Plant'].includes(c.method)), false);
  assert.equal(waiting.cropClock.batchMatureAt, 1792239000 + 5000);
  f.advance(5000);
  await f.run();
  assert.equal(f.calls.filter(c => c.method === 'Harvest').length, 1);
  assert.equal(f.calls.find(c => c.method === 'Harvest').value.land_ids.length, 24);
  assert.equal(f.calls.filter(c => c.method === 'Plant').length, 1);
  assert.equal(f.calls.find(c => c.method === 'Plant').value.items[0].land_ids.length, 24);
});

test('batch fertilizer waits for the last growth stage, then ripens all 24 together', async () => {
  const f = fixture({ wholeFarm: true, staggeredGrowth: true });
  const waiting = await f.run();
  assert.equal(waiting.cropClock.batchFertilizeAt, 1792239000 + 1000);
  assert.equal(f.calls.some(c => ['Fertilize', 'Harvest', 'Plant'].includes(c.method)), false);
  f.advance(1000);
  const ready = await f.run();
  assert.equal(ready.farm.harvest.verified, 24);
  assert.equal(ready.farm.planted.verified, 24);
  assert.equal(f.calls.filter(c => c.method === 'Fertilize').length, 1);
  assert.equal(f.calls.find(c => c.method === 'Fertilize').value.land_ids.length, 24);
});

test('a small fertilizer balance never splits a 24-land batch', async () => {
  const f = fixture({ wholeFarm: true, fertilizerStock: 6000 });
  const report = await f.run();
  assert.equal(f.calls.some(c => ['Fertilize', 'Harvest', 'Plant'].includes(c.method)), false);
  assert.equal(report.cropClock.batchFertilizeAt, 0);
  assert.equal(report.cropClock.batchMatureAt, 1792239000 + 5000);
});

test('24-land cycles continue after daily completion, and refreshed daily tasks do not disturb the growing batch', async () => {
  const f = fixture({ wholeFarm: true, stealable: true });
  assert.equal((await f.run()).allRequiredComplete, true);
  f.advance(10000);
  const second = await f.run();
  assert.equal(second.farm.harvest.verified, 24);
  assert.equal(second.farm.planted.verified, 24);
  const ownHarvests = () => f.calls.filter(c => c.method === 'Harvest' && c.value.host_gid === 'self');
  assert.equal(ownHarvests().length, 2);
  assert.equal(f.calls.filter(c => c.method === 'Plant').length, 2);
  await f.run();
  assert.equal(ownHarvests().length, 2);
  f.resetDaily();
  const refreshed = await f.run();
  assert.equal(refreshed.daily.claimed, 3);
  assert.equal(ownHarvests().length, 2);
  assert.equal(f.calls.filter(c => c.method === 'Plant').length, 2);
  assert.equal(f.calls.filter(c => c.method === 'Harvest' && c.value.host_gid === 'friend').length, 1);
});

test('existing empty lands wait for the remaining old crops before all 24 are planted', async () => {
  const f = fixture({ wholeFarm: true, partialEmpty: true, fertilizer: false });
  await f.run();
  assert.equal(f.calls.some(c => c.method === 'Plant'), false);
  f.advance(5000);
  await f.run();
  assert.equal(f.calls.find(c => c.method === 'Harvest').value.land_ids.length, 23);
  assert.equal(f.calls.find(c => c.method === 'Plant').value.items[0].land_ids.length, 24);
});

test('partially successful batch harvest cannot start a new planting batch', async () => {
  const f = fixture({ wholeFarm: true, mature: true, partialHarvest: true });
  const report = await f.run();
  assert.equal(report.allRequiredComplete, false);
  assert.equal(f.calls.some(c => c.method === 'Plant'), false);
  assert.ok(report.checks.some(c => c.id === 'harvest' && c.status === 'failed'));
});

test('an incomplete server land list cannot be operated as the whole farm', async () => {
  const f = fixture({ twoPlots: true, mature: true });
  const report = await f.run({ config: { batchSize: 24 } });
  assert.equal(report.allRequiredComplete, false);
  assert.equal(f.calls.some(c => c.value?.host_gid === 'self' && c.method === 'Harvest' || c.method === 'Plant'), false);
});

test('ordinary and organic containers complete one batch without opening packs or spending points', async () => {
  const f = fixture({ wholeFarm: true, fertilizerStock: 60000, organicStock: 60000, packs: { 80001: 2 } });
  const report = await f.run();
  assert.equal(report.farm.harvest.verified, 24);
  assert.equal(report.farm.planted.verified, 24);
  assert.equal(f.calls.filter(c => c.method === 'Fertilize').length, 2);
  assert.equal(f.calls.some(c => ['Use', 'Purchase'].includes(c.method)), false);
});

test('unused fertilizer items are opened only to cover the whole batch deficit', async () => {
  const f = fixture({ fertilizer: false, packs: { 80003: 2 } });
  const report = await f.run();
  assert.equal(report.farm.harvest.verified, 1);
  assert.equal(f.calls.find(c => c.method === 'Use').value.item.count, 1);
  assert.equal(report.fertilizer.normalBagSec, 28800);
});

const pointFertilizer = { id: 1003, slot_type: 1, price: { id: 1002, count: 34 },
  items: [{ id: 80001, count: 2 }, { id: 80003, count: 1 }] };

test('a point purchase covers only the missing fertilizer and is verified before the batch is fertilized', async () => {
  const f = fixture({ wholeFarm: true, fertilizerStock: 110000, points: 100, products: [pointFertilizer] });
  const report = await f.run();
  assert.equal(report.farm.harvest.verified, 24);
  const purchases = f.calls.filter(c => c.method === 'Purchase');
  assert.equal(purchases.length, 1); assert.equal(purchases[0].value.buy_num, 1);
  assert.equal(report.fertilizer.points, 66);
  assert.ok(f.calls.findIndex(c => c.method === 'Purchase') < f.calls.findIndex(c => c.method === 'Use'));
  assert.ok(f.calls.findIndex(c => c.method === 'Use') < f.calls.findIndex(c => c.method === 'Fertilize'));
});

test('fertilizer is not purchased before the last plot enters its final stage', async () => {
  const f = fixture({ wholeFarm: true, staggeredGrowth: true, fertilizer: false, points: 500, products: [pointFertilizer] });
  const report = await f.run();
  assert.ok(report.fertilizer.pointsCost > 0);
  assert.ok(report.cropClock.batchFertilizeAt > 0);
  assert.equal(f.calls.some(c => ['Purchase', 'Use', 'Fertilize', 'Plant'].includes(c.method)), false);
});

test('unverified paid rewards stop the batch before any fertilizer is applied', async () => {
  const f = fixture({ wholeFarm: true, fertilizerStock: 110000, points: 100, products: [pointFertilizer], purchaseNoReward: true });
  const report = await f.run();
  assert.equal(report.allRequiredComplete, false);
  assert.equal(f.calls.some(c => ['Fertilize', 'Plant'].includes(c.method)), false);
});

test('an accepted item use without the container increase cannot trigger fertilizer application', async () => {
  const f = fixture({ fertilizer: false, packs: { 80003: 1 }, useNoEffect: true });
  const report = await f.run();
  assert.equal(report.allRequiredComplete, false);
  assert.equal(f.calls.some(c => c.method === 'Fertilize'), false);
});

test('a fertilizer-only gift box is opened and the returned inventory is counted without guessing its duration', async () => {
  const f = fixture({ wholeFarm: true, staggeredGrowth: true, packs: { 100003: 1 } });
  const report = await f.run();
  assert.equal(f.calls.find(c => c.method === 'Use').value.item.id, 100003);
  assert.equal(report.fertilizer.normalBagSec, 3600);
  assert.equal(report.fertilizer.unresolvedBoxes, 0);
});

test('once the final-stage budget is insufficient the batch waits for natural maturity across later passes', async () => {
  const f = fixture({ twoPlots: true, fertilizerStock: 6000 });
  const first = await f.run(); assert.equal(first.fertilizer.waitNatural, true);
  f.advance(3000);
  await f.run();
  assert.equal(f.calls.some(c => c.method === 'Fertilize'), false);
  f.advance(2000); await f.run();
  assert.equal(f.calls.find(c => c.method === 'Harvest').value.land_ids.length, 2);
});

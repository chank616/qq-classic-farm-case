'use strict';
const itemCatalog = require('./item-catalog.json');
const { ITEMS, inventory, offersFromProducts, planSupply } = require('./fertilizer-budget');

const S = {
  plant: 'gamepb.plantpb.PlantService', task: 'gamepb.taskpb.TaskService',
  item: 'gamepb.itempb.ItemService', shop: 'gamepb.shoppb.ShopService',
  vip: 'gamepb.qqvippb.QQVipService', mall: 'gamepb.mallpb.MallService',
  friend: 'gamepb.friendpb.FriendService', visit: 'gamepb.visitpb.VisitService',
};

function chinaDay(millis = Date.now()) {
  return new Date(millis + 8 * 3600000).toISOString().slice(0, 10);
}
function matureAt(plant) { return Number(plant?.phases?.at(-1)?.begin_time) || 0; }
function growAt(plant) { return Number(plant?.phases?.at(-2)?.begin_time) || 0; }
function needsCare(land, method) {
  const p = land.plant;
  if (!p) return false;
  if (method === 'WaterLand') return Number(p.dry_num) > 0;
  return (p[method === 'WeedOut' ? 'weed_owners' : 'insect_owners'] || []).length > 0;
}
function allTasks(info) {
  return [...new Map([...(info.tasks || []), ...(info.daily_tasks || []), ...(info.growth_tasks || [])]
    .map(t => [String(t.id), t])).values()];
}
function dailyTasks(info) {
  const dedicated = new Set((info.daily_tasks || []).map(t => String(t.id)));
  return allTasks(info).filter(t => Number(t.task_type) === 2 || dedicated.has(String(t.id)));
}
function taskView(t) {
  return { id: String(t.id), desc: t.desc || '', cond: Number(t.cond_type), progress: Number(t.progress || 0),
    total: Number(t.total_progress || 0), claimed: !!t.is_claimed, unlocked: !!t.is_unlocked };
}
function stockFromBag(bag) {
  const stock = new Map();
  for (const item of [...(bag.physical_items || bag.props || bag.items || []), ...(bag.virtual_items || bag.currency || [])]) {
    const id = Number(item.id ?? item.item_id);
    stock.set(id, (stock.get(id) || 0) + Number(item.count || 0));
  }
  return stock;
}
function rankSeeds(goods, level) {
  // Only compare known level gates, never prices. The catalogue's unlocked flag
  // remains authoritative for all additional unlock conditions.
  return goods.filter(g => g.unlocked).map(g => {
    const levels = (g.conds || []).filter(c => Number(c.type) === 1).map(c => Number(c.param));
    return { ...g, requiredLevel: levels.length ? Math.max(...levels) : null };
  }).filter(g => g.requiredLevel !== null && g.requiredLevel <= level)
    .sort((a, b) => b.requiredLevel - a.requiredLevel || Number(a.id) - Number(b.id));
}

function batchPlan(plots, time, fertilizer, useFertilizer = true) {
  const occupied = plots.filter(l => l.plant);
  const valid = occupied.every(l => matureAt(l.plant) > 0);
  const unripe = occupied.filter(l => matureAt(l.plant) > time);
  const batchMatureAt = valid && occupied.length ? Math.max(...occupied.map(l => matureAt(l.plant))) : 0;
  const growthKnown = unripe.length > 0 && unripe.every(l => growAt(l.plant) > 0);
  const lastGrowth = growthKnown ? Math.max(...unripe.map(l => growAt(l.plant))) : 0;
  const need = growthKnown ? unripe.reduce((sum, l) => sum + Math.max(0, matureAt(l.plant) - Math.max(time, lastGrowth)), 0) : 0;
  const canFertilize = valid && growthKnown && useFertilizer && fertilizer >= need;
  return { mode: 'whole-farm', totalLands: plots.length, occupied: occupied.length,
    batchMatureAt, batchFertilizeAt: canFertilize ? lastGrowth : 0, fertilizerNeedSec: need,
    readyToFertilize: canFertilize && lastGrowth <= time,
    readyToHarvest: valid && occupied.length > 0 && unripe.length === 0,
    unripeIds: unripe.map(l => Number(l.id)) };
}

async function runWorkflow({ rpc, basic, scene = 1, dry = false, emit = () => {}, now = () => Math.floor(Date.now() / 1000), config = {} }) {
  const checks = [];
  const operations = [];
  const report = { schemaVersion: 1, day: chinaDay(now() * 1000), mode: dry ? 'inspection' : 'execute',
    startedAt: new Date().toISOString(), account: { gid: String(basic.gid), name: basic.name, level: Number(basic.level) },
    checks, operations, allRequiredComplete: false, completed: false };
  const check = (id, status, detail) => { const c = { id, status, detail }; checks.push(c); return c; };
  async function read(service, method, value = {}) {
    const r = await rpc(service, method, value);
    if (r.err !== 0 || !r.decoded) throw new Error(method + ': ' + r.err + ' ' + (r.msg || 'missing decoded state'));
    return r.decoded;
  }
  async function act(service, method, value = {}) {
    if (dry) { operations.push({ method, status: 'would-run' }); return null; }
    const r = await rpc(service, method, value);
    const op = { method, err: r.err, status: r.err === 0 ? 'server-accepted' : 'failed', msg: r.msg || '',
      ...(method === 'Use' ? { itemId: Number(value.item.id), count: Number(value.item.count) } : {}),
      ...(method === 'Purchase' ? { productId: Number(value.id), count: Number(value.buy_num) } : {}),
      ...(method === 'Fertilize' ? { fertilizerId: Number(value.fertilizer_id), landIds: value.land_ids } : {}) };
    operations.push(op);
    emit({ type: 'operation-detail', ...op });
    if (r.err !== 0) throw new Error(method + ': ' + r.err + ' ' + (r.msg || ''));
    return r.decoded;
  }
  async function stage(id, fn) {
    try { await fn(); } catch (error) { check(id, 'failed', String(error.message || error)); }
  }
  async function lands() {
    const plots = (await read(S.plant, 'AllLands', { host_gid: basic.gid })).lands.filter(l => l.unlocked);
    const expected = config.batchSize ?? 24;
    if (plots.length !== expected || new Set(plots.map(l => String(l.id))).size !== expected)
      throw new Error('Whole-farm batch requires ' + expected + ' distinct lands; server returned ' + plots.length);
    return plots;
  }
  async function resources(tab = 2) {
    return stockFromBag(await read(S.item, 'GetBag', { global_scene_id: scene, tab_id: tab }));
  }
  async function fertilizerStock() {
    return inventory(await read(S.item, 'GetBag', { global_scene_id: scene, tab_id: 0 }), now());
  }
  let mallSlots;
  async function fertilizerOffers() {
    if (!mallSlots) {
      const profiles = await read(S.mall, 'GetMallProfiles', { global_scene_id: scene });
      mallSlots = [...new Set((profiles.mall_profiles || []).map(p => Number(p.mall_type)).filter(n => n > 0))];
      if (!mallSlots.length) mallSlots = [1, 4, 5];
    }
    const products = [];
    for (const slot of mallSlots) products.push(...(await read(S.mall, 'GetMallListBySlotType', {
      slot_type: slot, global_scene_id: scene, is_manual_open: false })).products || []);
    return offersFromProducts(products, now());
  }
  async function useInventoryItem(item, count) {
    const before = await fertilizerStock();
    await act(S.item, 'Use', { item: { id: Number(item.id), uid: Number(item.uid || 0), count }, target: { host_gid: basic.gid } });
    if (dry) return before;
    const after = await fertilizerStock();
    const remaining = after.physical.filter(i => Number(i.id) === Number(item.id) && Number(i.uid || 0) === Number(item.uid || 0))
      .reduce((sum, i) => sum + Number(i.count), 0);
    if (remaining > Number(item.count) - count) throw new Error('Used fertilizer item did not decrease on bag recheck');
    if (ITEMS[Number(item.id)]) {
      const [type, seconds] = ITEMS[Number(item.id)];
      if (after.bucket[type] - before.bucket[type] !== seconds * count) throw new Error('Fertilizer container increase was not verified');
    }
    return after;
  }
  let current = [];
  let taskInfo = null;
  let normalFert = 0;
  let fertilizerDecision = config.previousFertilizerDecision || null;
  const cycleKey = plots => plots.filter(l => l.plant).map(l => [Number(l.id), Number(l.plant.id), matureAt(l.plant)])
    .sort((a, b) => a[0] - b[0]).map(x => x.join(':')).join('|');
  function respectNaturalWait(supply, plots) {
    const key = cycleKey(plots);
    if (fertilizerDecision?.cycleKey === key && fertilizerDecision.waitNatural) {
      supply.sufficient = false; supply.ready = false; supply.batchFertilizeAt = 0; supply.purchases = []; supply.pointsCost = 0;
      supply.waitNatural = true;
    } else if (supply.phaseAt > 0 && supply.phaseAt <= now() && !supply.sufficient) {
      fertilizerDecision = { cycleKey: key, waitNatural: true, decidedAt: now() }; supply.waitNatural = true;
    } else if (fertilizerDecision?.cycleKey !== key) fertilizerDecision = null;
    return supply;
  }
  const harvest = { attempted: 0, verified: 0 };
  const planted = { attempted: 0, verified: 0 };
  check('login', 'passed', 'Login and PlayerLogin accepted by server');

  await stage('task-discovery', async () => {
    taskInfo = (await read(S.task, 'TaskInfo', { global_scene_id: scene })).task_info;
    if (!taskInfo) throw new Error('TaskInfo contains no task_info');
    report.tasksBefore = allTasks(taskInfo).map(taskView);
    emit({ type: 'tasks-snapshot-detail', day: report.day, tasks: report.tasksBefore });
  });

  await stage('farm', async () => {
    current = await lands();
    for (const method of ['WaterLand', 'WeedOut', 'Insecticide']) {
      const targets = current.filter(l => needsCare(l, method));
      if (!targets.length) continue;
      await act(S.plant, method, { land_ids: targets.map(l => Number(l.id)), host_gid: basic.gid, host_type: 0, reason: 0 });
      if (!dry) {
        current = await lands();
        check('care-' + method, targets.every(t => !needsCare(current.find(l => String(l.id) === String(t.id)) || {}, method)) ? 'passed' : 'failed',
          { attempted: targets.length });
      }
    }
    let stock = await fertilizerStock();
    // Resolve fertilizer-only boxes instead of assigning an invented duration.
    if (!dry && stock.boxes.length) await stage('fertilizer-unpack', async () => {
      for (const box of stock.boxes) stock = await useInventoryItem(box, Number(box.count));
      check('fertilizer-unpack', 'passed', 'Fertilizer boxes opened and inventory re-read');
    });
    stock = await fertilizerStock();
    normalFert = stock.bucket[1011];
    const catalogue = await read(S.shop, 'ShopInfo', { shop_id: 2 });
    const best = rankSeeds(catalogue.goods_list || [], Number(basic.level))[0];
    if (!best) throw new Error('No seed with verified level condition is available');
    report.selectedSeed = { id: Number(best.item_id), goodsId: Number(best.id), requiredLevel: best.requiredLevel };
    check('seed-selection', 'passed', report.selectedSeed);
    const offers = await fertilizerOffers();
    const supply = respectNaturalWait(planSupply(current, now(), stock, offers), current);
    report.fertilizerDecision = supply;
    if (current.some(l => l.plant && matureAt(l.plant) > now())) {
      emit({ type: 'fert-budget', needSec: supply.needSec, haveSec: supply.ownedTotalSec });
      if (supply.ready && config.useFertilizer !== false) {
        if (dry) {
          for (const group of supply.groups) await act(S.plant, 'Fertilize', { land_ids: group.landIds, fertilizer_id: group.fertilizerId });
          check('fertilize', 'unverified', 'Inspection did not purchase, unpack, or fertilize');
        } else {
          for (const purchase of supply.purchases) {
            const before = stock;
            const result = await act(S.mall, 'Purchase', { id: purchase.id, buy_num: purchase.count });
            stock = await fertilizerStock();
            if (!result?.success || before.points - stock.points !== purchase.price * purchase.count ||
              stock.bucket[1011] + stock.packed[1011] - before.bucket[1011] - before.packed[1011] < purchase.normalSec * purchase.count ||
              stock.bucket[1012] + stock.packed[1012] - before.bucket[1012] - before.packed[1012] < purchase.organicSec * purchase.count)
              throw new Error('Point fertilizer purchase not verified by currency and inventory');
          }
          const ownedPlan = planSupply(current, now(), stock);
          if (!ownedPlan.sufficient) throw new Error('Whole-batch fertilizer is insufficient after purchase');
          for (const group of ownedPlan.groups) {
            let missing = group.needSec - stock.bucket[group.fertilizerId];
            while (missing > 0) {
              const packs = stock.physical.filter(i => ITEMS[Number(i.id)]?.[0] === group.fertilizerId)
                .sort((a, b) => ITEMS[Number(b.id)][1] - ITEMS[Number(a.id)][1]);
              const item = packs.find(i => ITEMS[Number(i.id)][1] <= missing) || packs.at(-1);
              if (!item) throw new Error('No usable fertilizer item covers the verified deficit');
              const count = Math.min(Number(item.count), Math.ceil(missing / ITEMS[Number(item.id)][1]));
              stock = await useInventoryItem(item, count);
              missing = group.needSec - stock.bucket[group.fertilizerId];
            }
          }
          const ready = planSupply(current, now(), { ...stock, packed: { 1011: 0, 1012: 0 } });
          if (!ready.ready) throw new Error('Whole-batch fertilizer containers are not ready');
          // Two fertilizer types may serve one batch. Harvest starts only after
          // every land has been rechecked as ripe, even if either RPC fails.
          for (const group of ready.groups) await act(S.plant, 'Fertilize', { land_ids: group.landIds, fertilizer_id: group.fertilizerId });
          current = await lands();
          const verified = batchPlan(current, now(), 0).readyToHarvest;
          check('fertilize', verified ? 'passed' : 'failed', { lands: ready.groups.reduce((n, g) => n + g.landIds.length, 0), wholeBatchMature: verified });
          normalFert = (await fertilizerStock()).bucket[1011];
        }
      } else check('fertilize', 'not-due', { reason: supply.sufficient ? 'wait-for-whole-batch-final-stage' : 'wait-for-natural-maturity',
        needSec: supply.needSec, ownedSec: supply.ownedTotalSec, pointsCost: supply.pointsCost, batchFertilizeAt: supply.batchFertilizeAt });
    }
    // Harvest only after the last occupied land is ripe. Never split the batch.
    const mature = current.filter(l => l.plant && matureAt(l.plant) > 0 && matureAt(l.plant) <= now());
    if (batchPlan(current, now(), normalFert).readyToHarvest) {
      harvest.attempted = mature.length;
      await act(S.plant, 'Harvest', { land_ids: mature.map(l => Number(l.id)), host_gid: basic.gid, is_all: false, host_type: 0, reason: 0 });
      if (!dry) {
        current = await lands();
        harvest.verified = mature.filter(t => current.some(l => String(l.id) === String(t.id) && (!l.plant || matureAt(l.plant) > now()))).length;
      }
      check('harvest', dry ? 'unverified' : harvest.verified === harvest.attempted ? 'passed' : 'failed', harvest);
      if (!dry && harvest.verified !== harvest.attempted) throw new Error('Whole-batch harvest is not verified; do not start planting');
    } else check('harvest', 'not-due', 'Waiting for the entire batch to mature');

    const empty = current.filter(l => !l.plant);
    if (empty.length === current.length) {
      const seedId = Number(best.item_id);
      const seedBag = await resources(3);
      const owned = seedBag.get(seedId) || 0;
      const shortage = Math.max(0, empty.length - owned);
      if (shortage) {
        const quantity = Math.ceil(shortage / Math.max(1, Number(best.item_count) || 1));
        await act(S.shop, 'BuyGoods', { goods_id: Number(best.id), num: quantity, price: Number(best.price), auto_add: true });
        if (!dry && ((await resources(3)).get(seedId) || 0) < empty.length) throw new Error('Purchased seeds are insufficient on bag recheck');
      }
      planted.attempted = empty.length;
      await act(S.plant, 'Plant', { items: [{ seed_id: seedId, land_ids: empty.map(l => Number(l.id)), auto_slave: false }] });
      if (!dry) {
        current = await lands();
        planted.verified = empty.filter(t => current.some(l => String(l.id) === String(t.id) && l.plant && Number(l.plant.id) === 1000000 + seedId)).length;
      }
      check('replant', dry ? 'unverified' : planted.verified === planted.attempted ? 'passed' : 'failed', { ...planted, seedId });
    } else check('replant', 'not-due', 'Waiting for the whole batch to be harvested');
    report.farm = { mode: 'whole-farm', harvest, planted, totalLands: current.length, occupied: current.filter(l => l.plant).length };
    if (planted.attempted && current.some(l => !l.plant) && !dry) throw new Error('Whole-batch planting is not verified');
  });

  await stage('daily-tasks', async () => {
    let info = (await read(S.task, 'TaskInfo', { global_scene_id: scene })).task_info;
    const daily = dailyTasks(info);
    if (daily.length < 3) {
      check('daily-tasks', 'pending', { reason: 'server-did-not-return-three-daily-tasks', observed: daily.map(taskView) });
    }
    let cachedFriends;
    async function getFriends() {
      if (cachedFriends) return cachedFriends;
      const brief = await read(S.friend, 'GetBriefInfo', { global_scene_id: scene });
      const gids = brief.friend_gids || [];
      cachedFriends = gids.length ? (await read(S.friend, 'GetGameFriends', { friend_gids: gids, global_scene_id: scene })).friends || [] : [];
      return cachedFriends;
    }
    const harvestTask = daily.find(t => Number(t.cond_type) === 17 && !t.is_claimed && Number(t.progress || 0) < Number(t.total_progress));
    if (harvestTask && !dry) {
      const candidates = (await getFriends()).filter(f => !f.is_banned && String(f.gid) !== String(basic.gid) &&
        (Number(f.plant?.steal_plant_num) > 0 || (Number(f.plant?.ripe_time_sec) > 0 && Number(f.plant.ripe_time_sec) <= now())))
        .sort((a, b) => Number(b.plant?.steal_plant_num || 0) - Number(a.plant?.steal_plant_num || 0));
      let verified = false;
      let accepted = false;
      const attempts = [];
      for (const friend of candidates.slice(0, 20)) {
        const host = friend.gid;
        const hostType = Number(friend.host_type) || 0;
        const entered = await act(S.visit, 'Enter', { host_gid: host, host_type: hostType, reason: 0 });
        try {
          const land = (entered?.lands || []).find(l => l.plant?.stealable && Number(l.plant.left_fruit_num) > 0 &&
            matureAt(l.plant) > 0 && matureAt(l.plant) <= now());
          if (!land) continue;
          try {
            await act(S.plant, 'Harvest', { host_gid: host, host_type: hostType, land_ids: [Number(land.id)], is_all: false, reason: 0 });
            accepted = true;
            info = (await read(S.task, 'TaskInfo', { global_scene_id: scene })).task_info;
            const updated = allTasks(info).find(t => String(t.id) === String(harvestTask.id));
            verified = !!updated && Number(updated.progress) >= Number(updated.total_progress);
            report.friendHarvest = { host: String(host), land: Number(land.id), taskProgressVerified: verified };
          } catch (error) {
            if (!String(error.message).startsWith('Harvest:')) throw error;
            attempts.push({ host: String(host), error: error.message });
          }
        } finally { await act(S.visit, 'Leave', { host_gid: host, host_type: hostType }); }
        // At most one server-accepted harvest: do not keep stealing if task
        // progress is delayed or the task has a different requirement.
        if (accepted) break;
      }
      check('friend-harvest', verified ? 'passed' : 'pending', { accepted, taskProgressVerified: verified,
        reason: verified ? 'one-friend-crop-completed-harvest-task' : 'no-verified-friend-harvest', attempts });
    }
    const interaction = dailyTasks(info).find(t => Number(t.cond_type) === 18 && !t.is_claimed && Number(t.progress || 0) < Number(t.total_progress));
    if (interaction) {
      const list = await getFriends();
      if (!list.length) check('friend-interaction', 'pending', 'Server returned no game friends');
      else {
        let progressed = false;
        const helpful = f => Number(f.plant?.dry_num || 0) + Number(f.plant?.weed_num || 0) + Number(f.plant?.insect_num || 0);
        for (const friend of list.filter(f => !f.is_banned).sort((a, b) => helpful(b) - helpful(a)).slice(0, 20)) {
          const host = friend.gid || friend.uin;
          const hostType = Number(friend.host_type) || 0;
          if (!host || String(host) === String(basic.gid)) continue;
          const entered = await act(S.visit, 'Enter', { host_gid: host, host_type: hostType, reason: 0 });
          try {
            // AllLands always returns our own farm. A friend's authoritative
            // land state is part of VisitService.EnterReply.
            const fl = entered?.lands || [];
            const t = now();
            for (const method of ['WaterLand', 'WeedOut', 'Insecticide']) {
              const ids = fl.filter(l => needsCare(l, method))
                .map(l => Number(l.id));
              if (!ids.length) continue;
              await act(S.plant, method, { host_gid: host, host_type: hostType, land_ids: ids.slice(0, 1), reason: 0 });
              if (!dry) {
                info = (await read(S.task, 'TaskInfo', { global_scene_id: scene })).task_info;
                const updated = allTasks(info).find(t => String(t.id) === String(interaction.id));
                progressed = !!updated && Number(updated.progress) >= Number(updated.total_progress);
              }
              if (progressed) break;
            }
          } finally { await act(S.visit, 'Leave', { host_gid: host, host_type: hostType }); }
          if (progressed) break;
        }
        check('friend-interaction', progressed ? 'passed' : 'pending', progressed ? 'Task progress verified after real help operation' : 'No verified interaction yet');
      }
    }
    info = (await read(S.task, 'TaskInfo', { global_scene_id: scene })).task_info;
    const claimable = allTasks(info).filter(t => t.is_unlocked && !t.is_claimed && Number(t.progress || 0) >= Number(t.total_progress || 0))
      .map(t => Number(t.id));
    if (claimable.length) await act(S.task, 'BatchClaimTaskReward', { ids: claimable });
    info = (await read(S.task, 'TaskInfo', { global_scene_id: scene })).task_info;
    report.tasksAfter = allTasks(info).map(taskView);
    const final = dailyTasks(info);
    for (const task of final) {
      const condition = Number(task.cond_type);
      const label = ({ 16: 'task-login', 17: 'task-harvest', 18: 'task-friend' })[condition] || 'task-' + task.id;
      const detail = taskView(task);
      if (condition === 17 && !task.is_claimed) {
        const batch = batchPlan(current, now(), normalFert, config.useFertilizer !== false);
        detail.nextEligibleAt = batch.batchFertilizeAt || batch.batchMatureAt || null;
        detail.waitingFor = 'own-mature-crop-or-one-stealable-friend-crop';
      }
      check(label, task.is_claimed ? 'passed' : 'pending', detail);
    }
    if (daily.length >= 3) check('daily-tasks', !dry && final.length >= 3 && final.every(t => t.is_claimed) ? 'passed' : 'pending', final.map(taskView));
    // Unknown future tasks stay visible as pending instead of being fabricated
    // with ClientReportProgress. Login/harvest/help progress comes from gameplay.
    report.daily = { observed: final.length, claimed: final.filter(t => t.is_claimed).length,
      complete: !dry && final.length >= 3 && final.every(t => t.is_claimed), tasks: final.map(taskView) };
  });

  await stage('vip-daily', async () => {
    let gift = await read(S.vip, 'GetDailyGiftStatus');
    if (gift.claimed_today) { check('vip-daily', 'passed', 'Server confirms claimed_today'); return; }
    if (!gift.can_claim) { check('vip-daily', gift.is_qq_vip ? 'pending' : 'not-applicable', 'Server reports reward unavailable'); return; }
    await act(S.vip, 'ClaimDailyGift', { config_id: 1 });
    gift = await read(S.vip, 'GetDailyGiftStatus');
    check('vip-daily', !dry && gift.claimed_today ? 'passed' : 'unverified', { claimedToday: !!gift.claimed_today });
  });
  await stage('vip-rewards', async () => {
    let vip = await read(S.vip, 'GetQQVipRewardsStatus');
    if (vip.claimed_today) { check('vip-rewards', 'passed', 'Server confirms claimed_today'); return; }
    if (!vip.can_claim) { check('vip-rewards', vip.is_qq_vip ? 'pending' : 'not-applicable', 'No confirmed claim for today'); return; }
    const ids = (vip.active_configs || []).filter(c => c.is_enable).map(c => Number(c.id));
    if (!ids.length) throw new Error('VIP reward is claimable but has no enabled configuration');
    await act(S.vip, 'ClaimQQVipRewards', { config_ids: ids });
    vip = await read(S.vip, 'GetQQVipRewardsStatus');
    check('vip-rewards', !dry && vip.claimed_today ? 'passed' : 'unverified', { claimedToday: !!vip.claimed_today });
  });

  await stage('free-fertilizer', async () => {
    const products = [];
    let fertilizerFound = false;
    for (const slot of [1, 4, 5]) {
      const request = { slot_type: slot, is_manual_open: true, global_scene_id: scene };
      const initial = (await read(S.mall, 'GetMallListBySlotType', request)).products || [];
      for (const product of initial.filter(p => p.is_free)) {
        const fertilizer = (product.items || []).some(i => !!itemCatalog.items[Number(i.id ?? i.item_id)]) || /化肥/.test(product.name || '');
        fertilizerFound = fertilizerFound || fertilizer;
        let purchased = false;
        if (product.is_available_purchase && !product.ad_only) {
          const result = await act(S.mall, 'Purchase', { id: Number(product.id), buy_num: 1 });
          if (!dry && !result?.success) throw new Error('Free product ' + product.id + ' purchase returned success=false');
          purchased = !dry;
        }
        const updated = (await read(S.mall, 'GetMallListBySlotType', request)).products?.find(p => String(p.id) === String(product.id));
        const limit = updated?.restriction;
        const exhausted = !!limit && Number(limit.max_count) > 0 && Number(limit.current_count) >= Number(limit.max_count);
        const verified = exhausted || (purchased && updated && !updated.is_available_purchase);
        products.push({ id: Number(product.id), name: product.name, fertilizer, available: !!product.is_available_purchase,
          purchased, exhausted, verified, items: product.items });
      }
    }
    report.freeProducts = products;
    const required = products.filter(p => p.fertilizer);
    check('free-fertilizer', !fertilizerFound ? 'pending' : required.every(p => p.verified) && !dry ? 'passed' : 'unverified',
      { reason: fertilizerFound ? 'product-and-limit-recheck' : 'No identifiable free fertilizer product returned', products });
    const dailyBenefits = products.filter(p => p.fertilizer || /每日/.test(p.name || ''));
    check('free-benefits', dailyBenefits.length && dailyBenefits.every(p => p.verified) && !dry ? 'passed' : 'pending', dailyBenefits);
  });

  await stage('final-state', async () => {
    current = await lands();
    normalFert = (await resources()).get(1011) || 0;
    const t = now();
    const min = values => values.length ? Math.min(...values) : 0;
    const clocks = current.filter(l => l.plant).map(l => ({ id: Number(l.id), crop: l.plant.name,
      matureAt: matureAt(l.plant), growAt: growAt(l.plant) }));
    const nextMature = min(clocks.map(l => l.matureAt).filter(m => m > t));
    const nextFert = min(clocks.map(l => l.growAt).filter(g => g > t));
    const finalStock = await fertilizerStock();
    const supply = respectNaturalWait(planSupply(current, t, finalStock, await fertilizerOffers()), current);
    report.fertilizer = supply;
    report.fertilizerDecisionState = fertilizerDecision;
    const batch = batchPlan(current, t, normalFert, config.useFertilizer !== false);
    report.cropClock = { minMatureAt: nextMature, lastGrowAt: nextFert, planted: clocks.length, lands: clocks,
      batchMatureAt: batch.batchMatureAt, batchFertilizeAt: config.useFertilizer !== false ? supply.batchFertilizeAt : 0, mode: batch.mode,
      fertilizerNeedSec: supply.needSec };
    emit({ type: 'maturity', ...report.cropClock });
    emit({ type: 'fert-stock', total: normalFert / 3600, sec: normalFert });
    check('final-state', current.length > 0 && current.every(l => l.plant && matureAt(l.plant) > t) ? 'passed' : 'pending',
      { total: current.length, planted: clocks.length, matureRemaining: clocks.filter(l => l.matureAt <= t).length });
  });
  report.completed = true;
  report.fertilizerDecisionState = fertilizerDecision;
  report.finishedAt = new Date().toISOString();
  report.allRequiredComplete = !dry && checks.length > 0 && checks.every(c => ['passed', 'not-due', 'not-applicable'].includes(c.status))
    && report.daily?.complete === true;
  report.status = dry ? 'inspection-only' : report.allRequiredComplete ? 'verified' : 'incomplete';
  return report;
}

module.exports = { runWorkflow, chinaDay, matureAt, growAt, rankSeeds, dailyTasks, allTasks, stockFromBag, batchPlan };

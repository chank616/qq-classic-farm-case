'use strict';

const ITEMS = {
  80001: [1011, 3600], 80002: [1011, 14400], 80003: [1011, 28800], 80004: [1011, 43200],
  80011: [1012, 3600], 80012: [1012, 14400], 80013: [1012, 28800], 80014: [1012, 43200],
};
const BOXES = new Set([100003, 100004]);

function inventory(bag, time) {
  const virtual = new Map();
  for (const i of bag.virtual_items || []) virtual.set(Number(i.id), (virtual.get(Number(i.id)) || 0) + Number(i.count || 0));
  const physical = (bag.physical_items || []).filter(i => Number(i.count) > 0 &&
    !(Number(i.expire_time) > 0 && Number(i.expire_time) <= time) && !i.is_locked);
  const bucket = { 1011: virtual.get(1011) || 0, 1012: virtual.get(1012) || 0 };
  const packed = { 1011: 0, 1012: 0 };
  for (const i of physical) if (ITEMS[Number(i.id)]) {
    const [type, seconds] = ITEMS[Number(i.id)]; packed[type] += seconds * Number(i.count);
  }
  return { bucket, packed, physical, points: virtual.get(1002) || 0,
    boxes: physical.filter(i => BOXES.has(Number(i.id))) };
}

function offersFromProducts(products, time) {
  return [...new Map(products.map(p => [Number(p.id), p])).values()].flatMap(p => {
    if (Number(p.price?.id) !== 1002 || Number(p.price?.count) <= 0 || p.ad_only || p.share || p.is_owned ||
      Number(p.end_time) > 0 && Number(p.end_time) <= time) return [];
    const limit = Number(p.restriction?.max_count || 0);
    const remaining = limit > 0 ? Math.max(0, limit - Number(p.restriction.current_count || 0)) : Infinity;
    // Unlimited products omit the availability field. Restricted products must
    // also pass the server's explicit availability and remaining-limit checks.
    if (!remaining || limit > 0 && !p.is_available_purchase) return [];
    const seconds = { 1011: 0, 1012: 0 };
    for (const i of p.items || []) {
      const id = Number(i.id), count = Number(i.count || 0);
      if (ITEMS[id]) seconds[ITEMS[id][0]] += ITEMS[id][1] * count;
      else if (id === 1011 || id === 1012) seconds[id] += count;
    }
    if (!seconds[1011] && !seconds[1012]) return [];
    const discountActive = Number(p.discount_price) > 0 && Number(p.discount_start_time) <= time && Number(p.discount_end_time) > time;
    return [{ id: Number(p.id), price: discountActive ? Number(p.discount_price) : Number(p.price.count),
      normalSec: seconds[1011], organicSec: seconds[1012], remaining, slot: Number(p.slot_type) }];
  });
}

function allocate(costs, normal, organic, normalAllowed = costs.map(() => true)) {
  const total = costs.reduce((a, b) => a + b, 0);
  if (normal + organic < total) return null;
  const eligible = costs.map((cost, index) => ({ cost, index })).filter(x => normalAllowed[x.index]);
  const middle = Math.floor(eligible.length / 2);
  function subsets(items) {
    const list = [{ sum: 0, mask: 0 }];
    for (const item of items) for (let n = list.length, i = 0; i < n; i++) {
      const sum = list[i].sum + item.cost;
      if (sum <= normal) list.push({ sum, mask: list[i].mask | (1 << item.index) });
    }
    return list;
  }
  const left = subsets(eligible.slice(0, middle)), right = subsets(eligible.slice(middle)).sort((a, b) => a.sum - b.sum);
  let best = null;
  for (const l of left) {
    let lo = 0, hi = right.length - 1, found = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1;
      if (right[mid].sum <= normal - l.sum) { found = mid; lo = mid + 1; } else hi = mid - 1;
    }
    if (found < 0) continue;
    const sum = l.sum + right[found].sum;
    if (total - sum <= organic && (!best || sum > best.normalSec)) best = {
      mask: l.mask | right[found].mask, normalSec: sum, organicSec: total - sum };
  }
  return best;
}

function planSupply(plots, time, stock, offers = []) {
  const active = plots.filter(l => l.plant);
  const mature = p => Number(p.phases?.at(-1)?.begin_time) || 0;
  const grow = p => Number(p.phases?.at(-2)?.begin_time) || 0;
  const unripe = active.filter(l => mature(l.plant) > time);
  const valid = active.every(l => mature(l.plant) > 0) && unripe.every(l => grow(l.plant) > 0);
  const phaseAt = unripe.length && valid ? Math.max(...unripe.map(l => grow(l.plant))) : 0;
  const at = Math.max(time, phaseAt);
  const costs = unripe.map(l => Math.max(0, mature(l.plant) - at));
  const needSec = costs.reduce((a, b) => a + b, 0);
  const allowed = unripe.map(l => l.plant.left_inorc_fert_times == null || Number(l.plant.left_inorc_fert_times) !== 0);
  const owned = { normal: stock.bucket[1011] + stock.packed[1011], organic: stock.bucket[1012] + stock.packed[1012] };
  let allocation = valid && unripe.length ? allocate(costs, stock.bucket[1011], stock.bucket[1012], allowed) : null;
  if (!allocation && valid && unripe.length) allocation = allocate(costs, owned.normal, owned.organic, allowed);
  let purchases = [], pointsCost = 0;
  if (!allocation && valid && unripe.length && offers.length) {
    // Search purchase baskets by price. Capacity is capped at this batch's need;
    // the single point wallet is shared across ordinary and organic fertilizer.
    const frontier = [{ normal: 0, organic: 0, cost: 0, counts: offers.map(() => 0) }];
    const seen = new Map();
    while (frontier.length) {
      frontier.sort((a, b) => b.cost - a.cost);
      const state = frontier.pop();
      const key = state.normal + ':' + state.organic + ':' + state.counts.map((n, i) => Number.isFinite(offers[i].remaining) ? n : '').join(',');
      if ((seen.get(key) ?? Infinity) <= state.cost) continue;
      seen.set(key, state.cost);
      const candidate = allocate(costs, owned.normal + state.normal, owned.organic + state.organic, allowed);
      if (candidate) {
        allocation = candidate; pointsCost = state.cost;
        purchases = state.counts.flatMap((count, i) => count ? [{ ...offers[i], count }] : []); break;
      }
      for (let i = 0; i < offers.length; i++) {
        const offer = offers[i], cost = state.cost + offer.price;
        if (cost > stock.points || state.counts[i] >= offer.remaining) continue;
        const normal = Math.min(needSec, state.normal + offer.normalSec), organic = Math.min(needSec, state.organic + offer.organicSec);
        if (normal === state.normal && organic === state.organic) continue;
        const counts = state.counts.slice(); counts[i]++;
        frontier.push({ normal, organic, cost, counts });
      }
    }
  }
  const groups = allocation ? [1011, 1012].map(type => ({ fertilizerId: type,
    landIds: unripe.filter((_, i) => !!(allocation.mask & (1 << i)) === (type === 1011)).map(l => Number(l.id)),
    needSec: type === 1011 ? allocation.normalSec : allocation.organicSec })).filter(g => g.landIds.length) : [];
  return { needSec, phaseAt, ready: !!allocation && phaseAt <= time, sufficient: !!allocation,
    batchFertilizeAt: allocation ? phaseAt : 0, pointsCost, purchases, groups,
    normalBucketSec: stock.bucket[1011], organicBucketSec: stock.bucket[1012],
    normalBagSec: stock.packed[1011], organicBagSec: stock.packed[1012], points: stock.points,
    ownedTotalSec: owned.normal + owned.organic, unresolvedBoxes: stock.boxes.length,
    offers: offers.map(({ remaining, ...offer }) => ({ ...offer, remaining: Number.isFinite(remaining) ? remaining : null })) };
}

module.exports = { ITEMS, BOXES, inventory, offersFromProducts, allocate, planSupply };

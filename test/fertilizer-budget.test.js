'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { inventory, offersFromProducts, allocate, planSupply } = require('../client/fertilizer-budget');
const time = 1792239000;
const plots = (n, cost = 5000) => Array.from({ length: n }, (_, i) => ({ id: i + 1,
  plant: { phases: [{ begin_time: time - 100 }, { begin_time: time + cost }] } }));
const stock = (normal = 0, organic = 0, points = 0) => inventory({ virtual_items: [
  { id: 1011, count: normal }, { id: 1012, count: organic }, { id: 1002, count: points }], physical_items: [] }, time);
const product = (id, item, price = 34) => ({ id, price: { id: 1002, count: price }, items: [{ id: item, count: 1 }] });

test('inventory counts containers and unopened packs once, sums stacks, and excludes expired or locked items', () => {
  const inv = inventory({ virtual_items: [{ id: 1011, count: 289739 }, { id: 1012, count: 296643 }, { id: 1002, count: 11428 }],
    physical_items: [{ id: 80001, count: 10 }, { id: 80001, count: 1 }, { id: 80011, count: 34 },
      { id: 80004, count: 4, expire_time: time - 1 }, { id: 80003, count: 1, is_locked: true }, { id: 100003, count: 1 }] }, time);
  assert.equal(inv.bucket[1011], 289739); assert.equal(inv.packed[1011], 11 * 3600);
  assert.equal(inv.packed[1012], 34 * 3600); assert.equal(inv.boxes.length, 1); assert.equal(inv.points, 11428);
});

test('point offers exclude diamonds, exhausted restrictions, and unconfirmed restricted availability', () => {
  const unlimited = product(1, 80003);
  const diamond = { ...product(2, 80003), price: { id: 1004, count: 1 } };
  const sold = { ...product(3, 80003), restriction: { max_count: 1, current_count: 1 }, is_available_purchase: true };
  const unavailable = { ...product(4, 80003), restriction: { max_count: 1 }, is_available_purchase: false };
  assert.deepEqual(offersFromProducts([unlimited, unlimited, diamond, sold, unavailable], time).map(p => p.id), [1]);
});

test('container totals cannot hide a per-plot allocation that cannot be applied', () => {
  assert.equal(allocate([5000, 5000], 6000, 4000), null);
  const a = allocate([5000, 5000], 5000, 5000);
  assert.equal(a.normalSec, 5000); assert.equal(a.organicSec, 5000);
});

test('the same point balance cannot be spent once for each fertilizer type', () => {
  const offers = offersFromProducts([product(1, 80004, 34), product(2, 80014, 34)], time);
  const plan = planSupply(plots(2, 43200), time, stock(0, 0, 34), offers);
  assert.equal(plan.sufficient, false); assert.equal(plan.purchases.length, 0);
});

test('the minimum-priced purchase basket covers the exact whole-batch deficit', () => {
  const offers = offersFromProducts([product(1, 80003, 34), product(2, 80014, 42)], time);
  const plan = planSupply(plots(24), time, stock(110000, 0, 100), offers);
  assert.equal(plan.sufficient, true); assert.equal(plan.pointsCost, 34);
  assert.deepEqual(plan.purchases.map(p => [p.id, p.count]), [[1, 1]]);
});

test('normal fertilizer already used on a plant cannot be substituted for organic fertilizer', () => {
  const p = plots(1); p[0].plant.left_inorc_fert_times = 0;
  assert.equal(planSupply(p, time, stock(10000)).sufficient, false);
  assert.equal(planSupply(p, time, stock(0, 10000)).groups[0].fertilizerId, 1012);
});

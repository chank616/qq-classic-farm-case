'use strict';
// Read-only account inventory and catalogue evidence. Never stores login codes.
const fs = require('fs');
const path = require('path');
const { connect, VERSION, bridge } = require('../client/farm-transport');
const knownItems = require('../client/item-catalog.json').items;

async function main() {
  const c = await connect();
  try {
    async function read(service, method, value) {
      let r;
      try { r = await c.rpc('gamepb.' + service, method, value); }
      catch (error) { throw new Error(method + ': ' + error.message); }
      if (r.err) throw new Error(method + ': ' + r.err);
      return r.decoded;
    }
    const device_info = { client_version: VERSION, sys_software: 'Windows', sys_hardware: 'PC', network: 'wifi' };
    await read('userpb.UserService', 'Login', { device_info });
    const player = await read('userpb.UserService', 'PlayerLogin', { device_info });
    const scene = Number(player.global_scene_id);
    const result = { inspectedAt: new Date().toISOString(), bags: {}, profiles: {}, slots: {}, itemClasses: {} };
    for (const tab of [0, 2, 4]) {
      const bag = await read('itempb.ItemService', 'GetBag', { global_scene_id: scene, tab_id: tab });
      const select = items => (items || []).filter(i => knownItems[Number(i.id)] || Number(i.id) === 1002)
        .map(({ id, count, uid, expire_time, is_locked }) => ({ id, count, uid, expire_time, is_locked }));
      result.bags[tab] = { physical_items: select(bag.physical_items), virtual_items: select(bag.virtual_items) };
    }
    result.profiles = await read('mallpb.MallService', 'GetMallProfiles', { global_scene_id: scene });
    for (const slot of [1, 2, 3, 4, 5]) result.slots[slot] = await read('mallpb.MallService', 'GetMallListBySlotType', { global_scene_id: scene, slot_type: slot, is_manual_open: false });
    for (const name of ['UseItemRequest', 'UseItemReply', 'UseRequest', 'UseReply', 'ItemUseRequest', 'BatchUseItemRequest'])
      result.itemClasses[name] = (await bridge({ op: 'inspect', path: 'itempb.' + name })).value;
    const file = path.resolve(__dirname, '../artifacts/fertilizer-inspection.json');
    fs.writeFileSync(file, JSON.stringify(result, null, 2) + '\n');
    console.log('Fertilizer inventory and catalog saved: ' + file);
  } finally { c.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

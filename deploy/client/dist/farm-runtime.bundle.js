(function(){
var __defs = {}; var __cache = {};
function __req(name){ if(__cache[name]) return __cache[name].exports; var m={exports:{}}; __cache[name]=m; __defs[name](m,m.exports,__req); return m.exports; }
__defs["pb"] = function(module, exports, require){
'use strict';

// Minimal protobuf wire codec, browser + Node compatible.
// Only the wire types the farm protocol actually uses:
//   0 varint, 1 fixed64, 2 length-delimited, 5 fixed32
// A message schema is a plain object: { fieldName: [tag, kind] }
// kind: 'int32' | 'uint32' | 'int64' | 'uint64' | 'bool' | 'string' | 'bytes'
//       | 'float' | 'double' | 'message:<Name>' | 'repeated:<kind>'

function Writer() {
  this.parts = [];
  this.len = 0;
}
Writer.prototype.byte = function (b) {
  this.parts.push(Uint8Array.of(b & 0xff));
  this.len += 1;
};
Writer.prototype.bytes = function (arr) {
  this.parts.push(arr);
  this.len += arr.length;
};
Writer.prototype.varint = function (value) {
  let v = typeof value === 'bigint' ? value : BigInt(Math.trunc(Number(value)));
  if (v < 0n) v += 1n << 64n;
  const out = [];
  while (v > 0x7fn) {
    out.push(Number(v & 0x7fn) | 0x80);
    v >>= 7n;
  }
  out.push(Number(v));
  this.parts.push(Uint8Array.from(out));
  this.len += out.length;
};
Writer.prototype.tag = function (field, wire) {
  this.varint((field << 3) | wire);
};
Writer.prototype.finish = function () {
  const out = new Uint8Array(this.len);
  let off = 0;
  for (const p of this.parts) { out.set(p, off); off += p.length; }
  return out;
};

function encodeVarintField(w, tag, value) {
  w.tag(tag, 0);
  w.varint(value);
}
function encodeBytesField(w, tag, value) {
  w.tag(tag, 2);
  w.varint(value.length);
  w.bytes(value);
}
function toU8(value) {
  if (value instanceof Uint8Array) return value;
  if (typeof value === 'string') return utf8Encode(value);
  if (value && value.length !== undefined) return Uint8Array.from(value);
  throw new TypeError('cannot convert to bytes');
}
function utf8Encode(str) {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
  return Uint8Array.from(Buffer.from(str, 'utf8'));
}
function utf8Decode(bytes) {
  if (typeof TextDecoder !== 'undefined') return new TextDecoder().decode(bytes);
  return Buffer.from(bytes).toString('utf8');
}

// schema: { field: [tag, kind] }, registry: { messageName: schema }
function encodeMessage(name, obj, registry) {
  const schema = registry[name];
  if (!schema) throw new Error('unknown message: ' + name);
  const w = new Writer();
  for (const [field, spec] of Object.entries(schema)) {
    const [tag, kind] = spec;
    const value = obj[field];
    if (value === undefined || value === null) continue;
    if (kind.startsWith('repeated:')) {
      const inner = kind.slice(9);
      const arr = Array.isArray(value) ? value : [value];
      for (const item of arr) encodeOne(w, tag, inner, item, registry);
      continue;
    }
    encodeOne(w, tag, kind, value, registry);
  }
  return w.finish();
}

function encodeOne(w, tag, kind, value, registry) {
  if (kind === 'int32' || kind === 'uint32' || kind === 'int64' || kind === 'uint64' || kind === 'bool') {
    encodeVarintField(w, tag, typeof value === 'boolean' ? (value ? 1 : 0) : value);
  } else if (kind === 'string') {
    encodeBytesField(w, tag, utf8Encode(String(value)));
  } else if (kind === 'bytes') {
    encodeBytesField(w, tag, toU8(value));
  } else if (kind === 'float') {
    w.tag(tag, 5);
    const buf = new ArrayBuffer(4); new DataView(buf).setFloat32(0, Number(value), true);
    w.bytes(new Uint8Array(buf));
  } else if (kind === 'double') {
    w.tag(tag, 1);
    const buf = new ArrayBuffer(8); new DataView(buf).setFloat64(0, Number(value), true);
    w.bytes(new Uint8Array(buf));
  } else if (kind.startsWith('message:')) {
    encodeBytesField(w, tag, encodeMessage(kind.slice(8), value, registry));
  } else {
    throw new Error('unsupported kind: ' + kind);
  }
}

function decodeMessage(name, bytes, registry) {
  const schema = registry[name];
  if (!schema) throw new Error('unknown message: ' + name);
  const byTag = {};
  for (const [field, [tag, kind]] of Object.entries(schema)) byTag[tag] = { field, kind };
  const out = {};
  const view = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
  let pos = 0;
  while (pos < view.length) {
    const t = readVarint(view, pos); pos = t.pos;
    const tagValue = Number(t.value);
    const tag = Math.floor(tagValue / 8);
    const wire = tagValue & 7;
    const spec = byTag[tag];
    if (!spec) { pos = skipField(view, pos, wire); continue; }
    const { field, kind } = spec;
    const repeated = kind.startsWith('repeated:');
    const inner = repeated ? kind.slice(9) : kind;
    let value;
    if (wire === 0) {
      const r = readVarint(view, pos); pos = r.pos;
      value = inner === 'bool' ? r.value !== 0 : Number(r.value);
    } else if (wire === 2) {
      const r = readVarint(view, pos); pos = r.pos;
      const chunk = view.subarray(pos, pos + Number(r.value)); pos += Number(r.value);
      if (inner === 'string') value = utf8Decode(chunk);
      else if (inner === 'bytes') value = chunk;
      else if (inner.startsWith('message:')) value = decodeMessage(inner.slice(8), chunk, registry);
      else value = Number(readVarint(chunk, 0).value); // packed scalar
    } else if (wire === 5) {
      value = new DataView(view.buffer, view.byteOffset + pos, 4).getFloat32(0, true); pos += 4;
    } else if (wire === 1) {
      value = Number(new DataView(view.buffer, view.byteOffset + pos, 8).getFloat64(0, true)); pos += 8;
    } else {
      pos = skipField(view, pos, wire);
      continue;
    }
    if (repeated) {
      if (!Array.isArray(out[field])) out[field] = [];
      out[field].push(value);
    } else {
      out[field] = value;
    }
  }
  return out;
}

function readVarint(view, pos) {
  let result = 0n;
  let shift = 0n;
  while (true) {
    if (pos >= view.length) throw new Error('truncated varint');
    const b = view[pos++];
    result |= BigInt(b & 0x7f) << shift;
    if ((b & 0x80) === 0) break;
    shift += 7n;
    if (shift > 63n) throw new Error('varint too long');
  }
  return { value: result, pos };
}

function skipField(view, pos, wire) {
  if (wire === 0) return readVarint(view, pos).pos;
  if (wire === 1) return pos + 8;
  if (wire === 5) return pos + 4;
  if (wire === 2) {
    const r = readVarint(view, pos);
    return r.pos + Number(r.value);
  }
  throw new Error('unsupported wire type: ' + wire);
}

module.exports = { Writer, encodeMessage, decodeMessage, utf8Encode, utf8Decode, readVarint };

};
__defs["schema"] = function(module, exports, require){
'use strict';

// Message schemas recovered from the cached protobuf factories.
// Source: artifacts/proto-schema-full.json (field numbers confirmed by
// per-field wire-tag probes). Wire types: varint for numeric/bool,
// length-delimited for string/bytes/nested, packed varint for int64 lists.

const gate = {
  'gatepb.Message': {
    meta: [1, 'message:gatepb.Meta'],
    body: [2, 'bytes'],
    token: [3, 'string'],
  },
  'gatepb.Meta': {
    service_name: [1, 'string'],
    method_name: [2, 'string'],
    message_type: [3, 'int32'],
    client_seq: [4, 'int64'],
    server_seq: [5, 'int64'],
    error_code: [6, 'int32'],
    error_message: [7, 'string'],
    metadata: [8, 'bytes'],
  },
};

const user = {
  'userpb.DeviceInfo': {
    client_version: [1, 'string'],
    sys_software: [2, 'string'],
    sys_hardware: [3, 'string'],
    telecom_oper: [4, 'string'],
    network: [5, 'string'],
    screen_width: [6, 'int32'],
    screen_height: [7, 'int32'],
    density: [8, 'float'],
    cpu: [9, 'string'],
    memory: [10, 'int64'],
    gl_render: [11, 'string'],
    gl_version: [12, 'string'],
    device_id: [13, 'string'],
    android_oaid: [14, 'string'],
    ios_caid: [15, 'string'],
  },
  'userpb.ReportData': {
    callback: [1, 'string'],
    cd_extend_info: [2, 'string'],
    click_id: [3, 'string'],
    clue_token: [4, 'string'],
    minigame_channel: [5, 'string'],
    minigame_platid: [6, 'int64'],
    req_id: [7, 'string'],
    trackid: [8, 'string'],
  },
  'userpb.LoginRequest': {
    sharer_id: [3, 'int64'],
    sharer_open_id: [4, 'string'],
    device_info: [5, 'message:userpb.DeviceInfo'],
    share_cfg_id: [6, 'int64'],
    scene_id: [7, 'string'],
    report_data: [8, 'message:userpb.ReportData'],
    share_key: [9, 'string'],
    experiment_keys: [10, 'repeated:string'],
    ark_biz_type: [11, 'int32'],
    ark_biz_param: [12, 'bytes'],
    game_scene_id: [13, 'int32'],
  },
  'userpb.LoginReply': {
    basic: [1, 'message:userpb.BasicInfo'],
    item_bag: [2, 'message:userpb.ItemBag'],
    time_now_millis: [3, 'int64'],
    is_first_login: [4, 'bool'],
    qq_friend_recommend_authorized: [11, 'int64'],
    moon_phase: [15, 'int32'],
  },
  'userpb.ItemBag': {
    items: [1, 'repeated:message:userpb.BagItem'],
  },
  'userpb.BagItem': {
    item_id: [1, 'int64'],
    count: [2, 'int64'],
    extra: [100, 'bytes'],
  },
  'userpb.BasicInfo': {
    gid: [1, 'int64'],
    name: [2, 'string'],
    level: [3, 'int32'],
    exp: [4, 'int64'],
    gold: [5, 'int64'],
    open_id: [6, 'string'],
    avatar_url: [7, 'string'],
    remark: [8, 'string'],
    signature: [9, 'string'],
    gender: [10, 'int32'],
    authorized_status: [13, 'int32'],
    disable_nudge: [14, 'bool'],
    disable_month_card: [15, 'bool'],
    last_online_timestamp: [17, 'int64'],
    allow_ark_visit: [19, 'bool'],
    big_farm_level: [20, 'int64'],
    big_farm_exp: [21, 'int64'],
  },
  'userpb.HeartbeatRequest': {
    host_gid: [1, 'int64'],
    client_version: [2, 'string'],
    host_type: [3, 'int32'],
  },
  'userpb.HeartbeatReply': {
    time_now_millis: [1, 'int64'],
  },
  'userpb.PlayerLoginRequest': {
    sharer_id: [1, 'int64'],
    sharer_open_id: [2, 'string'],
    device_info: [3, 'message:userpb.DeviceInfo'],
    share_cfg_id: [4, 'int64'],
    scene_id: [5, 'string'],
    report_data: [6, 'message:userpb.ReportData'],
    share_key: [7, 'string'],
    experiment_keys: [8, 'repeated:string'],
    ark_biz_type: [11, 'int32'],
    ark_biz_param: [12, 'bytes'],
    game_scene_id: [13, 'int32'],
  },
  'userpb.PlayerLoginReply': {
    basic: [1, 'message:userpb.BasicInfo'],
    time_now_millis: [2, 'int64'],
    is_first_login: [3, 'bool'],
    global_scene_id: [7, 'int32'],
  },
};

const plant = {
  'plantpb.AllLandsRequest': {
    host_gid: [1, 'int64'],
  },
  'plantpb.LandInfo': {
    id: [1, 'int64'],
    unlocked: [2, 'bool'],
    level: [3, 'int64'],
    max_level: [4, 'int64'],
    could_unlock: [5, 'bool'],
    could_upgrade: [6, 'bool'],
    plant: [10, 'message:plantpb.PlantInfo'],
    is_shared: [11, 'bool'],
    can_share: [12, 'bool'],
  },
  'plantpb.PlantInfo': {
    id: [1, 'int64'],
    name: [2, 'string'],
    phases: [4, 'repeated:message:plantpb.PlantPhaseInfo'],
    season: [5, 'int64'],
    dry_num: [6, 'int64'],
    stole_num: [9, 'int64'],
    fruit_id: [10, 'int64'],
    fruit_num: [11, 'int64'],
    grow_sec: [15, 'int64'],
    stealable: [16, 'bool'],
    left_inorc_fert_times: [17, 'int64'],
    left_fruit_num: [18, 'int64'],
    exp: [22, 'int64'],
    last_plant_id: [33, 'int64'],
    planting_player_level: [37, 'int64'],
  },
  'plantpb.PlantPhaseInfo': {
    phase: [1, 'int32'],
    begin_time: [2, 'int64'],
    phase_id: [3, 'int64'],
    dry_time: [6, 'int64'],
    weeds_time: [7, 'int64'],
    insect_time: [8, 'int64'],
  },
  'plantpb.AllLandsReply': {
    lands: [1, 'repeated:message:plantpb.LandInfo'],
  },
  'plantpb.PlantItem': {
    seed_id: [1, 'int64'],
    land_ids: [2, 'repeated:int64'],
    auto_slave: [3, 'bool'],
  },
  'plantpb.PlantRequest': {
    items: [2, 'repeated:message:plantpb.PlantItem'],
  },
  'plantpb.PlantReply': {
    land: [1, 'repeated:message:plantpb.LandInfo'],
  },
  'plantpb.HarvestRequest': {
    land_ids: [1, 'repeated:int64'],
    host_gid: [2, 'int64'],
    is_all: [3, 'bool'],
    host_type: [4, 'int32'],
    reason: [5, 'int32'],
  },
  'plantpb.HarvestReply': {
    land: [1, 'repeated:message:plantpb.LandInfo'],
    items: [2, 'repeated:bytes'],
  },
  'plantpb.FertilizeRequest': {
    land_ids: [1, 'repeated:int64'],
    fertilizer_id: [2, 'int64'],
  },
  'plantpb.FertilizeReply': {
    land: [1, 'repeated:message:plantpb.LandInfo'],
    fertilizer: [3, 'bytes'],
  },
};

const task = {
  'taskpb.TaskInfoRequest': {
    global_scene_id: [1, 'int32'],
  },
  'taskpb.Task': {
    id: [1, 'int64'],
    progress: [2, 'int64'],
    is_claimed: [3, 'bool'],
    is_unlocked: [4, 'bool'],
    rewards: [5, 'repeated:bytes'],
    total_progress: [6, 'int64'],
    share_multiple: [7, 'int64'],
    params: [8, 'repeated:bytes'],
    desc: [9, 'string'],
    task_type: [10, 'int32'],
    group: [11, 'int64'],
    cond_type: [12, 'int64'],
    is_show_text: [13, 'int64'],
    activity_rewards: [14, 'repeated:bytes'],
  },
  'taskpb.TaskInfo': {
    growth_tasks: [1, 'repeated:message:taskpb.Task'],
    daily_tasks: [2, 'repeated:message:taskpb.Task'],
    tasks: [3, 'repeated:message:taskpb.Task'],
    actives: [4, 'repeated:message:taskpb.Active'],
  },
  'taskpb.Active': {
    type: [1, 'int32'],
    progress: [2, 'int64'],
    rewards: [3, 'repeated:message:taskpb.ActiveReward'],
  },
  'taskpb.ActiveReward': {
    point_id: [1, 'int64'],
    need_progress: [2, 'int64'],
    status: [3, 'int32'],
    rewards: [4, 'repeated:bytes'],
  },
  'taskpb.TaskInfoReply': {
    task_info: [1, 'message:taskpb.TaskInfo'],
  },
  'taskpb.ClaimTaskRewardRequest': {
    id: [1, 'int64'],
    do_shared: [2, 'bool'],
  },
  'taskpb.ClaimTaskRewardReply': {
    items: [1, 'repeated:bytes'],
    task_info: [2, 'message:taskpb.TaskInfo'],
  },
  'taskpb.BatchClaimTaskRewardRequest': {
    ids: [1, 'repeated:int64'],
  },
  'taskpb.BatchClaimTaskRewardReply': {
    items: [1, 'repeated:bytes'],
    task_info: [2, 'message:taskpb.TaskInfo'],
  },
  'taskpb.ClaimDailyRewardRequest': {
    type: [1, 'int32'],
    point_ids: [2, 'repeated:int64'],
  },
  'taskpb.ClaimDailyRewardReply': {
    items: [1, 'repeated:bytes'],
    task_info: [2, 'message:taskpb.TaskInfo'],
  },
  'taskpb.ClientReportProgressRequest': {
    task_id: [1, 'int64'],
    progress: [2, 'int64'],
  },
};

const qqvip = {
  'qqvippb.GetQQVipRewardsStatusRequest': {},
  'qqvippb.GetQQVipRewardsStatusReply': {
    is_qq_vip: [1, 'bool'],
    can_claim: [2, 'bool'],
    claimed_today: [3, 'bool'],
    rewards_can_claim: [4, 'bool'],
    active_configs: [5, 'repeated:message:qqvippb.QQVipConfig'],
    has_redpoint: [6, 'bool'],
    remaining_days: [7, 'int64'],
    days_remaining_reminder: [8, 'int64'],
    mall_free_can_claim: [9, 'bool'],
  },
  'qqvippb.QQVipConfig': {
    type: [1, 'int32'],
    rewards: [2, 'repeated:bytes'],
    is_enable: [3, 'bool'],
    season_id: [4, 'int64'],
    id: [5, 'int64'],
    reward_multiplier: [6, 'int64'],
    act_start_time: [7, 'int64'],
    act_end_time: [8, 'int64'],
  },
  'qqvippb.ClaimQQVipRewardsRequest': {
    config_ids: [1, 'repeated:int64'],
  },
  'qqvippb.ClaimQQVipRewardsReply': {
    granted_skin_item_ids: [1, 'repeated:int64'],
    granted_avatar_frame_item_ids: [2, 'repeated:int64'],
    rewards: [3, 'repeated:bytes'],
  },
  'qqvippb.GetDailyGiftStatusRequest': {},
  'qqvippb.GetDailyGiftStatusReply': {
    is_qq_vip: [1, 'bool'],
    can_claim: [2, 'bool'],
    claimed_today: [3, 'bool'],
    rewards: [4, 'repeated:bytes'],
  },
  'qqvippb.ClaimDailyGiftRequest': {
    config_id: [1, 'int64'],
  },
  'qqvippb.ClaimDailyGiftReply': {
    rewards: [1, 'repeated:bytes'],
  },
};

const mall = {
  'mallpb.GetMallListBySlotTypeRequest': {
    slot_type: [1, 'int32'],
    is_manual_open: [2, 'bool'],
    global_scene_id: [3, 'int32'],
  },
  'mallpb.RestrictionInfo': {
    type: [1, 'int32'],
    current_count: [2, 'int64'],
    max_count: [3, 'int64'],
  },
  'mallpb.ProductInfo': {
    id: [1, 'int64'],
    name: [2, 'string'],
    slot_type: [3, 'int32'],
    items: [4, 'repeated:bytes'],
    price: [5, 'bytes'],
    is_free: [6, 'bool'],
    restriction: [7, 'message:mallpb.RestrictionInfo'],
    is_available_purchase: [8, 'bool'],
    discount: [9, 'string'],
    is_display_countdown: [10, 'bool'],
    end_time: [11, 'int64'],
    goods_type: [12, 'int32'],
    pic: [13, 'string'],
    ad_id: [17, 'int64'],
    ad_only: [18, 'bool'],
    is_owned: [20, 'bool'],
    bg_pic: [21, 'string'],
    color: [22, 'string'],
  },
  'mallpb.GetMallListBySlotTypeReply': {
    products: [1, 'repeated:message:mallpb.ProductInfo'],
    refresh_time: [2, 'int64'],
  },
  'mallpb.PurchaseRequest': {
    id: [1, 'int64'],
    buy_num: [2, 'int64'],
  },
  'mallpb.PurchaseReply': {
    id: [1, 'int64'],
    success: [2, 'bool'],
    reward_items: [3, 'repeated:bytes'],
    is_first_buy: [4, 'bool'],
    restriction: [5, 'message:mallpb.RestrictionInfo'],
    share_free: [6, 'bool'],
  },
};

const shop = {
  'shoppb.ShopInfoRequest': {
    shop_id: [1, 'int64'],
  },
  'shoppb.GoodsInfo': {
    id: [1, 'int64'],
    bought_num: [2, 'int64'],
    price: [3, 'int64'],
    limit_count: [4, 'int64'],
    unlocked: [5, 'bool'],
    item_id: [6, 'int64'],
    item_count: [7, 'int64'],
    conds: [8, 'repeated:message:shoppb.Cond'],
    is_display_countdown: [9, 'bool'],
    end_time: [10, 'int64'],
    discount_price: [11, 'int64'],
    discount_start_time: [12, 'int64'],
    discount_end_time: [13, 'int64'],
    show_conds: [14, 'repeated:bytes'],
  },
  'shoppb.ShopInfoReply': {
    goods_list: [1, 'repeated:message:shoppb.GoodsInfo'],
  },
  'shoppb.BuyGoodsRequest': {
    goods_id: [1, 'int64'],
    num: [2, 'int64'],
    price: [3, 'int64'],
    auto_add: [4, 'bool'],
  },
  'shoppb.BuyGoodsReply': {
    goods: [1, 'message:shoppb.GoodsInfo'],
    get_items: [2, 'repeated:bytes'],
    cost_items: [3, 'repeated:bytes'],
  },
};

const registry = Object.assign({}, gate, user, plant, task, qqvip, mall, shop);
registry['shoppb.Cond'] = { type: [1, 'int32'], param: [2, 'int64'] };
registry['taskpb.ClientReportProgressReply'] = { task_info: [1, 'message:taskpb.TaskInfo'] };

// service name -> { wireMethod: [requestType, responseType] }
// The gateway's method_name is the PascalCase form seen in dynamic envelopes
// (`gamepb.userpb.UserService/Login`), not the generated camelCase helper name.
const services = {
  'gamepb.userpb.UserService': {
    Login: ['userpb.LoginRequest', 'userpb.LoginReply'],
    PlayerLogin: ['userpb.PlayerLoginRequest', 'userpb.PlayerLoginReply'],
    Heartbeat: ['userpb.HeartbeatRequest', 'userpb.HeartbeatReply'],
  },
  'gamepb.plantpb.PlantService': {
    AllLands: ['plantpb.AllLandsRequest', 'plantpb.AllLandsReply'],
    Plant: ['plantpb.PlantRequest', 'plantpb.PlantReply'],
    Harvest: ['plantpb.HarvestRequest', 'plantpb.HarvestReply'],
    Fertilize: ['plantpb.FertilizeRequest', 'plantpb.FertilizeReply'],
  },
  'gamepb.taskpb.TaskService': {
    TaskInfo: ['taskpb.TaskInfoRequest', 'taskpb.TaskInfoReply'],
    ClaimTaskReward: ['taskpb.ClaimTaskRewardRequest', 'taskpb.ClaimTaskRewardReply'],
    BatchClaimTaskReward: ['taskpb.BatchClaimTaskRewardRequest', 'taskpb.BatchClaimTaskRewardReply'],
    ClaimDailyReward: ['taskpb.ClaimDailyRewardRequest', 'taskpb.ClaimDailyRewardReply'],
    ClientReportProgress: ['taskpb.ClientReportProgressRequest', 'taskpb.ClientReportProgressReply'],
  },
  'gamepb.qqvippb.QQVipService': {
    GetQQVipRewardsStatus: ['qqvippb.GetQQVipRewardsStatusRequest', 'qqvippb.GetQQVipRewardsStatusReply'],
    ClaimQQVipRewards: ['qqvippb.ClaimQQVipRewardsRequest', 'qqvippb.ClaimQQVipRewardsReply'],
    GetDailyGiftStatus: ['qqvippb.GetDailyGiftStatusRequest', 'qqvippb.GetDailyGiftStatusReply'],
    ClaimDailyGift: ['qqvippb.ClaimDailyGiftRequest', 'qqvippb.ClaimDailyGiftReply'],
  },
  'gamepb.mallpb.MallService': {
    GetMallListBySlotType: ['mallpb.GetMallListBySlotTypeRequest', 'mallpb.GetMallListBySlotTypeReply'],
    Purchase: ['mallpb.PurchaseRequest', 'mallpb.PurchaseReply'],
  },
  'gamepb.shoppb.ShopService': {
    ShopInfo: ['shoppb.ShopInfoRequest', 'shoppb.ShopInfoReply'],
    BuyGoods: ['shoppb.BuyGoodsRequest', 'shoppb.BuyGoodsReply'],
  },
  'gamepb.itempb.ItemService': {
    GetBag: ['itempb.GetBagRequest', 'itempb.GetBagReply'],
    Bag: ['itempb.BagRequest', 'itempb.BagReply'],
    GetBagTab: ['itempb.GetBagTabRequest', 'itempb.GetBagTabReply'],
  },
};

// Reply schemas for the bag RPC are intentionally permissive: the shape is
// discovered from raw dumps before being pinned down.
Object.assign(registry, {
  'itempb.GetBagRequest': { global_scene_id: [1, 'int32'], tab_id: [2, 'int32'] },
  'itempb.BagEntry': {
    id: [1, 'int64'],
    count: [2, 'int64'],
    extra: [100, 'bytes'],
  },
  'itempb.GetBagReply': {
    physical_items: [1, 'repeated:message:itempb.BagEntry'],
    virtual_items: [2, 'repeated:message:itempb.BagEntry'],
  },
  'itempb.BagRequest': { tab_type: [1, 'int32'] },
  'itempb.BagReply': {
    items: [1, 'repeated:message:itempb.BagEntry'],
    currency: [2, 'repeated:message:itempb.BagEntry'],
  },
  'itempb.GetBagTabRequest': {},
  'itempb.GetBagTabReply': {},
});

module.exports = { registry, services };

};
__defs["crypto"] = function(module, exports, require){
'use strict';

// AES-GCM transport crypto matching the game's GcmCrypto:
//   - AES key: 16 / 24 / 32 bytes, supplied by wx.getUserCryptoManager().getLatestUserKey()
//   - nonce:   12 bytes, supplied by wx.getUserCryptoManager().getRandomValues()
//   - AAD:     4-byte big-endian client sequence
//   - output:  raw bytes of  nonce(12) || ciphertext || GCM tag(16)
// The game wraps that output in Base64 and immediately decodes it back to bytes
// before placing it in gatepb.Message.body, so the wire form is the raw layout.

const webcrypto = (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle)
  ? globalThis.crypto
  : null;

function seqToAad(seq) {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, Number(seq) >>> 0, false);
  return out;
}

function base64Encode(bytes) {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function base64Decode(str) {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(str, 'base64'));
  const s = atob(str);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function getCrypto() {
  if (webcrypto) return webcrypto;
  // Node < 19 fallback.
  const nodeCrypto = await import('node:crypto');
  return nodeCrypto.webcrypto;
}

async function importKey(keyBytes) {
  const key = keyBytes instanceof Uint8Array ? keyBytes : Uint8Array.from(keyBytes);
  if (key.length !== 16 && key.length !== 24 && key.length !== 32) {
    throw new Error('AES key must be 16/24/32 bytes, got ' + key.length);
  }
  const c = await getCrypto();
  return c.subtle.importKey('raw', key, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

// Returns Uint8Array: nonce || ciphertext || tag
async function encryptBody(payloadBytes, keyBytes, nonceBytes, seq) {
  const nonce = nonceBytes instanceof Uint8Array ? nonceBytes : Uint8Array.from(nonceBytes);
  // GcmCrypto documents 12-byte nonces, but this runtime's getUserCryptoManager
  // returns a 16-byte `iv`; WebCrypto accepts either, so pass it through as-is.
  if (!nonce.length) throw new Error('nonce must not be empty');
  const c = await getCrypto();
  const key = await importKey(keyBytes);
  const ct = await c.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: seqToAad(seq), tagLength: 128 },
    key,
    payloadBytes,
  );
  const out = new Uint8Array(nonce.length + ct.byteLength);
  out.set(nonce, 0);
  out.set(new Uint8Array(ct), nonce.length);
  return out;
}

// Accepts either the raw layout (nonce||ct||tag) or the Base64 text form.
// nonceLen defaults to 12 but the runtime's host key uses a 16-byte iv, so
// callers may probe several lengths.
async function decryptBody(bodyBytes, keyBytes, seq, nonceLen = 12) {
  let raw = bodyBytes;
  if (typeof raw === 'string') raw = base64Decode(raw);
  if (raw.length < nonceLen + 16) throw new Error('ciphertext too short: ' + raw.length);
  const nonce = raw.subarray(0, nonceLen);
  const ct = raw.subarray(nonceLen);
  const c = await getCrypto();
  const key = await importKey(keyBytes);
  const plain = await c.subtle.decrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: seqToAad(seq), tagLength: 128 },
    key,
    ct,
  );
  return new Uint8Array(plain);
}

// AES-CBC fallback: the host key bundle (16-byte encryptKey + 16-byte iv) is a
// classic CBC pair, so the wire body may be CBC rather than GCM.
async function encryptBodyCbc(payloadBytes, keyBytes, ivBytes) {
  const iv = ivBytes instanceof Uint8Array ? ivBytes : Uint8Array.from(ivBytes);
  if (iv.length !== 16) throw new Error('CBC iv must be 16 bytes, got ' + iv.length);
  const c = await getCrypto();
  const key = await c.subtle.importKey('raw', keyBytes, { name: 'AES-CBC' }, false, ['encrypt', 'decrypt']);
  const ct = await c.subtle.encrypt({ name: 'AES-CBC', iv }, key, payloadBytes);
  return new Uint8Array(ct);
}

async function decryptBodyCbc(bodyBytes, keyBytes, ivBytes) {
  const iv = ivBytes instanceof Uint8Array ? ivBytes : Uint8Array.from(ivBytes);
  const c = await getCrypto();
  const key = await c.subtle.importKey('raw', keyBytes, { name: 'AES-CBC' }, false, ['encrypt', 'decrypt']);
  const plain = await c.subtle.decrypt({ name: 'AES-CBC', iv }, key, bodyBytes);
  return new Uint8Array(plain);
}

// Raw GCM decrypt with an explicit nonce (no layout assumptions), used when
// verifying captured traffic against candidate parameter sets.
async function decryptRaw(ctBytes, keyBytes, nonceBytes, seq) {
  const nonce = nonceBytes instanceof Uint8Array ? nonceBytes : Uint8Array.from(nonceBytes);
  const c = await getCrypto();
  const key = await importKey(keyBytes);
  const plain = await c.subtle.decrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: seqToAad(seq), tagLength: 128 },
    key,
    ctBytes,
  );
  return new Uint8Array(plain);
}

// Raw GCM decrypt with explicit AAD bytes (null = no additionalData).
async function decryptRawAad(ctBytes, keyBytes, nonceBytes, aadBytes) {
  const nonce = nonceBytes instanceof Uint8Array ? nonceBytes : Uint8Array.from(nonceBytes);
  const c = await getCrypto();
  const key = await importKey(keyBytes);
  const alg = { name: 'AES-GCM', iv: nonce, tagLength: 128 };
  if (aadBytes) alg.additionalData = aadBytes;
  const plain = await c.subtle.decrypt(alg, key, ctBytes);
  return new Uint8Array(plain);
}

module.exports = {
  seqToAad, base64Encode, base64Decode,
  encryptBody, decryptBody, encryptBodyCbc, decryptBodyCbc, decryptRaw, decryptRawAad,
};

};
__defs["protocol"] = function(module, exports, require){
'use strict';

const { encodeMessage, decodeMessage } = __req('pb');
const { registry, services } = __req('schema');

const MESSAGE_TYPE = Object.freeze({ REQUEST: 1, RESPONSE: 2, NOTIFY: 3 });

// The game's AceManager.randomStr(): 64..127 random chars from a bundle-local
// charset plus a trailing '='. The exact charset is not statically recoverable;
// this is the base64-ish alphabet used by the surrounding encoder.
const TOKEN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function randomToken(random = Math.random) {
  const n = Math.floor(64 * random()) + 64;
  let out = '';
  for (let i = 0; i < n; i++) out += TOKEN_ALPHABET.charAt(Math.floor(random() * TOKEN_ALPHABET.length));
  return out + '=';
}

// Build the outer gatepb.Message frame.
// body is already-encrypted bytes (see crypto.encryptBody).
function buildFrame({ service, method, messageType = MESSAGE_TYPE.REQUEST, seq, body, token }) {
  const meta = {
    service_name: service,
    method_name: method,
    message_type: messageType,
    client_seq: seq,
    server_seq: 0,
  };
  const payload = encodeMessage('gatepb.Message', {
    meta,
    body: body || new Uint8Array(0),
    token: token === undefined ? randomToken() : token,
  }, registry);
  return payload;
}

function parseFrame(bytes) {
  const msg = decodeMessage('gatepb.Message', bytes, registry);
  return {
    meta: msg.meta || {},
    body: msg.body || new Uint8Array(0),
    token: msg.token,
    raw: msg,
  };
}

function lookup(service, method) {
  const svc = services[service];
  if (!svc) throw new Error('unknown service: ' + service);
  const entry = svc[method];
  if (!entry) throw new Error('unknown method: ' + service + '/' + method);
  return { requestType: entry[0], responseType: entry[1] };
}

// Encode a business request payload (before transport encryption).
function encodeRequest(service, method, message) {
  const { requestType } = lookup(service, method);
  return encodeMessage(requestType, message || {}, registry);
}

// Decode a business response payload (after transport decryption).
function decodeResponse(service, method, bytes) {
  const { responseType } = lookup(service, method);
  return decodeMessage(responseType, bytes, registry);
}

// Transport-agnostic client. `transport` must provide:
//   send(Uint8Array) -> void|Promise
//   onMessage(cb)    -> void          (cb receives Uint8Array)
//   onClose(cb)      -> void
class FarmClient {
  constructor({ transport, tokenFactory } = {}) {
    this.transport = transport;
    this.tokenFactory = tokenFactory || randomToken;
    this.clientSeq = 1;
    this.pending = new Map();
    this.notifyHandlers = [];
    this.closed = false;
    if (transport) {
      transport.onMessage(bytes => this._onFrame(bytes).catch(err => this._failAll(err)));
      transport.onClose && transport.onClose(reason => {
        this.closed = true;
        this._failAll(new Error('transport closed: ' + reason));
      });
    }
  }

  reset() { this.clientSeq = 1; }

  async sendRaw(service, method, frameBytes, token) {
    const seq = this.clientSeq++;
    const frame = buildFrame({
      service, method, messageType: MESSAGE_TYPE.REQUEST, seq,
      body: frameBytes, token: token === undefined ? this.tokenFactory() : token,
    });
    const promise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(seq);
        reject(new Error('timeout waiting for response to ' + service + '/' + method + ' seq=' + seq));
      }, 15000);
      this.pending.set(seq, { resolve, reject, timer, service, method });
    });
    await this.transport.send(frame);
    return promise;
  }

  // request(payload): payload is the raw business bytes (already encrypted).
  // Returns the raw response business bytes.
  request(service, method, bodyBytes) {
    return this.sendRaw(service, method, bodyBytes);
  }

  onNotify(handler) { this.notifyHandlers.push(handler); }

  async _onFrame(bytes) {
    const frame = parseFrame(bytes);
    const meta = frame.meta;
    const type = Number(meta.message_type);
    if (type === MESSAGE_TYPE.RESPONSE) {
      const seq = Number(meta.client_seq);
      const entry = this.pending.get(seq);
      if (entry) {
        clearTimeout(entry.timer);
        this.pending.delete(seq);
        entry.resolve({ meta, body: frame.body });
      }
      return;
    }
    for (const handler of this.notifyHandlers) {
      try { handler({ meta, body: frame.body }); } catch (_) {}
    }
  }

  _failAll(err) {
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(err);
    }
    this.pending.clear();
  }
}

module.exports = {
  MESSAGE_TYPE, TOKEN_ALPHABET, randomToken,
  buildFrame, parseFrame, encodeRequest, decodeResponse, lookup, FarmClient,
};

};
__defs["runtime"] = function(module, exports, require){
'use strict';

// Runtime client executed inside the QQ miniapp page context.
// Bundled with pb/schema/crypto/protocol by tools/build_runtime_bundle.js.
//
// Flow:
//   wx.login            -> host code (32 hex chars)
//   getUserCryptoManager -> { encryptKey, iv, version, expireTime }
//   WebSocket OPEN      -> wss://gate-obt.nqf.qq.com/prod/ws?...&code=<code>
//   gatepb.Message      -> AES-GCM(body) + random token
//   Login / Heartbeat / gameplay RPCs

const SINK = 'http://127.0.0.1:17841/evt';
const WS_BASE = 'wss://gate-obt.nqf.qq.com/prod/ws';
const OS = 'Windows';
const PLATFORM = 'qq';
const CLIENT_VERSION = '1.15.0.2_20261001';
const PASSIVE = false; // observation-only: do not log in (avoids kicking the game)

const { encodeRequest, decodeResponse, buildFrame, parseFrame, randomToken, MESSAGE_TYPE } =
  __req('protocol');
const cryptoMod = __req('crypto');
const { encodeMessage, decodeMessage } = __req('pb');
const { registry } = __req('schema');

function nowIso() { return new Date().toISOString(); }

function makeReporter(channel) {
  return function report(obj) {
    const rec = Object.assign({ t: nowIso(), ch: channel }, obj);
    try { fetch(SINK, { method: 'POST', body: JSON.stringify(rec) }).catch(function () {}); } catch (_) {}
    try { (globalThis.__farmLog = globalThis.__farmLog || []).push(rec); } catch (_) {}
  };
}

function wxCall(fn) {
  return new Promise(function (resolve, reject) {
    try {
      fn({
        success: function (r) { resolve(r); },
        fail: function (e) { reject(e || new Error('wx call failed')); },
      });
    } catch (e) { reject(e); }
  });
}

function toBytes(v) {
  if (v == null) return null;
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  if (v && v.buffer instanceof ArrayBuffer) return new Uint8Array(v.buffer, v.byteOffset || 0, v.byteLength);
  if (typeof v === 'string') {
    const s = v.trim();
    // hex
    if (/^[0-9a-fA-F]+$/.test(s) && s.length % 2 === 0) {
      const out = new Uint8Array(s.length / 2);
      for (let i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 2, 2), 16);
      return out;
    }
    // base64
    try {
      const bin = atob(s);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    } catch (_) {}
  }
  return null;
}

const NOTIF_REG = { notifprobe: { svc: [1, 'string'], payload: [2, 'bytes'] } };

function notifService(body) {
  try {
    const d = decodeMessage('notifprobe', body, NOTIF_REG);
    return d.svc || null;
  } catch (_) { return null; }
}

function getTsdk() {
  if (globalThis.__farmTsdk) return globalThis.__farmTsdk;
  try {
    const Sy = globalThis.System;
    const m = Sy && Sy.get('chunks:///_virtual/tsdk_info.mjs');
    if (m && typeof m.encryptData === 'function') {
      globalThis.__farmTsdk = m;
      return m;
    }
  } catch (_) {}
  return null;
}

function randomNonce(n) {
  const out = new Uint8Array(n);
  try { crypto.getRandomValues(out); return out; } catch (_) {}
  for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
  return out;
}

function codeFingerprint(code) {
  const c = String(code || '');
  return {
    len: c.length,
    hex: /^[0-9a-f]+$/.test(c),
    upper: /^[0-9A-F]+$/.test(c),
    versionNibble: c.length > 12 ? c[12] : null,
    variantNibble: c.length > 16 ? c[16] : null,
  };
}

function describe(v) {
  if (v == null) return String(v);
  return Object.prototype.toString.call(v) + (typeof v === 'string' ? '(' + v.length + ')' : '');
}

// The client encodes the encrypted body as ASCII bytes of its Base64 text.
// Detect that form and decode it back to the raw nonce||ct||tag layout.
function b64AsciiToBytes(bytes) {
  if (!bytes || !bytes.length) return null;
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i];
    const ok = (c >= 48 && c <= 57) || (c >= 65 && c <= 90) ||
      (c >= 97 && c <= 122) || c === 43 || c === 47 || c === 61;
    if (!ok) return null;
  }
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  try { return cryptoMod.base64Decode(s); } catch (_) { return null; }
}

function classifyCharset(v) {
  if (typeof v !== 'string') return typeof v;
  if (/^[0-9a-fA-F]+$/.test(v)) return 'hex';
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(v)) return 'base64';
  return 'other';
}

async function getCode() {
  const r = await wxCall(function (opts) { wx.login(Object.assign({ timeout: 3000 }, opts)); });
  if (!r || !r.code) throw new Error('wx.login returned no code');
  return r.code;
}

async function getKeyMaterial() {
  const mgr = wx.getUserCryptoManager();
  const methods = Object.keys(mgr || {});
  const res = await wxCall(function (opts) { mgr.getLatestUserKey(opts); });
  return { manager: mgr, methods, res };
}

function openSocket(url, report) {
  return new Promise(function (resolve, reject) {
    let settled = false;
    const task = wx.connectSocket({
      url: url,
      fail: function (e) { if (!settled) { settled = true; reject(e); } },
    });
    task.onOpen(function () { if (!settled) { settled = true; resolve(task); } });
    task.onError(function (e) { report({ type: 'ws-error', err: String(e && e.errMsg || e) }); if (!settled) { settled = true; reject(e); } });
    task.onClose(function (e) { report({ type: 'ws-close', code: e && e.code, reason: e && e.reason }); });
  });
}

function makeTransport(task, report) {
  const messageHandlers = [];
  const closeHandlers = [];
  task.onMessage(function (m) {
    const d = m && m.data;
    let bytes = null;
    if (d instanceof ArrayBuffer) bytes = new Uint8Array(d);
    else if (d && d.buffer instanceof ArrayBuffer) bytes = new Uint8Array(d.buffer, d.byteOffset || 0, d.byteLength);
    else if (typeof d === 'string') { try { bytes = cryptoMod.base64Decode(d); } catch (_) {} }
    if (bytes) for (const h of messageHandlers) h(bytes);
    else report({ type: 'ws-message-shape', dataType: describe(d) });
  });
  task.onClose(function (e) { for (const h of closeHandlers) h(e); });
  return {
    send(bytes) {
      return wxCall(function (opts) {
        task.send(Object.assign({
          data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        }, opts));
      });
    },
    onMessage(cb) { messageHandlers.push(cb); },
    onClose(cb) { closeHandlers.push(cb); },
  };
}

// Verify the transport crypto against the real client's captured frames.
// Only the parameter set that decrypts a captured body into a decodable
// business message is reported as a hit.
const DECRYPT_COMBOS = [];
for (const L of [12, 16, 8, 4, 24]) {
  for (const where of ['head', 'tail']) {
    for (const aad of ['seq', 'zero']) {
      DECRYPT_COMBOS.push({ name: 'gcm-' + where + L + '-' + aad, cipher: 'gcm', nonce: where + L, aad: aad });
    }
  }
}
DECRYPT_COMBOS.push({ name: 'gcm-host-seq', cipher: 'gcm', nonce: 'host', aad: 'seq' });
DECRYPT_COMBOS.push({ name: 'gcm-host-0', cipher: 'gcm', nonce: 'host', aad: 'zero' });
DECRYPT_COMBOS.push({ name: 'cbc-head16', cipher: 'cbc', nonce: 'head16' });
DECRYPT_COMBOS.push({ name: 'cbc-host', cipher: 'cbc', nonce: 'host' });

async function analyzeCaptures(state, report) {
  const caps = (globalThis.__farmCaptures || []).slice();
  const own = caps.filter(function (c) { return c.ours; }).length;
  report({ type: 'capture-count', total: caps.length, own: own });

  // Prefer the key the real client obtained; compare it with ours.
  const hostKeyRes = globalThis.__farmHostKeyFirst;
  const hostKey = hostKeyRes && hostKeyRes.encryptKey ? toBytes(hostKeyRes.encryptKey) : null;
  let sameKey = null;
  if (hostKey && state.key) {
    sameKey = hostKey.length === state.key.length;
    if (sameKey) for (let i = 0; i < hostKey.length; i++) if (hostKey[i] !== state.key[i]) { sameKey = false; break; }
  }
  report({
    type: 'key-compare', sameKey: sameKey,
    hostKeyLen: hostKey ? hostKey.length : null,
    ourLen: state.key ? state.key.length : null,
  });
  const key = hostKey || state.key;
  if (!key) return;

  const calls = globalThis.__farmCryptoCalls || [];
  report({ type: 'subtle-calls', total: calls.length, shapes: calls.slice(0, 6) });

  // Can our frame script reach the game's own module graph? If yes, the real
  // transport (TSDK encryption) can be driven directly.
  try {
    const g = globalThis;
    const keys = Object.keys(g).filter(function (k) {
      return /^(cc|System|_RF|gamepb|NetNode|AceManager|UserCryptoManager|tsdk|game|exports|define)$/i.test(k) ||
        /game|tsdk|netnode|crypto/i.test(k);
    }).slice(0, 40);
    report({
      type: 'globals-probe',
      keys: keys,
      shapes: [
        'System:' + typeof g.System,
        '_RF:' + typeof g._RF,
        'cc:' + typeof g.cc,
        'wx:' + typeof g.wx,
        'gamepb:' + typeof g.gamepb,
        'NetNode:' + typeof g.NetNode,
        'UserCryptoManager:' + typeof g.UserCryptoManager,
        'tsdk:' + typeof g.tsdk,
      ],
    });
  } catch (e) {
    report({ type: 'globals-probe-fail', err: String(e && e.message || e).slice(0, 150) });
  }

  try {
    const t = globalThis.tsdk;
    const tk = t ? Object.keys(t) : [];
    report({
      type: 'tsdk-probe',
      keys: tk.slice(0, 40),
      shapes: tk.slice(0, 30).map(function (k) { return k + ':' + typeof t[k]; }),
    });
  } catch (e) {
    report({ type: 'tsdk-probe-fail', err: String(e && e.message || e).slice(0, 150) });
  }

  try {
    const Sy = globalThis.System;
    const m = Sy.get('chunks:///_virtual/tsdk_info.mjs');
    const sample = new Uint8Array([8, 1, 18, 2, 104, 105, 24, 2]);
    let enc = null;
    let dec = null;
    let encErr = null;
    let decErr = null;
    try { enc = m.encryptData(sample); } catch (e) { encErr = String(e && e.message || e).slice(0, 120); }
    if (enc) {
      try { dec = m.decryptData(enc); } catch (e) { decErr = String(e && e.message || e).slice(0, 120); }
    }
    report({
      type: 'tsdk-enc-test',
      shapes: [
        'encType:' + (enc && enc.constructor ? enc.constructor.name : typeof enc),
        'encLen:' + (enc && enc.length),
        'encHead:' + (enc ? Array.from(enc.slice(0, 8)).join(',') : ''),
        'decType:' + (dec && dec.constructor ? dec.constructor.name : typeof dec),
        'decLen:' + (dec && dec.length),
        'decHead:' + (dec ? Array.from(dec.slice(0, 12)).join(',') : ''),
        'encErr:' + encErr,
        'decErr:' + decErr,
        'roundTrip:' + (dec && dec.length === sample.length && Array.from(dec).join(',') === Array.from(sample).join(',')),
      ],
    });
    globalThis.__farmTsdk = m;
  } catch (e) {
    report({ type: 'tsdk-enc-test-fail', err: String(e && e.message || e).slice(0, 150) });
  }

  try {
    const Sy = globalThis.System;
    const g = Sy.get('chunks:///_virtual/mygamepb.ts');
    if (g) {
      const gg = g.gamepb || {};
      const itempb = gg.itempb || {};
      const plantpb = gg.plantpb || {};
      report({
        type: 'gamepb-probe',
        shapes: [
          'ns:' + Object.keys(g).slice(0, 12).join(','),
          'gamepbKeys:' + Object.keys(gg).slice(0, 24).join(','),
          'itempb:' + Object.keys(itempb).slice(0, 16).join(','),
          'plantpb:' + Object.keys(plantpb).slice(0, 16).join(','),
          'GameErrorSample:' + (function () {
            const ge = gg.GameError || {};
            const codes = [1000015,1000016,1000017,1000018,1000019,1000021,1000022,1000023,1001009,1001025,1001010,1001011];
            return codes.map(function (c) { return c + '=' + (ge[c] || ge[String(c)] || '?'); }).join(';');
          })(),
        ],
      });
      globalThis.__farmGamepb = gg;
      try {
        // Enumerate the generated service classes so we can see which methods
        // exist (SVIP mall claim, friend-visit interactions, ...).
        const svc = {};
        const seen = new Set();
        let budget = 4000;
        (function visit(obj, prefix, depth) {
          if (!obj || typeof obj !== 'object' || depth > 3 || budget <= 0) return;
          for (const k of Object.getOwnPropertyNames(obj)) {
            if (budget-- <= 0) return;
            let v; try { v = obj[k]; } catch (_) { continue; }
            const path = prefix ? prefix + '.' + k : k;
            if (/Service$/.test(k) && typeof v === 'function') {
              const proto = [];
              try { for (const n of Object.getOwnPropertyNames(v.prototype || {})) if (n !== 'constructor') proto.push(n); } catch (_) {}
              svc[path] = proto.slice(0, 40);
            } else if (depth < 3 && v && typeof v === 'object' && !Array.isArray(v)) {
              if (!seen.has(v)) { seen.add(v); visit(v, path, depth + 1); }
            }
          }
        })(gg, '', 0);
        report({ type: 'service-probe', services: svc, count: Object.keys(svc).length });

        // Resolve the request/reply class names for every service method so new
        // calls (SVIP mall claim, friend visits) can be wired without guessing.
        const types = {};
        for (const svcPath of Object.keys(svc)) {
          const ns = svcPath.split('.')[0];
          const hits = {};
          for (const m of svc[svcPath]) {
            const p = m.charAt(0).toUpperCase() + m.slice(1);
            const req = resolveCls(ns + '.' + p + 'Request');
            const rep = resolveCls(ns + '.' + p + 'Reply') || resolveCls(ns + '.' + p + 'Response');
            if (req || rep) hits[m] = (req ? 'R' : '') + (rep ? 'P' : '');
          }
          if (Object.keys(hits).length) types[svcPath] = hits;
        }
        report({ type: 'types-probe', types: types });

        // Field names/ids straight from the generated protobuf classes.
        const FIELD_PROBE = [
          'mallpb.ClaimMonthCardRewardRequest', 'mallpb.ClaimMonthCardRewardReply',
          'visitpb.EnterRequest', 'visitpb.EnterReply', 'visitpb.LeaveRequest',
          'friendpb.GetGameFriendsRequest', 'friendpb.GetGameFriendsReply',
          'plantpb.WaterLandRequest', 'plantpb.WeedOutRequest',
          'plantpb.CheckCanOperateRequest', 'plantpb.AllLandsRequest',
        ];
        const fields = {};
        for (const fq of FIELD_PROBE) {
          const c = resolveCls(fq);
          if (!c) { fields[fq] = null; continue; }
          let f = null;
          try { f = c.fields || (c.type && c.type.fields) || null; } catch (_) {}
          fields[fq] = f ? Object.keys(f) : 'unknown';
        }
        report({ type: 'fields-probe', fields: fields });

        // The bundle is minified, so the protobuf classes do not expose their
        // field tables. Probe them through the encoder instead: encoding a
        // candidate field name that exists produces non-empty bytes.
        const CANDS = ['id', 'type', 'config_id', 'slot_type', 'day', 'index', 'level',
                       'reward_id', 'item_id', 'host_gid', 'gid', 'uin', 'host_type',
                       'land_id', 'land_ids', 'scene_id', 'page', 'count', 'offset',
                       'is_refresh', 'num', 'goods_id', 'seed_id', 'fertilizer_id'];
        const FIELD2 = {};
        for (const fq of [
          'mallpb.ClaimMonthCardRewardRequest', 'visitpb.EnterRequest', 'visitpb.LeaveRequest',
          'friendpb.GetGameFriendsRequest', 'plantpb.WaterLandRequest', 'plantpb.WeedOutRequest',
          'plantpb.CheckCanOperateRequest', 'taskpb.TaskInfoRequest',
        ]) {
          const c = resolveCls(fq);
          if (!c || typeof c.encode !== 'function') { FIELD2[fq] = null; continue; }
          const found = [];
          for (const n of CANDS) {
            try {
              const o = {};
              o[n] = (n === 'land_ids') ? [1] : 1;
              const b = c.encode(o).finish();
              if (b.length > 0) found.push(n);
            } catch (_) {}
          }
          FIELD2[fq] = found;
        }
        report({ type: 'fields2-probe', fields: FIELD2 });

        // Where do the 每日任务 live? Probe TaskInfoReply field names.
        try {
          const TR = resolveCls('taskpb.TaskInfoReply');
          const tf = [];
          if (TR && typeof TR.encode === 'function') {
            for (const n of ['tasks', 'daily_tasks', 'growth_tasks', 'actives', 'daily_task',
                             'daily', 'task_list', 'task_info', 'daily_task_list', 'task_groups']) {
              try {
                const o = {};
                o[n] = [{}];
                const b = TR.encode(o).finish();
                if (b.length > 0) tf.push(n);
              } catch (_) {}
            }
          }
          report({ type: 'taskfields-probe', fields: tf });
        } catch (_) {}
      } catch (_) {}
    } else {
      report({ type: 'gamepb-probe', shapes: ['null'] });
    }
  } catch (e) {
    report({ type: 'gamepb-probe-fail', err: String(e && e.message || e).slice(0, 120) });
  }

  try {
    const Sy = globalThis.System;
    const names = [];
    if (Sy && typeof Sy.entries === 'function') {
      for (const entry of Sy.entries()) names.push(String(entry && entry[0]));
    }
    const hits = names.filter(function (n) { return /config|plant|crop|seed|farm/i.test(n); });
    report({
      type: 'module-names-probe',
      shapes: [
        'total:' + names.length,
        'configHits:' + hits.slice(0, 40).join(','),
        'gameGlobalKeys:' + Object.keys(globalThis.GameGlobal || {}).slice(0, 30).join(','),
      ],
    });
  } catch (e) {
    report({ type: 'module-names-probe-fail', err: String(e && e.message || e).slice(0, 150) });
  }
  try {
    const census = {};
    for (const c of caps) {
      try {
        const bytes = cryptoMod.base64Decode(c.b64);
        const f = parseFrame(bytes);
        const mt = Number(f.meta.message_type) || 0;
        let svc = f.meta.service_name;
        let meth = f.meta.method_name;
        if ((!svc || !meth) && mt === 3) {
          const ns = notifService(f.body);
          if (ns) { svc = ns; meth = '(notify)'; }
        }
        const key = (svc || '?') + '/' + (meth || '?') + '#' + mt + '@' + String(c.url || '').slice(0, 60);
        census[key] = (census[key] || 0) + 1;
      } catch (_) {}
    }
    const ranked = Object.keys(census).sort(function (a, b) { return census[b] - census[a]; });
    report({
      type: 'frame-census-detail',
      total: caps.length,
      distinct: ranked.length,
      entries: ranked.slice(0, 80).map(function (k) { return { k: k, n: census[k] }; }),
    });
  } catch (_) {}

  let analyzed = 0;
  for (const c of caps) {
    if (c.ours) continue;
    if (analyzed >= 6) break;
    analyzed += 1;
    let bytes;
    try { bytes = cryptoMod.base64Decode(c.b64); } catch (_) { continue; }
    let frame;
    try { frame = parseFrame(bytes); } catch (_) { continue; }
    const meta = frame.meta || {};
    const body = frame.body || new Uint8Array(0);
    const base = {
      type: 'capture-frame', dir: c.dir,
      mt: Number(meta.message_type) || 0,
      service: meta.service_name, method: meta.method_name,
      seq: Number(meta.client_seq) || 0, sseq: Number(meta.server_seq) || 0,
      bodyLen: body.length,
    };
    if (body.length < 24) { report(base); continue; }
    const hits = [];
    if (getTsdk() && typeof getTsdk().decryptData === 'function') {
      try {
        const tp = globalThis.__farmTsdk.decryptData(body);
        let tvalid = false;
        let tfields = null;
        try {
          if (meta.service_name && meta.method_name) {
            const d = decodeResponse(meta.service_name, meta.method_name, tp);
            tvalid = true;
            tfields = Object.keys(d).slice(0, 8);
          }
        } catch (_) {}
        hits.push({ combo: 'tsdk', bytes: tp.length, valid: tvalid, fields: tfields });
      } catch (_) {}
    }
    // GCM with a 12-byte nonce prefix and a matrix of AAD candidates: the
    // client feeds an obfuscated `base64ToBytes(e)` value as AAD, so the exact
    // bytes must be found empirically.
    const seqNo = Number(meta.client_seq) || Number(meta.server_seq) || 1;
    const aadVariants = [];
    const be4 = new Uint8Array(4); new DataView(be4.buffer).setUint32(0, seqNo >>> 0, false); aadVariants.push({ name: 'aad4be', v: be4 });
    const le4 = new Uint8Array(4); new DataView(le4.buffer).setUint32(0, seqNo >>> 0, true); aadVariants.push({ name: 'aad4le', v: le4 });
    const be8 = new Uint8Array(8); new DataView(be8.buffer).setBigUint64(0, BigInt(seqNo), false); aadVariants.push({ name: 'aad8be', v: be8 });
    const vi = []; let xv = seqNo; do { let bb = xv & 0x7f; xv >>>= 7; if (xv) bb |= 0x80; vi.push(bb); } while (xv);
    aadVariants.push({ name: 'aadvarint', v: Uint8Array.from(vi) });
    aadVariants.push({ name: 'aadempty', v: null });
    aadVariants.push({ name: 'aadascii', v: Uint8Array.from(String(seqNo).split('').map(function (c) { return c.charCodeAt(0); })) });
    if (body.length > 28) {
      for (const av of aadVariants) {
        try {
          const plain = await cryptoMod.decryptRawAad(body.subarray(12), key, body.subarray(0, 12), av.v);
          let valid = false;
          let fields = null;
          try {
            if (meta.service_name && meta.method_name) {
              const d = decodeResponse(meta.service_name, meta.method_name, plain);
              valid = true;
              fields = Object.keys(d).slice(0, 8);
            }
          } catch (_) {}
          hits.push({ combo: 'gcm-head12-' + av.name, bytes: plain.length, valid: valid, fields: fields });
        } catch (_) {}
      }
    }
    for (const combo of DECRYPT_COMBOS) {
      try {
        let plain;
        const seq = Number(meta.client_seq) || Number(meta.server_seq) || 1;
        if (combo.cipher === 'gcm') {
          const aad = combo.aad === 'zero' ? 0 : seq;
          let ct;
          let nonce;
          if (combo.nonce === 'host') {
            ct = body;
            nonce = state.nonce;
          } else if (combo.nonce.indexOf('head') === 0) {
            const L = Number(combo.nonce.slice(4));
            ct = body.subarray(L);
            nonce = body.subarray(0, L);
          } else {
            const L = Number(combo.nonce.slice(4));
            ct = body.subarray(0, body.length - L);
            nonce = body.subarray(body.length - L);
          }
          plain = await cryptoMod.decryptRaw(ct, key, nonce, aad);
        } else {
          if (combo.nonce === 'host') {
            plain = await cryptoMod.decryptBodyCbc(body, key, state.nonce);
          } else {
            const L = Number(combo.nonce.slice(4));
            plain = await cryptoMod.decryptBodyCbc(body.subarray(L), key, body.subarray(0, L));
          }
        }
        let valid = false;
        let fields = null;
        try {
          if (meta.service_name && meta.method_name) {
            const d = decodeResponse(meta.service_name, meta.method_name, plain);
            valid = true;
            fields = Object.keys(d).slice(0, 8);
          }
        } catch (_) {}
        hits.push({ combo: combo.name, bytes: plain.length, valid: valid, fields: fields });
      } catch (_) {}
    }
    if (c.dir === 'send' && getTsdk() && globalThis.__farmGamepb) {
      try {
        const tp = getTsdk().decryptData(body);
        const map = { Plant: 'plantpb.PlantRequest', Harvest: 'plantpb.HarvestRequest', AllLands: 'plantpb.AllLandsRequest', PlayerLogin: 'userpb.PlayerLoginRequest', ShopInfo: 'shoppb.ShopInfoRequest', GetMallListBySlotType: 'mallpb.GetMallListBySlotTypeRequest' };
        const cls = map[meta.method_name];
        if (cls) {
          const C = resolveCls(cls);
          const d = C && typeof C.decode === 'function' ? C.decode(tp) : null;
          if (d) {
            let safe = null;
            try { safe = JSON.parse(JSON.stringify(d, function (k, v) { return typeof v === 'object' && v && v.constructor && v.constructor.name === 'Long' ? String(v) : v; })); } catch (_) { safe = { keys: Object.keys(d) }; }
            report({ type: 'capture-req-detail', method: meta.method_name, data: safe });
          }
        }
      } catch (_) {}
    }
    report(Object.assign(base, { hits: hits }));
  }
}

async function callRpc(state, transport, report, svc, method, req, tag) {
  try {
    const r = await rpc(state, transport, report, svc, method, req);
    const err = Number(r.meta && r.meta.error_code) || 0;
    let decoded = null;
    try { decoded = decodeResponse(svc, method, r.plain || r.body); } catch (_) {}
    const summary = {
      type: 'gameplay', tag: tag || method, method, err,
      fields: decoded ? Object.keys(decoded).slice(0, 12) : null,
    };
    if (decoded) summary.decoded = summarizeDecoded(decoded);
    report(summary);
    return { err: err, decoded: decoded };
  } catch (e) {
    report({ type: 'gameplay-fail', tag: tag || method, method, err: String(e && e.message || e).slice(0, 90) });
    return { err: -1, decoded: null };
  }
}

function resolveCls(p) {
  const gg = globalThis.__farmGamepb;
  if (!gg) return null;
  const parts = String(p).split('.');
  let cur = gg;
  for (const k of parts) {
    if (cur == null) return null;
    cur = cur[k];
  }
  return cur || null;
}

// Uses the game's own generated protobuf classes so requests/replies match the
// exact wire schema without hand-maintained field tables.
async function callRpcReal(state, transport, report, svc, method, reqObj, reqPath, respPath, tag) {
  const Req = resolveCls(reqPath);
  const Resp = resolveCls(respPath);
  if (!Req || !Resp || typeof Req.encode !== 'function') {
    report({ type: 'gameplay-fail', tag: tag || method, err: 'class-missing ' + reqPath + '/' + respPath });
    return { err: -1, decoded: null };
  }
  let plainBytes;
  try {
    plainBytes = Req.encode(reqObj || {}).finish();
  } catch (e) {
    report({ type: 'gameplay-fail', tag: tag || method, err: 'encode ' + String(e && e.message || e).slice(0, 80) });
    return { err: -1, decoded: null };
  }
  try {
    const r = await rpc(state, transport, report, svc, method, reqObj, { plainBytes: plainBytes, name: tag || method });
    const err = Number(r.meta && r.meta.error_code) || 0;
    let decoded = null;
    try { decoded = Resp.decode(r.plain || r.body); } catch (_) {}
    if (!decoded || Object.keys(decoded).length === 0) {
      try { decoded = Resp.decode(r.raw || r.body); } catch (_) {}
    }
    report({
      type: 'gameplay-real', tag: tag || method, method, err,
      fields: decoded ? Object.keys(decoded).slice(0, 14) : null,
      decoded: decoded ? summarizeDecoded(decoded) : null,
    });
    return { err: err, decoded: decoded, msg: (r.meta && r.meta.error_message) || '' };
  } catch (e) {
    report({ type: 'gameplay-fail', tag: tag || method, err: String(e && e.message || e).slice(0, 90) });
    return { err: -1, decoded: null };
  }
}

function plantMatureAt(plant) {
  const phases = plant && plant.phases;
  if (!phases || !phases.length) return 0;
  const last = phases[phases.length - 1];
  return Number(last.begin_time) || 0;
}

// Start of the final *growing* stage (the one before maturation). The owner's
// routine is to fertilize here so the crop jumps straight to harvestable.
function plantLastGrowAt(plant) {
  const phases = plant && plant.phases;
  if (!phases || phases.length < 2) return 0;
  return Number(phases[phases.length - 2].begin_time) || 0;
}

async function farmTick(state, transport, report) {
  if (!state || !state.gid) return;
  try {
    const lands = await callRpcReal(state, transport, report,
      'gamepb.plantpb.PlantService', 'AllLands', { host_gid: state.gid },
      'plantpb.AllLandsRequest', 'plantpb.AllLandsReply', 'AllLands-tick');
    if (!lands.decoded) return;
    const list = lands.decoded.lands || [];
    const now = Math.floor(Date.now() / 1000);
    const mature = list.filter(function (l) {
      return l.plant && plantMatureAt(l.plant) > 0 && plantMatureAt(l.plant) <= now;
    }).map(function (l) { return l.id; });

    // Push crops that reached their final growing stage to maturity with normal
    // fertilizer: bag first, then mall purchase, otherwise just wait it out.
    const fertTargets = list.filter(function (l) {
      if (!l.plant) return false;
      const m = plantMatureAt(l.plant);
      const g = plantLastGrowAt(l.plant);
      return m > now && g > 0 && g <= now;
    }).map(function (l) { return l.id; });
    if (fertTargets.length) {
      const NORMAL_FERT = [1003, 1011, 1012, 1013, 1014];
      let fid = 0;
      try {
        const bag = await callRpcReal(state, transport, report,
          'gamepb.itempb.ItemService', 'Bag', {},
          'itempb.BagRequest', 'itempb.BagReply', 'Bag-fert');
        const items = (bag.decoded && bag.decoded.item_bag && bag.decoded.item_bag.items) || [];
        for (const id of NORMAL_FERT) {
          if (items.some(function (x) { return x.id === id && x.count > 0; })) { fid = id; break; }
        }
      } catch (_) {}
      if (!fid) {
        for (const id of NORMAL_FERT) {
          try {
            const buy = await callRpcReal(state, transport, report,
              'gamepb.mallpb.MallService', 'Purchase', { id: id },
              'mallpb.PurchaseRequest', 'mallpb.PurchaseReply', 'Purchase-fert-' + id);
            const okBuy = buy.err === 0 && buy.decoded && buy.decoded.success;
            report({ type: 'fertilize-buy', id: id, err: buy.err, success: !!(buy.decoded && buy.decoded.success) });
            if (okBuy) { fid = id; break; }
          } catch (_) {}
        }
      }
      if (fid) {
        const fr = await callRpcReal(state, transport, report,
          'gamepb.plantpb.PlantService', 'Fertilize',
          { land_ids: fertTargets, fertilizer_id: fid },
          'plantpb.FertilizeRequest', 'plantpb.FertilizeReply', 'Fertilize-last');
        report({ type: 'fertilize-result', lands: fertTargets.length, fertilizer: fid, err: fr.err });
      } else {
        report({ type: 'fertilize-skip', reason: 'no-fertilizer', lands: fertTargets.length });
      }
    }

    if (mature.length) {
      const hv = await callRpcReal(state, transport, report,
        'gamepb.plantpb.PlantService', 'Harvest',
        { land_ids: mature, host_gid: state.gid, is_all: false, host_type: 0, reason: 0 },
        'plantpb.HarvestRequest', 'plantpb.HarvestReply', 'Harvest-tick');
      report({ type: 'harvest-tick-detail', count: mature.length, err: hv.err });
      if (state.plantSeed) {
        for (const lid of mature) {
          await callRpcReal(state, transport, report,
            'gamepb.plantpb.PlantService', 'Plant',
            { items: [{ seed_id: state.plantSeed, land_ids: [lid] }] },
            'plantpb.PlantRequest', 'plantpb.PlantReply', 'Replant-' + lid);
        }
      }
    }
    // Report the crop clock so the tray can schedule the next pass on maturity
    // instead of a fixed interval. Re-read lands after a harvest so replanted
    // crops report their own (future) maturity.
    let view = list;
    if (mature.length) {
      const again = await callRpcReal(state, transport, report,
        'gamepb.plantpb.PlantService', 'AllLands', { host_gid: state.gid },
        'plantpb.AllLandsRequest', 'plantpb.AllLandsReply', 'AllLands-maturity');
      if (again.decoded && again.decoded.lands) view = again.decoded.lands;
    }
    const nowSec = Math.floor(Date.now() / 1000);
    let soonest = 0;
    let soonestFert = 0;
    let planted = 0;
    for (const l of view) {
      if (!l.plant) continue;
      planted += 1;
      const t = plantMatureAt(l.plant);
      if (t > 0 && (soonest === 0 || t < soonest)) soonest = t;
      const g = plantLastGrowAt(l.plant);
      if (g > nowSec && (soonestFert === 0 || g < soonestFert)) soonestFert = g;
    }
    report({
      type: 'maturity', lands: planted, minMatureAt: soonest, lastGrowAt: soonestFert,
      nextInSec: soonest ? Math.max(0, soonest - nowSec) : null,
    });
    report({
      type: 'lands-all',
      lands: view.map(function (l) {
        return {
          id: Number(l.id) || 0,
          crop: l.plant ? String(l.plant.name || '') : '',
          matureAt: l.plant ? plantMatureAt(l.plant) : 0,
          growAt: l.plant ? plantLastGrowAt(l.plant) : 0,
        };
      }).slice(0, 40),
    });

    // Report normal-fertilizer stock so the scheduler knows whether the next
    // wake-up can ripen the crop or has to wait for natural maturity.
    try {
      const fbag = await callRpcReal(state, transport, report,
        'gamepb.itempb.ItemService', 'Bag', {},
        'itempb.BagRequest', 'itempb.BagReply', 'Bag-stock');
      const fitems = (fbag.decoded && fbag.decoded.item_bag && fbag.decoded.item_bag.items) || [];
      const FIDS = [1003, 1011, 1012, 1013, 1014];
      let total = 0;
      const ids = [];
      for (const id of FIDS) {
        const it = fitems.find(function (x) { return x.id === id && x.count > 0; });
        if (it) { total += Number(it.count) || 0; ids.push(id); }
      }
      report({ type: 'fert-stock', total: total, ids: ids });
    } catch (_) {}

    const tasks = await callRpcReal(state, transport, report,
      'gamepb.taskpb.TaskService', 'TaskInfo', { global_scene_id: state.globalSceneId },
      'taskpb.TaskInfoRequest', 'taskpb.TaskInfoReply', 'TaskInfo-tick');
    if (tasks.decoded && tasks.decoded.task_info) {
      const ti = tasks.decoded.task_info;
      const all = [].concat(ti.tasks || [], ti.daily_tasks || [], ti.growth_tasks || []);
      const ids = all.filter(function (t) {
        return t.is_unlocked && !t.is_claimed && Number(t.progress) >= Number(t.total_progress);
      }).map(function (t) { return t.id; });
      report({
        type: 'task-tick-detail', total: all.length, claimable: ids.length,
        states: all.map(function (t) {
          let params = [];
          try {
            params = (t.params || []).map(function (x) {
              if (typeof x === 'string') return x;
              try { return String.fromCharCode.apply(null, Array.from(x)); } catch (_) { return '?'; }
            });
          } catch (_) {}
          return {
            id: String(t.id), p: Number(t.progress), total: Number(t.total_progress),
            claimed: !!t.is_claimed, type: t.task_type,
            cond: Number(t.cond_type), group: Number(t.group),
            desc: t.desc || null, params: params,
          };
        }),
      });
      if (ids.length) {
        await callRpcReal(state, transport, report,
          'gamepb.taskpb.TaskService', 'BatchClaimTaskReward', { ids: ids },
          'taskpb.BatchClaimTaskRewardRequest', 'taskpb.BatchClaimTaskRewardReply', 'BatchClaimTaskReward-tick');
      }
    }
  } catch (e) {
    report({ type: 'farm-tick-fail', err: String(e && e.message || e).slice(0, 120) });
  }
}

async function runGameplay(state, transport, report, basic, loginDecoded) {
  const gid = basic && basic.gid ? basic.gid : 0;
  state.gid = gid;
  report({ type: 'gameplay-start', gid: gid, level: basic && basic.level });

  const pl = await callRpc(state, transport, report,
    'gamepb.userpb.UserService', 'PlayerLogin',
    { device_info: state.deviceInfo || {}, scene_id: '', game_scene_id: 0 }, 'PlayerLogin');
  const globalScene = pl.decoded && pl.decoded.global_scene_id ? pl.decoded.global_scene_id : 0;
  state.globalSceneId = globalScene;

  const lands = await callRpcReal(state, transport, report,
    'gamepb.plantpb.PlantService', 'AllLands', { host_gid: gid },
    'plantpb.AllLandsRequest', 'plantpb.AllLandsReply', 'AllLands');
  if (lands.decoded && lands.decoded.lands) {
    const ls = lands.decoded.lands.map(function (l) {
      const phases = l.plant && l.plant.phases ? l.plant.phases : null;
      const last = phases && phases.length ? phases[phases.length - 1] : null;
      return {
        id: l.id,
        unlocked: !!l.unlocked,
        plant: l.plant ? {
          id: l.plant.id,
          name: l.plant.name,
          grow_sec: l.plant.grow_sec,
          phase: last ? last.phase : null,
          begin_time: last ? last.begin_time : null,
          phase_id: last ? last.phase_id : null,
        } : null,
      };
    });
    state.lands = ls;
    report({ type: 'lands-detail', count: ls.length, lands: ls });
  }

  const bagReqCls = resolveCls('itempb.BagRequest');
  const bagRespCls = resolveCls('itempb.BagReply');
  report({
    type: 'bag-class-probe',
    shapes: [
      'reqFields:' + (bagReqCls && bagReqCls.fields ? Object.keys(bagReqCls.fields).join(',') : 'none'),
      'respFields:' + (bagRespCls && bagRespCls.fields ? Object.keys(bagRespCls.fields).join(',') : 'none'),
    ],
  });
  const profiles = await callRpcReal(state, transport, report,
    'gamepb.shoppb.ShopService', 'ShopProfiles', {},
    'shoppb.ShopProfilesRequest', 'shoppb.ShopProfilesReply', 'ShopProfiles');
  if (profiles.decoded) {
    let safe = null;
    try { safe = JSON.parse(JSON.stringify(profiles.decoded, function (k, v) { return typeof v === 'object' && v && v.constructor && v.constructor.name === 'Long' ? String(v) : v; })); } catch (_) { safe = { keys: Object.keys(profiles.decoded) }; }
    report({ type: 'shop-profiles-detail', data: safe });
  }

  // Seed selection comes from the shop catalogue: highest unlocked seed wins.
  const shopSeeds = await callRpcReal(state, transport, report,
    'gamepb.shoppb.ShopService', 'ShopInfo', { shop_id: 2 },
    'shoppb.ShopInfoRequest', 'shoppb.ShopInfoReply', 'Shop-seeds');
  let mallSeed = 0;
  let mallGoods = 0;
  let mallPrice = 0;
  if (shopSeeds.decoded && shopSeeds.decoded.goods_list) {
    const unlocked = shopSeeds.decoded.goods_list.filter(function (g) { return g.unlocked; });
    unlocked.sort(function (a, b) { return Number(b.price) - Number(a.price); });
    const best = unlocked[0];
    if (best) {
      mallSeed = Number(best.item_id);
      mallGoods = Number(best.id);
      mallPrice = Number(best.price);
    }
    report({
      type: 'mall-seed-detail',
      unlockedCount: unlocked.length,
      allCount: shopSeeds.decoded.goods_list.length,
      seed: mallSeed, goods: mallGoods, price: mallPrice,
      unlocked: unlocked.map(function (g) { return { goods: String(g.id), item: String(g.item_id), price: Number(g.price), cond: (g.conds && g.conds[0]) ? String(g.conds[0].param) : null }; }),
      list: unlocked.map(function (g) { return { goods: Number(g.id), item: Number(g.item_id), price: Number(g.price) }; }),
    });
  }
  state.mallSeed = mallSeed;
  state.mallSeeds = (shopSeeds.decoded && shopSeeds.decoded.goods_list ? shopSeeds.decoded.goods_list.filter(function (g) { return g.unlocked; }).sort(function (a, b) { return Number(b.price) - Number(a.price); }).map(function (g) { return { goods: Number(g.id), item: Number(g.item_id), price: Number(g.price) }; }) : []);
  if (mallSeed) state.plantSeed = mallSeed;

  {
    const bagItemsLogin = (loginDecoded && loginDecoded.item_bag && loginDecoded.item_bag.items) || [];
    const tries = [];
    let chosenSeed = 0;
    const emptyCount = Math.max(1, (state.lands || []).filter(function (l) { return l.unlocked && !l.plant; }).length);
    for (const cand of (state.mallSeeds || [])) {
      const owned = bagItemsLogin.some(function (it) { return Number(it.id) === cand.item && it.count > 0; });
      if (owned) { tries.push({ item: cand.item, owned: true }); chosenSeed = cand.item; break; }
      let buy = await callRpcReal(state, transport, report,
        'gamepb.shoppb.ShopService', 'BuyGoods',
        { goods_id: cand.goods, num: emptyCount, price: cand.price, auto_add: true },
        'shoppb.BuyGoodsRequest', 'shoppb.BuyGoodsReply', 'BuySeed-' + cand.goods);
      tries.push({ item: cand.item, price: cand.price, err: buy.err });
      if (buy.err !== 0) {
        buy = await callRpcReal(state, transport, report,
          'gamepb.shoppb.ShopService', 'BuyGoods',
          { goods_id: cand.goods, num: emptyCount, price: 0, auto_add: true },
          'shoppb.BuyGoodsRequest', 'shoppb.BuyGoodsReply', 'BuySeed0-' + cand.goods);
        tries.push({ item: cand.item, price: 0, err: buy.err });
      }
      if (buy.err === 0) { chosenSeed = cand.item; break; }
    }
    report({ type: 'mall-seed-buy-detail', tries: tries, chosen: chosenSeed });
    if (chosenSeed) { state.mallSeed = chosenSeed; state.plantSeed = chosenSeed; }

    // Preserve existing crops; replant only after harvest.
  }

  const bag = await callRpcReal(state, transport, report,
    'gamepb.itempb.ItemService', 'Bag', {}, 'itempb.BagRequest', 'itempb.BagReply', 'Bag');
  if (bag.decoded) {
    const keys = Object.keys(bag.decoded);
    const arrKey = keys.find(function (k) { return Array.isArray(bag.decoded[k]); });
    report({
      type: 'bag-detail', keys: keys, arrKey: arrKey,
      sample: arrKey ? bag.decoded[arrKey].slice(0, 6) : null,
    });
    state.bag = bag.decoded;
  }

  // ---- planting ----
  let seedId = 0;
  try {
    const bagItems = loginDecoded && loginDecoded.item_bag && loginDecoded.item_bag.items ? loginDecoded.item_bag.items : [];
    const seeds = bagItems.filter(function (it) { return it.id >= 3000 && it.id < 4000 && it.count > 0; });
    if (seeds.length) seedId = Math.max.apply(null, seeds.map(function (x) { return x.id; }));
  } catch (_) {}
  state.seedId = seedId;
  report({ type: 'seed-choice', seedId: seedId });
  const emptyLands = state.lands ? state.lands.filter(function (l) { return l.unlocked && !l.plant; }).map(function (l) { return l.id; }) : [];
  report({ type: 'plant-targets', empty: emptyLands.length, ids: emptyLands.slice(0, 30) });
  const candidates = [];
  if (state.mallSeed) candidates.push(state.mallSeed);
  try {
    const bagItems = loginDecoded && loginDecoded.item_bag && loginDecoded.item_bag.items ? loginDecoded.item_bag.items : [];
    const preferred = [1901, 1902, 20121, 20133, 20167, 20176, 3001, 3002];
    for (const id of preferred) {
      const it = bagItems.find(function (x) { return x.id === id && x.count > 0; });
      if (it && candidates.indexOf(id) === -1) candidates.push(id);
    }
  } catch (_) {}
  if (seedId && candidates.indexOf(seedId) === -1) candidates.unshift(seedId);
  report({ type: 'seed-candidates-detail', candidates: candidates });
  if (!emptyLands.length) report({ type: 'plant-skip', reason: 'no-empty-land' });
  for (const cand of (emptyLands.length ? candidates : [])) {
    const pr = await callRpcReal(state, transport, report,
      'gamepb.plantpb.PlantService', 'Plant',
      { items: [{ seed_id: cand, land_ids: emptyLands.slice(0, 1) }] },
      'plantpb.PlantRequest', 'plantpb.PlantReply', 'Plant-' + cand);
    report({ type: 'plant-attempt-detail', seed: cand, err: pr.err, lands: pr.decoded ? (pr.decoded.land || []).length : null });
    if (pr.err === 0) {
      state.plantSeed = cand;
      const rest = emptyLands.slice(1);
      let okCount = 0;
      for (const lid of rest) {
        await new Promise(function (resolve) { setTimeout(resolve, 600); });
        const pr2 = await callRpcReal(state, transport, report,
          'gamepb.plantpb.PlantService', 'Plant',
          { items: [{ seed_id: cand, land_ids: [lid] }] },
          'plantpb.PlantRequest', 'plantpb.PlantReply', 'Plant-' + lid);
        report({ type: 'plant-rest-detail', seed: cand, land: lid, err: pr2.err, lands: pr2.decoded ? (pr2.decoded.land || []).length : null });
        if (pr2.err === 0) okCount += 1;
      }
      report({ type: 'plant-rest-summary-detail', seed: cand, okCount: okCount, total: rest.length });
      break;
    }
  }

  const tasks = await callRpc(state, transport, report,
    'gamepb.taskpb.TaskService', 'TaskInfo', { global_scene_id: globalScene }, 'TaskInfo');
  if (tasks.decoded && tasks.decoded.task_info) {
    const ti = tasks.decoded.task_info;
    const m = function (arr) {
      return (arr || []).map(function (t) {
        return {
          id: t.id, progress: t.progress, claimed: !!t.is_claimed,
          unlocked: !!t.is_unlocked, type: t.task_type, total: t.total_progress,
        };
      });
    };
    report({
      type: 'tasks-detail',
      tasks: m(ti.tasks), daily: m(ti.daily_tasks), growth: m(ti.growth_tasks),
      actives: (ti.actives || []).map(function (a) {
        return {
          type: a.type, progress: a.progress,
          rewards: (a.rewards || []).map(function (r) {
            return { point_id: r.point_id, need: r.need_progress, status: r.status };
          }),
        };
      }),
    });
  }

  const vip = await callRpc(state, transport, report,
    'gamepb.qqvippb.QQVipService', 'GetQQVipRewardsStatus', {}, 'GetQQVipRewardsStatus');
  if (vip.decoded) {
    report({
      type: 'vip-detail',
      isVip: vip.decoded.is_qq_vip, canClaim: vip.decoded.can_claim,
      claimedToday: vip.decoded.claimed_today, rewardsCanClaim: vip.decoded.rewards_can_claim,
      mallFree: vip.decoded.mall_free_can_claim,
      configs: (vip.decoded.active_configs || []).map(function (c) {
        return { id: c.id, type: c.type, enable: c.is_enable };
      }),
    });
  }

  const daily = await callRpc(state, transport, report,
    'gamepb.qqvippb.QQVipService', 'GetDailyGiftStatus', {}, 'GetDailyGiftStatus');
  if (daily.decoded) {
    report({
      type: 'dailygift-detail',
      canClaim: daily.decoded.can_claim, claimedToday: daily.decoded.claimed_today,
      rewardCount: (daily.decoded.rewards || []).length,
    });
  }

  // ---- write operations ----
  if (vip.decoded && vip.decoded.can_claim) {
    const ids = (vip.decoded.active_configs || [])
      .map(function (c) { return c.id; })
      .filter(function (x) { return x != null; });
    if (ids.length) {
      await callRpc(state, transport, report,
        'gamepb.qqvippb.QQVipService', 'ClaimQQVipRewards', { config_ids: ids }, 'ClaimQQVipRewards');
    }
  }

  if (daily.decoded && daily.decoded.can_claim) {
    await callRpcReal(state, transport, report,
      'gamepb.qqvippb.QQVipService', 'ClaimDailyGift', { config_id: 1 }, 'ClaimDailyGift');
  }

  // SVIP 商城每日免费礼包（月卡权益），状态来自 GetQQVipRewardsStatus.mall_free_can_claim。
  if (vip.decoded && vip.decoded.mall_free_can_claim) {
    const mr = await callRpcReal(state, transport, report,
      'gamepb.mallpb.MallService', 'ClaimMonthCardReward', {},
      'mallpb.ClaimMonthCardRewardRequest', 'mallpb.ClaimMonthCardRewardReply', 'ClaimMonthCardReward');
    report({ type: 'svip-mall-claim', err: mr.err, msg: mr.msg, ok: !!mr.decoded });
  }

  // 月卡礼包按商品 ID 领取：先取月卡商品表，再挑可领取的那一项。
  try {
    const mc = await callRpcReal(state, transport, report,
      'gamepb.mallpb.MallService', 'GetMonthCardInfos', {},
      'mallpb.GetMonthCardInfosRequest', 'mallpb.GetMonthCardInfosReply', 'GetMonthCardInfos');
    if (mc.decoded) {
      report({ type: 'monthcard-detail', keys: Object.keys(mc.decoded), summary: summarizeDecoded(mc.decoded) });
      const list = mc.decoded.month_cards || mc.decoded.infos || mc.decoded.month_card_infos || mc.decoded.list || [];
      const f0 = list[0] || null;
      if (f0) {
        const view = {};
        for (const k of Object.keys(f0)) {
          const v = f0[k];
          if (v === null || ['number', 'string', 'boolean'].indexOf(typeof v) !== -1) view[k] = v;
          else if (Array.isArray(v)) view[k] = 'array(' + v.length + ')';
          else view[k] = typeof v;
        }
        report({ type: 'monthcard-first', item: view });
      }
      let pick = null;
      for (const it of list) {
        if (!it) continue;
        const pid = it.id || it.item_id || it.product_id || it.card_id;
        if (!pid) continue;
        const can = it.can_claim !== undefined ? it.can_claim : (it.claimable !== undefined ? it.claimable : (it.is_claimable !== undefined ? it.is_claimable : undefined));
        if (can === true) { pick = pid; break; }
        if (pick === null) pick = pid;
      }
      if (pick) {
        const mr2 = await callRpcReal(state, transport, report,
          'gamepb.mallpb.MallService', 'ClaimMonthCardReward', { id: pick },
          'mallpb.ClaimMonthCardRewardRequest', 'mallpb.ClaimMonthCardRewardReply', 'ClaimMonthCardRewardById');
        report({ type: 'svip-mall-claim2', id: pick, err: mr2.err, msg: mr2.msg });
      }
    }
  } catch (_) {}

  // 每日任务「在1个好友农场进行互动」：进好友农场浇水一次再离开。
  try {
    const fr = await callRpcReal(state, transport, report,
      'gamepb.friendpb.FriendService', 'GetGameFriends', {},
      'friendpb.GetGameFriendsRequest', 'friendpb.GetGameFriendsReply', 'GetGameFriends');
    if (fr.decoded) {
      report({ type: 'friends-detail', keys: Object.keys(fr.decoded), summary: summarizeDecoded(fr.decoded) });
      const arr = fr.decoded.friends || fr.decoded.game_friends || fr.decoded.list || [];
      const first = arr.find(function (f) { return f && (f.gid || f.uin); });
      if (first) {
        const fgid = first.gid || first.uin;
        await callRpcReal(state, transport, report,
          'gamepb.visitpb.VisitService', 'Enter', { host_gid: fgid, host_type: 0 },
          'visitpb.EnterRequest', 'visitpb.EnterReply', 'Visit-enter');
        const fl = await callRpcReal(state, transport, report,
          'gamepb.plantpb.PlantService', 'AllLands', { host_gid: fgid },
          'plantpb.AllLandsRequest', 'plantpb.AllLandsReply', 'Visit-lands');
        const fll = (fl.decoded && fl.decoded.lands) || [];
        const ftgt = fll.filter(function (l) { return l.plant; }).map(function (l) { return l.id; }).slice(0, 1);
        if (ftgt.length) {
          const w = await callRpcReal(state, transport, report,
            'gamepb.plantpb.PlantService', 'WaterLand', { host_gid: fgid, host_type: 0, land_ids: ftgt },
            'plantpb.WaterLandRequest', 'plantpb.WaterLandReply', 'Visit-water');
          report({ type: 'visit-water', host: String(fgid), land: ftgt[0], err: w.err, msg: w.msg });
        }
        await callRpcReal(state, transport, report,
          'gamepb.visitpb.VisitService', 'Leave', { host_gid: fgid, host_type: 0 },
          'visitpb.LeaveRequest', 'visitpb.LeaveReply', 'Visit-leave');
      }
    }
  } catch (_) {}

  // 商城：用 getMallProfiles 拿真实槽位，再逐个扫描并领取所有"免费且可购买"的商品
  // （含 SVIP 商城每日免费礼包）。
  let slotIds = [0, 1, 2, 3, 4, 5, 6];
  try {
    const mp = await callRpcReal(state, transport, report,
      'gamepb.mallpb.MallService', 'GetMallProfiles', {},
      'mallpb.GetMallProfilesRequest', 'mallpb.GetMallProfilesReply', 'GetMallProfiles');
    if (mp.decoded) {
      report({ type: 'mall-profiles', keys: Object.keys(mp.decoded), summary: summarizeDecoded(mp.decoded) });
      const arr = mp.decoded.profiles || mp.decoded.mall_profiles || mp.decoded.list || [];
      if (arr[0]) report({ type: 'mall-profile-first', keys: Object.keys(arr[0]) });
      const ids = arr.map(function (p) {
        return p.slot_type !== undefined ? p.slot_type : (p.slot !== undefined ? p.slot : p.id);
      }).filter(function (x) { return typeof x === 'number'; });
      if (ids.length) slotIds = Array.from(new Set(ids.concat(slotIds))).sort(function (a, b) { return a - b; });
    }
  } catch (_) {}

  for (const slot of slotIds) {
    const m = await callRpcReal(state, transport, report,
      'gamepb.mallpb.MallService', 'GetMallListBySlotType',
      { slot_type: slot, is_manual_open: true, global_scene_id: globalScene },
      'mallpb.GetMallListBySlotTypeRequest', 'mallpb.GetMallListBySlotTypeReply', 'MallSlot' + slot);
    if (m.decoded && m.decoded.products && m.decoded.products.length) {
      report({
        type: 'mall-detail', slot: slot,
        products: m.decoded.products.map(function (p) {
          return {
            id: p.id, name: p.name, free: !!p.is_free, available: !!p.is_available_purchase,
            restriction: p.restriction ? {
              type: p.restriction.type,
              cur: p.restriction.current_count,
              max: p.restriction.max_count,
            } : null,
          };
        }),
      });
      for (const p of m.decoded.products) {
        if (p.is_free && p.is_available_purchase) {
          const pr = await callRpcReal(state, transport, report,
            'gamepb.mallpb.MallService', 'Purchase', { id: p.id, buy_num: 1 },
            'mallpb.PurchaseRequest', 'mallpb.PurchaseReply', 'Purchase-free-' + p.id);
          report({ type: 'mall-free-claim', slot: slot, id: p.id, err: pr.err, msg: pr.msg });
        }
      }
    }
  }

  await callRpc(state, transport, report,
    'gamepb.qqvippb.QQVipService', 'GetQQVipRewardsStatus', {}, 'VIP-verify');

  // Free daily benefit from mall slot 1 (id 1001 is the free+available entry).
  await callRpc(state, transport, report,
    'gamepb.mallpb.MallService', 'Purchase', { id: 1001, buy_num: 1 }, 'Purchase-1001');
  const mallVerify = await callRpc(state, transport, report,
    'gamepb.mallpb.MallService', 'GetMallListBySlotType',
    { slot_type: 1, is_manual_open: true, global_scene_id: globalScene }, 'MallSlot1-verify');
  if (mallVerify.decoded && mallVerify.decoded.products) {
    const p = mallVerify.decoded.products.find(function (x) { return x.id === 1001; });
    report({
      type: 'purchase-verify',
      found: !!p,
      available: p && !!p.is_available_purchase,
      restriction: p && p.restriction ? { cur: p.restriction.current_count, max: p.restriction.max_count } : null,
    });
  }

  // Shop catalogue: seeds live in ShopService/ShopInfo, gated by unlock conds.
  for (const sid of [1, 2, 3, 4, 5, 6]) {
    const shop = await callRpcReal(state, transport, report,
      'gamepb.shoppb.ShopService', 'ShopInfo', { shop_id: sid },
      'shoppb.ShopInfoRequest', 'shoppb.ShopInfoReply', 'Shop-' + sid);
    if (shop.err === 0 && shop.decoded && shop.decoded.goods_list) {
      report({
        type: 'shop-detail', shop_id: sid,
        goods: shop.decoded.goods_list.map(function (g) {
          return {
            id: String(g.id), item: String(g.item_id), count: Number(g.item_count),
            price: Number(g.price), unlocked: !!g.unlocked,
            limit: Number(g.limit_count), bought: Number(g.bought_num),
            conds: (g.conds || []).map(function (c) {
              const o = {};
              for (const k of Object.keys(c)) { if (k !== 'constructor') o[k] = String(c[k]); }
              return o;
            }),
          };
        }),
      });
    }
  }

  const verify = await callRpcReal(state, transport, report,
    'gamepb.plantpb.PlantService', 'AllLands', { host_gid: gid },
    'plantpb.AllLandsRequest', 'plantpb.AllLandsReply', 'AllLands-verify');
  if (verify.decoded) {
    const list = verify.decoded.lands || [];
    const withPlant = list.filter(function (l) { return l.plant; }).length;
    report({ type: 'plant-verify-detail', withPlant: withPlant, total: list.length });
    const sample = list.filter(function (l) { return l.plant; }).slice(0, 2).map(function (l) {
      return {
        land: l.id, id: l.plant.id, name: l.plant.name,
        grow: Number(l.plant.grow_sec), left_fruit: Number(l.plant.left_fruit_num),
        phases: (l.plant.phases || []).map(function (p) {
          return { phase: p.phase, begin: String(p.begin_time), phase_id: String(p.phase_id) };
        }),
      };
    });
    report({ type: 'plants-detail', sample: sample });

    const tasks2 = await callRpcReal(state, transport, report,
      'gamepb.taskpb.TaskService', 'TaskInfo', { global_scene_id: globalScene },
      'taskpb.TaskInfoRequest', 'taskpb.TaskInfoReply', 'TaskInfo-verify');
    if (tasks2.decoded && tasks2.decoded.task_info) {
      const ti = tasks2.decoded.task_info;
      const all = [].concat(ti.tasks || [], ti.daily_tasks || [], ti.growth_tasks || []);
      const states = all.map(function (t) {
        return { id: String(t.id), p: Number(t.progress), total: Number(t.total_progress), claimed: !!t.is_claimed, type: t.task_type };
      });
      const claimable = all.filter(function (t) {
        return t.is_unlocked && !t.is_claimed && Number(t.progress) >= Number(t.total_progress);
      }).map(function (t) { return t.id; });
      report({ type: 'tasks-state-detail', states: states, claimable: claimable.map(String) });
      if (claimable.length) {
        const cr = await callRpcReal(state, transport, report,
          'gamepb.taskpb.TaskService', 'BatchClaimTaskReward', { ids: claimable },
          'taskpb.BatchClaimTaskRewardRequest', 'taskpb.BatchClaimTaskRewardReply', 'BatchClaimTaskReward');
        report({ type: 'task-claim-result-detail', err: cr.err, items: cr.decoded ? (cr.decoded.items || []).length : null });
      }
    }

    if (list.length) {
      // Only ask for lands whose final phase has actually started; an empty or
      // immature list makes the server answer 1001021.
      const nowSec = Math.floor(Date.now() / 1000);
      const mature = list.filter(function (l) {
        return l.plant && plantMatureAt(l.plant) > 0 && plantMatureAt(l.plant) <= nowSec;
      }).map(function (l) { return l.id; });
      if (mature.length) {
        const hv = await callRpcReal(state, transport, report,
          'gamepb.plantpb.PlantService', 'Harvest',
          { land_ids: mature, host_gid: gid, is_all: false, host_type: 0, reason: 0 },
          'plantpb.HarvestRequest', 'plantpb.HarvestReply', 'Harvest');
        report({ type: 'harvest-result-detail', err: hv.err, mature: mature.length, lands: hv.decoded ? (hv.decoded.land || []).length : null });
      } else {
        report({ type: 'harvest-skip', reason: 'none-mature', planted: list.filter(function (l) { return !!l.plant; }).length });
      }
    }
  }
}

// Renewal path: when the session dies (socket close, gate login errors), fetch a
// brand-new host code with wx.login, reconnect, and re-run Login/PlayerLogin.
async function renewSession(state, report, deviceInfo) {
  if (state.renewing) return;
  state.renewing = true;
  state.renewCount = (state.renewCount || 0) + 1;
  report({ type: 'renew-start', n: state.renewCount });
  let stage = 'code';
  try {
    try {
      state.transport = null;
      if (state.task && typeof state.task.close === 'function') {
        state.task.close({ code: 4000, reason: 'renew' });
      }
      state.task = null;
    } catch (_) {}
    const code = await getCode();
    state.codeAt = Date.now();
    stage = 'open';
    report({ type: 'renew-code', n: state.renewCount, len: code.length, fp: codeFingerprint(code) });
    const url = WS_BASE + '?os=' + encodeURIComponent(OS) + '&ver=' + encodeURIComponent(CLIENT_VERSION) +
      '&code=' + encodeURIComponent(code) + '&platform=' + encodeURIComponent(PLATFORM);
    const task = await openSocket(url, report);
    const transport = makeTransport(task, report);
    transport.onMessage(function (bytes) {
      handleFrame(bytes, state, report).catch(function (e) {
        report({ type: 'handle-fail', err: String(e && e.message || e).slice(0, 120) });
      });
    });
    transport.onClose(function (e) {
      report({ type: 'ws-close-renew', code: e && e.code, reason: e && e.reason });
      if (state.transport !== transport) return;
      state.renewing = false;
      setTimeout(function () {
        renewSession(state, report, deviceInfo).catch(function () {});
      }, 3000);
    });
    state.transport = transport;
    state.task = task;
    state.pending.clear();
    state.seq = 1;

    stage = 'login';
    const login = await rpc(state, transport, report, 'gamepb.userpb.UserService', 'Login',
      { device_info: deviceInfo || {}, scene_id: '', game_scene_id: 0 }, { name: 'Login-renew' });
    const err = Number(login.meta && login.meta.error_code) || 0;
    report({ type: 'renew-login', n: state.renewCount, err: err, decrypted: !!login.plain });
    let plErr = null;
    if (err === 0) {
      stage = 'playerLogin';
      const pl = await rpc(state, transport, report, 'gamepb.userpb.UserService', 'PlayerLogin',
        { device_info: deviceInfo || {}, scene_id: '', game_scene_id: 0 }, { name: 'PlayerLogin-renew' });
      plErr = Number(pl.meta && pl.meta.error_code) || 0;
      report({ type: 'renew-player-login', n: state.renewCount, err: plErr });
    }
    state.renewing = false;
    report({ type: 'renew-done', n: state.renewCount, ok: err === 0, plErr: plErr });
  } catch (e) {
    state.renewing = false;
    report({
      type: 'renew-fail-detail', n: state.renewCount, stage: stage,
      err: String(e && (e.errMsg || e.message) || e).slice(0, 140),
      raw: (function () { try { return JSON.stringify(e); } catch (_) { return null; } })(),
    });
    setTimeout(function () {
      renewSession(state, report, deviceInfo).catch(function () {});
    }, 5000);
  }
}

async function runFarmClient(cfg) {
  const report = makeReporter((cfg && cfg.channel) || 'runtime');
  report({ type: 'boot', href: String(location.href).slice(0, 160) });

  try {
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('error', function (e) {
        report({ type: 'win-error', err: String(e && e.message || e).slice(0, 220) });
      });
      window.addEventListener('unhandledrejection', function (e) {
        const r = e && e.reason;
        report({ type: 'win-rejection', err: String(r && r.stack || r || e).slice(0, 220) });
      });
    }
  } catch (_) {}

  try {
    const code = await getCode();
    report({ type: 'code', len: code.length, fp: codeFingerprint(code) });

    const km = await getKeyMaterial();
    const keyRes = km.res || {};
    report({
      type: 'key-shape',
      methods: km.methods,
      fields: Object.keys(keyRes),
      shapes: Object.keys(keyRes).map(function (k) { return k + ':' + describe(keyRes[k]); }),
    });

    const keyBytes = toBytes(keyRes.encryptKey);
    const nonceBytes = toBytes(keyRes.iv);
    report({
      type: 'key-ready',
      keyLen: keyBytes && keyBytes.length,
      nonceLen: nonceBytes && nonceBytes.length,
      keyRawLen: typeof keyRes.encryptKey === 'string' ? keyRes.encryptKey.length : null,
      ivRawLen: typeof keyRes.iv === 'string' ? keyRes.iv.length : null,
      keyCharset: classifyCharset(keyRes.encryptKey),
      ivCharset: classifyCharset(keyRes.iv),
    });

    const ver = (cfg && cfg.ver) || CLIENT_VERSION;
    const url = WS_BASE + '?os=' + encodeURIComponent(OS) + '&ver=' + encodeURIComponent(ver) +
      '&code=' + encodeURIComponent(code) + '&platform=' + encodeURIComponent(PLATFORM);

    const task = await openSocket(url, report);
    report({ type: 'ws-open-ok' });
    const transport = makeTransport(task, report);

    const state = {
      seq: 1,
      key: keyBytes,
      nonce: nonceBytes,
      pending: new Map(),
      info: null,
      transport: transport,
      task: task,
      renewCount: 0,
      renewing: false,
    };

    transport.onClose(function (e) {
      report({ type: 'ws-close-main', code: e && e.code, reason: e && e.reason });
      if (state.transport !== transport) return;
      setTimeout(function () { renewSession(state, report, deviceInfo).catch(function () {}); }, 3000);
    });

    if (!globalThis.__farmWatchdog) {
      globalThis.__farmWatchdog = setInterval(function () {
        try {
          report({ type: 'alive', seq: state.seq, pending: state.pending.size, key: !!state.key });
        } catch (_) {}
      }, 5000);
    }

    transport.onMessage(function (bytes) {
      handleFrame(bytes, state, report).catch(function (e) {
        report({ type: 'handle-fail', err: String(e && e.message || e) });
      });
    });

    // Give the real client time to exchange frames, then verify our crypto
    // parameters against its captured ciphertext before sending our own.
    await new Promise(function (r) { setTimeout(r, 4500); });
    await analyzeCaptures(state, report);

    if (PASSIVE) { report({ type: 'passive-mode' }); return { ok: true }; }

    // device info for LoginRequest
    let sys = {};
    try { sys = wx.getSystemInfoSync ? wx.getSystemInfoSync() : {}; } catch (_) {}
    const deviceInfo = {
      client_version: String(sys.version || ver),
      sys_software: String(sys.system || 'Windows'),
      sys_hardware: String(sys.model || 'PC'),
      network: String(sys.networkType || 'wifi'),
      screen_width: Number(sys.screenWidth || 0),
      screen_height: Number(sys.screenHeight || 0),
      density: Number(sys.pixelRatio || 1),
    };
    report({ type: 'device-info', fields: Object.keys(deviceInfo), version: deviceInfo.client_version });

    const loginReq = {
      device_info: deviceInfo,
      scene_id: '',
      game_scene_id: 0,
    };

    // Probe crypto parameter combinations until the gateway stops returning
    // ErrSystem (1020001). Each attempt consumes its own client_seq.
    const iv = nonceBytes || new Uint8Array(0);
    const ascii = function (s) {
      const str = String(s == null ? '' : s);
      const o = new Uint8Array(str.length);
      for (let i = 0; i < str.length; i++) o[i] = str.charCodeAt(i);
      return o;
    };
    const asciiKey = keyRes.encryptKey ? ascii(keyRes.encryptKey) : null;
    const asciiIv = keyRes.iv ? ascii(keyRes.iv) : null;
    const variants = [
      { name: 'real-b64ascii', key: keyBytes, cipher: 'real' },
      { name: 'gcm-raw-iv16', key: keyBytes, nonce: iv, aadZero: false, bodyFormat: 'raw' },
    ];
    let loginReply = null;
    const attempts = [];
    for (const v of variants) {
      try {
        report({ type: 'login-try', variant: v.name, seq: state.seq });
        const r = await rpc(state, transport, report, 'gamepb.userpb.UserService', 'Login', loginReq, v);
        const err = Number(r.meta && r.meta.error_code) || 0;
        let keys = null;
        if (r.plain) {
          try {
            keys = Object.keys(decodeResponse('gamepb.userpb.UserService', 'Login', r.plain)).slice(0, 10);
          } catch (e) {
            keys = ['decode-fail:' + String(e && e.message || e).slice(0, 60)];
          }
        }
        attempts.push({ variant: v.name, err, decrypted: !!r.plain, keys });
        report({ type: 'login-variant', variant: v.name, err, decrypted: !!r.plain, keys });
        if (err === 0 || (r.plain && r.plain.basic)) { loginReply = r; break; }
      } catch (e) {
        attempts.push({ variant: v.name, err: 'transport' });
        report({ type: 'login-variant-fail', variant: v.name, err: String(e && e.message || e).slice(0, 120) });
      }
    }
    report({ type: 'login-done', ok: !!loginReply, attempts });

    if (loginReply) {
      let basic = null;
      let loginDecoded = null;
      try {
        const RealReply = resolveCls('userpb.LoginReply');
        if (RealReply && typeof RealReply.decode === 'function') {
          loginDecoded = RealReply.decode(loginReply.plain);
        } else {
          loginDecoded = decodeResponse('gamepb.userpb.UserService', 'Login', loginReply.plain);
        }
        basic = loginDecoded.basic || null;
      } catch (_) {}
      if (basic) {
        // Profile fields the tray app renders (name / level / gold / exp).
        report({
          type: 'profile',
          gid: String(basic.gid || ''),
          name: basic.name || '',
          level: Number(basic.level) || 0,
          exp: Number(basic.exp) || 0,
          gold: Number(basic.gold) || 0,
          big_farm_level: Number(basic.big_farm_level) || 0,
          big_farm_exp: Number(basic.big_farm_exp) || 0,
          last_online: Number(basic.last_online_timestamp) || 0,
        });
      }
      if (loginDecoded) {
        const bagObj = loginDecoded.item_bag;
        const bagInfo = { type: typeof bagObj, isArray: Array.isArray(bagObj) };
        if (bagObj && typeof bagObj === 'object') {
          bagInfo.keys = Object.keys(bagObj).slice(0, 12);
          const arrKey = Object.keys(bagObj).find(function (k) { return Array.isArray(bagObj[k]); });
          bagInfo.arrKey = arrKey || null;
          bagInfo.sample = arrKey
            ? bagObj[arrKey]
              .map(function (it) { return { id: it.id, count: it.count }; })
              .filter(function (it) { return it.id < 10000; })
              .slice(0, 200)
            : null;
        }
        report({ type: 'login-bag-detail', info: bagInfo });
      }
      state.deviceInfo = deviceInfo;
      await runGameplay(state, transport, report, basic, loginDecoded);

      if (cfg && cfg.onePass) {
        // Short-session mode: one full inspection pass, then disconnect and exit.
        // Crops mature on the server clock (phase begin_time), so time passes while
        // offline; a single visit per day is enough to harvest, replant and claim.
        try { await farmTick(state, transport, report); } catch (_) {}
        report({ type: 'one-pass-done' });
        state.transport = null;                 // detach first: keeps onClose from re-entering renewal
        try { if (task && typeof task.close === 'function') task.close({ code: 1000, reason: 'one-pass' }); } catch (_) {}
        try {
          fetch('http://127.0.0.1:17841/evt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'one-pass-done', ts: nowIso() }),
          }).catch(function () {});
        } catch (_) {}
        return { ok: true, onePass: true };
      }

      if (!globalThis.__farmTimers) {
        globalThis.__farmTimers = true;
        globalThis.__farmClientState = state;
        setInterval(function () {
          callRpc(state, state.transport, report, 'gamepb.userpb.UserService', 'Heartbeat',
            { host_gid: state.gid, client_version: CLIENT_VERSION, host_type: 0 }, 'Heartbeat-tick')
            .catch(function () {});
        }, 25000);
        setInterval(function () { farmTick(state, state.transport, report); }, 60000);
        setInterval(function () {
          try {
            fetch('http://127.0.0.1:17841/cmd', { cache: 'no-store' })
              .then(function (r) { return r.json(); })
              .then(function (c) {
                if (c && c.renew) renewSession(state, report, deviceInfo).catch(function () {});
              })
              .catch(function () {});
          } catch (_) {}
        }, 3000);
        setInterval(function () {
          try {
            if (state.codeAt && Date.now() - state.codeAt > 2.5 * 3600 * 1000) {
              report({ type: 'code-age-renew', ageMin: Math.round((Date.now() - state.codeAt) / 60000) });
              renewSession(state, report, deviceInfo).catch(function () {});
            }
          } catch (_) {}
        }, 5 * 60 * 1000);
        report({ type: 'timers-started' });
      }
    }

    globalThis.__farmState = state;
    globalThis.__farmTransport = transport;
    globalThis.__farmRpc = function (svc, method, body) { return rpc(state, transport, report, svc, method, body); };
    report({ type: 'runtime-ready' });
    return { ok: true };
  } catch (e) {
    report({ type: 'fatal', err: String(e && e.stack || e).slice(0, 400) });
    return { ok: false, error: String(e && e.message || e) };
  }
}

async function handleFrame(bytes, state, report) {
  const frame = parseFrame(bytes);
  const meta = frame.meta || {};
  const seq = Number(meta.client_seq);
  const type = Number(meta.message_type);
  const summary = {
    type: 'frame-in',
    mt: type,
    seq: seq,
    sseq: Number(meta.server_seq) || 0,
    service: meta.service_name,
    method: meta.method_name,
    err: Number(meta.error_code) || 0,
    bodyLen: frame.body.length,
    tokenLen: typeof frame.token === 'string' ? frame.token.length : null,
  };

  // Collect candidate plaintexts and pick the first that decodes into a real
  // business message. Requests use TSDK encryption; some frames carry plain
  // nested envelopes, so raw is a candidate too.
  const cands = [];
  const tsdkGlobal = getTsdk();
  if (tsdkGlobal && typeof tsdkGlobal.decryptData === 'function' && frame.body.length) {
    try { cands.push({ name: 'tsdk', bytes: tsdkGlobal.decryptData(frame.body) }); } catch (_) {}
  }
  if (frame.body.length) cands.push({ name: 'raw', bytes: frame.body });
  if (state.key && frame.body.length) {
    const asText = b64AsciiToBytes(frame.body);
    const forms = asText ? [asText, frame.body] : [frame.body];
    for (const bodyBytes of forms) {
      for (const nonceLen of [12, 16]) {
        for (const aadSeq of [seq, Number(meta.server_seq) || 0, 0]) {
          try {
            cands.push({ name: 'aes', bytes: await cryptoMod.decryptBody(bodyBytes, state.key, aadSeq, nonceLen) });
          } catch (_) {}
        }
      }
    }
  }
  let plain = null;
  let decryptor = null;
  for (const c of cands) {
    if (meta.service_name && meta.method_name) {
      try {
        const d = decodeResponse(meta.service_name, meta.method_name, c.bytes);
        if (Object.keys(d).length) {
          plain = c.bytes;
          decryptor = c.name;
          summary.decoded = summarizeDecoded(d);
          break;
        }
      } catch (_) {}
    }
  }
  if (!plain) {
    const fallback = cands.find(function (c) { return c.name === 'tsdk'; }) || cands[0];
    if (fallback) { plain = fallback.bytes; decryptor = fallback.name; }
  }
  summary.decryptor = decryptor;
  summary.rawHead = Array.from(frame.body.slice(0, 16)).join(',');
  summary.decrypted = !!plain;
  if (plain && plain.length) summary.plainHead = Array.from(plain.slice(0, 24)).join(',');

  if (plain && meta.service_name && meta.method_name) {
    const methodKey = mapMethod(meta.method_name);
    try {
      const decoded = decodeResponse(meta.service_name, methodKey, plain);
      summary.decoded = summarizeDecoded(decoded);
      if (meta.service_name === 'gamepb.userpb.UserService' && methodKey === 'Login') {
        state.info = decoded.basic || null;
      }
    } catch (e) {
      summary.decodeErr = String(e && e.message || e).slice(0, 120);
    }
  }

  report(summary);

  const entry = state.pending.get(seq);
  if (entry && type === MESSAGE_TYPE.RESPONSE) {
    state.pending.delete(seq);
    entry.resolve({ meta, body: plain || frame.body, plain: plain, raw: frame.body });
  }
}

function mapMethod(wireMethod) {
  return wireMethod;
}

function summarizeDecoded(decoded) {
  const out = {};
  for (const [k, v] of Object.entries(decoded || {})) {
    if (Array.isArray(v)) out[k] = 'array(' + v.length + ')';
    else if (v && typeof v === 'object' && !(v instanceof Uint8Array)) {
      out[k] = v.basic ? { gid: v.basic.gid, name: v.basic.name, level: v.basic.level } : Object.keys(v).slice(0, 6);
    } else if (v instanceof Uint8Array) out[k] = 'bytes(' + v.length + ')';
    else out[k] = v;
  }
  return out;
}

async function rpc(state, transport, report, service, method, reqObj, opts) {
  const o = opts || {};
  const seq = state.seq++;
  const plain = o.plainBytes || encodeRequest(service, method, reqObj);
  let body;
  const useKey = o.key !== undefined ? o.key : state.key;
  const tsdk = getTsdk();
  if (tsdk && typeof tsdk.encryptData === 'function') {
    body = tsdk.encryptData(plain);
  } else if (useKey) {
    let enc;
    if (o.cipher === 'real') {
      // Exact client scheme: nonce = random 12 bytes, AAD = seqToAad(seq),
      // body = asciiToBytes(base64(nonce || ciphertext || tag)).
      const nonce = randomNonce(12);
      const raw = await cryptoMod.encryptBody(plain, useKey, nonce, seq);
      const b64 = cryptoMod.base64Encode(raw);
      const out = new Uint8Array(b64.length);
      for (let i = 0; i < b64.length; i++) out[i] = b64.charCodeAt(i);
      body = out;
    } else {
      const nonce = o.nonce || state.nonce;
      if (o.cipher === 'cbc') {
        const ct = await cryptoMod.encryptBodyCbc(plain, useKey, nonce);
        if (o.ivPrefixed === false) {
          enc = ct;
        } else {
          enc = new Uint8Array(nonce.length + ct.length);
          enc.set(nonce, 0);
          enc.set(ct, nonce.length);
        }
      } else {
        const aad = o.aadZero ? 0 : seq;
        enc = await cryptoMod.encryptBody(plain, useKey, nonce, aad);
      }
      if (o.bodyFormat === 'b64text') {
        const b64 = cryptoMod.base64Encode(enc);
        const out = new Uint8Array(b64.length);
        for (let i = 0; i < b64.length; i++) out[i] = b64.charCodeAt(i);
        body = out;
      } else {
        body = enc;
      }
    }
  } else {
    body = plain;
  }
  const frame = buildFrame({
    service, method,
    messageType: MESSAGE_TYPE.REQUEST,
    seq,
    body,
    token: o.emptyToken ? '' : randomToken(),
  });
  const promise = new Promise(function (resolve, reject) {
    const timer = setTimeout(function () {
      state.pending.delete(seq);
      reject(new Error('timeout ' + service + '/' + method + ' seq=' + seq));
    }, 12000);
    state.pending.set(seq, { resolve, reject, timer });
  });
  report({
    type: 'rpc-send', service, method, seq,
    plainLen: plain.length, bodyLen: body.length,
    encrypted: !!useKey, variant: o.name || null,
    seqUsed: seq,
    keyLen: useKey ? useKey.length : 0,
  });
  // Do not await the SocketTask success callback: this runtime does not always
  // invoke it for binary frames, which would stall the caller even though the
  // frame was delivered (the server replies normally).
  transport.send(frame).catch(function () {});
  return promise;
}

module.exports = { runFarmClient, toBytes, describe };

};
var runtime = __req("runtime");
var api = {
  runFarmClient: runtime.runFarmClient,
  normalizeKeyBytes: runtime.normalizeKeyBytes,
  toBytes: runtime.toBytes,
  sha16: runtime.sha16,
  pb: __req("pb"),
  schema: __req("schema"),
  crypto: __req("crypto"),
  protocol: __req("protocol")
};
globalThis.__farmClientBundle = api;
return api;
})();
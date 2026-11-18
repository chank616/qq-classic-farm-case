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

# 已从最新缓存还原的真实服务方法

静态执行 `game.js` 内置 VM 后得到 `ServiceMethodName` 常量。业务请求由 protobuf 服务方法承载，不能仅凭字符串拼接出可用请求；仍需从运行时抓取实际网关地址、编码、请求头及响应。

## 登录与会话

- `gamepb.userpb.UserService/Login`
- `gamepb.userpb.UserService/Heartbeat`
- `gamepb.userpb.UserService/PlayerLogin`
- `gamepb.userpb.UserService/GetPlayerData`
- `gamepb.userpb.UserService/RefreshLands`
- `gamepb.userpb.UserService/RefreshVipInfo`
- `gamepb.qqvippb.QQVipService/GetQQVipRewardsStatus`
- `gamepb.qqvippb.QQVipService/ClaimQQVipRewards`
- `gamepb.qqvippb.QQVipService/GetDailyGiftStatus`
- `gamepb.qqvippb.QQVipService/ClaimDailyGift`

## 农场循环

- `AllLands`
- `Plant`
- `Harvest`
- `WaterLand`
- `Insecticide`
- `WeedOut`
- `Fertilize`
- `CheckCanOperate`

## 任务与商城

- `gamepb.taskpb.TaskService/TaskInfo`
- `ClaimTaskReward`
- `ClientReportProgress`
- `ClaimDailyReward`
- `BatchClaimTaskReward`
- `gamepb.shoppb.ShopService/ShopInfo`
- `BuyGoods`
- `gamepb.itempb.ItemService/Bag`
- `gamepb.mallpb.MallService/GetMallProfiles`
- `GetMallListBySlotType`
- `Purchase`

## 证据边界

此文件只记录缓存中反编译得到的服务/方法名。没有把任何方法标记为已调用、已领奖或已成功验证；真实客户端还必须获得动态请求样本，并从 `wx.login` code 与兑换后的 AMS token 分离建模。

## 运行产物

- `tools/run_main.js`：离线加载主包 VM，提取模块导出，不联网、不调用 QQ 运行时。
- `tools/decoded-exports.json`：当前缓存还原出的服务方法、通知类型与服务名。
- `cache-urls.txt`：AppID 资源缓存清单中的 CDN 与本地映射，仅用于定位资源。
- `artifacts/resource-cache-inventory.json`：确认最新源码缓存外还存在两份 QQEX Cocos 运行时资源缓存（8,312 个文件、约 490 MB，含 `plant` 资源包）；检索未找到声明的 `mcboot` 源码或种子/生长配置。
- `artifacts/proto-schema.json`：当前从真实 protobuf 工厂编码探针恢复的 44 个业务消息（235 个字段）和 5 个 gate envelope 消息（16 个字段），字段号与 wire 类型均已提取。它可用于写解码器骨架，不能代替现场业务状态或成功响应验证。
- `artifacts/rpc-map.json`：由离线 VM 调用 53 个生成的服务方法，并将 `rpcCall` 替换为捕获桩，直接取得每个方法的 request/reply 构造器映射。覆盖 User、Task、QQVip、Shop、Mall、Plant 六个服务；不建立网络连接。
- `tools/summarize_gameplay_protocol.js` / `artifacts/gameplay-operation-map.json`：从完整 schema 与 RPC 映射生成 18 个目标玩法请求/响应字段表，包含任务状态、QQVip 免费商城标志、商城商品限制、作物阶段/成长秒数字段；只读取静态提取物，不发送请求。
- `artifacts/proto-schema-full.json`：从同一最新缓存提取上述六个 protobuf namespace 全部 160 个消息类型、649 个业务字段，并含 5 个 gate envelope 类型（16 个字段）及 `KickoutReason`/`Error` 两个 gate enum。字段编号探针无缺项；其中 122 个嵌套字段已映射到具体消息类，另有 map/wrapper 等复杂字段尚未完全归类。`proto-schema.json` 保留核心 44 个消息子集（235 个字段），便于快速查看。
- `artifacts/ws-token-metadata.json`：只记录 WebSocket 外层 field 3 的长度及去重统计，不保存 token 或哈希。792 个出站值在各连接内都不重复，18 个连接合计 776 个不同值。
- `artifacts/ws-sequence-metadata.json`：从脱敏 envelope 汇总 message type、每连接 client sequence 连续性及非零 `Meta.error_code`；不包含帧 payload 或凭据。
- `tools/analyze_session_continuity.js` / `artifacts/session-continuity-summary.json`：仅聚合脱敏心跳帧时间戳并按 30 秒间隔分簇，不包含连接 URL、code、token 或 payload。
- `tools/audit_minigame_packages.js` / `artifacts/miniapp-package-audit.json`：只读解析本地 TQAPKG 目录项，不展开或输出归档二进制内容。
- `tools/audit_runtime_session_refresh.js` / `artifacts/runtime-session-refresh-audit.json`：复核 QQ `QLogic.js` 的 `wx.checkSession`→原生 `refreshSession`→按 `expireIn` 重新调度结构，并检查农场主包/已提取登录方法中的明文引用；阴性字符串结果不证明混淆代码无间接调用。
- `GOAL.md`：完整目标、用户授权的 Computer Use 动态观察方式和当前完成边界。

## 动态验证补充

- WebSocket 网关：`wss://gate-obt.nqf.qq.com/prod/ws`
- 查询参数：`os=Windows`、`ver=<client-version>`、`code=<runtime-code>`、`platform=qq`
- 已观察版本：`1.14.2.15_20260922`、`1.15.0.2_20261001`
- 已观察真实方法：`UserService/Login`、`UserService/Heartbeat`、`UserService/PlayerLogin`、`PlantService/AllLands`、`PlantService/Plant`、`PlantService/Harvest`、`TaskService/TaskInfo`、`QQVipService/GetQQVipRewardsStatus`、`ShopService/ShopInfo`、`ItemService/Bag`、`MallService/GetMallListBySlotType`
- 心跳：脱敏日志的 9 个出站心跳分成 4 个短簇，簇内间隔约 20–25 秒，最长簇跨度 50 秒；没有连续三小时样本。`BOOT`/`OPEN` 有 18 组但只见 10 个 `CLOSE`，无法将所有关闭与心跳可靠配对。日志空档不能证明连接持续，不能据此宣称 code 续命。
- 证据文件：`artifacts/wsframes-analysis.json`（已脱敏）；原始帧只作为本地取证，不用于重放。

## 登录与传输实现补充

- 登录入口：`WxPlatformUtil.platLogin()` → 宿主 `wx.login({timeout: 3000})`；QQ/微信 AMS 兑换分支及字段见 `protocol-analysis.md`。本地代码没有生成或延长旧 code 的算法。
- 边界复核：`_M0_CODESVC_` 与 QQEX `QPageFrame.html` 一致，但只出现在 13 个农场输出帧中的 3 个；每 5 秒尝试获取新 code，最多 600 次后停止。来源证据是 frame 模板差异，不是官方游戏登录逻辑；审计见 `artifacts/frame-injection-lineage.json`。
- 宿主加密材料：`wx.getUserCryptoManager().getLatestUserKey()` 与 `getRandomValues()`。key 到期触发刷新；随机数据按 12 字节切成 nonce 池。
- AES-GCM：GcmCrypto 接受 16/24/32 字节 key 与 12 字节 nonce；4 字节大端 client sequence 作为 AAD；输出为 Base64(nonce || ciphertext || GCM tag)，再解成二进制送入 envelope。
- WebSocket 外层：`gatepb.Message` 为 `meta=field 1`、`body=field 2`、`token=field 3`；`gatepb.Meta` 为 service/method/type/client_seq/server_seq/error_code/error_message/metadata，field 1–8。精确 wire schema 见 `artifacts/proto-schema.json`。
- `NetNode.resetSocketState()` 将 `clientSeq` 初始化为 1、`serverSeq` 初始化为 0，并清空 socket；每次进入 `WebSocket.send()` 路径后 client sequence 加一。字段名由离线 VM 对真实属性写入捕获确认，过程输出见 `artifacts/net-sources-refreshed.txt`。
- 当前状态：这些是缓存静态实现和旧版动态样本相互印证的协议结构；未实现能调用宿主原生 key API 的独立客户端，也未通过线上登录验证。

### `NetNode.send()` 组包路径补证

`tools/inspect_netnode_send_path.js` 对最新 bundle 的注册工厂做隔离 VM 执行，依赖与 socket 均为桩。记录在 `artifacts/netnode-send-path.json`。探针确认 `NetNode.send(requestBytes, methodName, callback, serviceName)` 的控制流会将业务 bytes 与 `clientSeq` 传给 `UserCryptoManager.ins.encryptData()`，随后调用 `AceManager.ins.randomStr()`，并将 `meta`、加密 `body` 和返回 token 放进 `gatepb.Message` 后编码发送。随后单独提取到 `randomStr()` 方法源码，确认它使用 `Math.random()` 和 bundle 字符表生成 65–128 字符的字符串。VM 没有实际加密业务数据或记录随机值，也没有服务端结果。

模块依赖扫描补充发现 `AceManager.ts` 直接依赖 `tsdk_info.mjs`。方法映射确认 AceManager 有 `getToken()` / `getToken2()` 转调 TSDK `getToken`，以及独立的本地 `randomStr()`；没有证据显示后者调用 TSDK。`NetNode.send()` 的常规 field 3 来源已由调用路径和方法实现确认，但每连接首个 152 字节 field 3 的来源仍未知。可复跑脚本：`node tools/inspect_netnode_send_path.js`；AceManager 的类工厂检查：`node tools/inspect_ace_manager_static.js`。

## RPC 类型映射补充

`tools/extract_proto_schema.js <game.js> <schema.json> --rpc-map <rpc-map.json>` 在隔离 VM 中执行生成方法并捕获 `rpcCall` 参数，因此 request/reply 类型来自运行时代码引用，而不是按命名规则猜测。已确认 53 个方法全部对应到缓存中实际存在的消息构造器；请求类型、响应类型的字段结构见 `proto-schema-full.json`。使用 `--full-schema` 可生成六个 namespace 的完整消息 schema。脚本不建立网络连接。这证明客户端生成的类型绑定，不证明网关编码细节、加密配置、登录有效性或业务请求可被服务端接受。

目标功能相关的实际消息绑定如下（为代码中的 camelCase 方法名；业务对外的 service/method 大小写仍以动态 envelope 中的服务名为准）：

| 服务方法 | 请求 → 响应 | 已恢复的关键请求字段 |
|---|---|---|
| `UserService.login` | `LoginRequest` → `LoginReply` | `device_info`、`scene_id`、分享/实验参数 |
| `UserService.heartbeat` | `HeartbeatRequest` → `HeartbeatReply` | `host_gid`、`client_version`、`host_type` |
| `UserService.playerLogin` | `PlayerLoginRequest` → `PlayerLoginReply` | 与登录请求相近的设备、场景、分享参数 |
| `TaskService.taskInfo` | `TaskInfoRequest` → `TaskInfoReply` | `global_scene_id` |
| `TaskService.claimTaskReward` | `ClaimTaskRewardRequest` → `ClaimTaskRewardReply` | `id`、`do_shared` |
| `TaskService.batchClaimTaskReward` | `BatchClaimTaskRewardRequest` → `BatchClaimTaskRewardReply` | `ids` |
| `TaskService.claimDailyReward` | `ClaimDailyRewardRequest` → `ClaimDailyRewardReply` | `type`、`point_ids` |
| `QQVipService.getQQVipRewardsStatus` / `getDailyGiftStatus` | 对应空请求 → 状态响应 | 响应含 VIP 状态、可领/已领标志、奖励配置；会员状态另含 `mall_free_can_claim` |
| `QQVipService.claimQQVipRewards` / `claimDailyGift` | 对应领奖请求 → 奖励响应 | `config_ids` / `config_id` |
| `MallService.getMallListBySlotType` | `GetMallListBySlotTypeRequest` → `GetMallListBySlotTypeReply` | `slot_type`、`is_manual_open`、`global_scene_id` |
| `MallService.purchase` | `PurchaseRequest` → `PurchaseReply` | `id`、`buy_num`；响应含 `success`、`reward_items` |
| `PlantService.allLands` / `plant` / `harvest` | 对应请求 → 农田/奖励响应 | 播种请求含 `land_and_seed`、`items`；收获含 `land_ids`、`is_all` 等 |

免费化肥商品的动态 `slot_type`、商品 ID、购买限制与服务端成功响应仍待确认；字段名/请求类型不能直接推导出正确的免费领奖调用。

修正 Cocos decorator stub 后，AceManager 的混淆方法名已从类原型提取确认：`randomStr()` 使用 `Math.random()` 生成 64–127 个字符并附加 `=`（总长 65–128），而 `NetNode.send()` 直接调用它并把返回值写进 `gatepb.Message.token`。类中 `getToken()` / `getToken2()` 是另一组转调 TSDK `getToken` 的方法；没有证据将 TSDK 返回对象与本地 WebSocket field 3 对应。脱敏历史帧每连接恰有一条长度 152 的首个 token，超出 `randomStr()` 范围；其来源仍未确认。不得把该字段等同于 AMS 会话 token 或已复原的服务端签名；细节见 `artifacts/ace-token-candidate.json` 和 `artifacts/ace-manager-static.json`。

消息层已提供玩法状态机所需字段：`TaskInfoReply.task_info` 含 `growth_tasks`、`daily_tasks`、`tasks`、`actives`；`Task` 含 `id`、`progress`、`is_claimed`、`is_unlocked`、`rewards`、`task_type`。QQVip 状态响应给出 `can_claim`、`claimed_today`、`active_configs` 和 `mall_free_can_claim`，领奖请求需要账号当前状态返回的 `config_id/config_ids`。农田 `LandInfo.plant` 指向 `PlantInfo`，包含 `phases` 与 `grow_sec`；相位含 `begin_time`、`phase_id` 等字段，可用于成熟状态计算，但种子等级/解锁要求配置仍未从缓存资源中找到。

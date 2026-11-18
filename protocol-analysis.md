# QQ 经典农场协议逆向记录

更新时间：2026-10-17（Asia/Shanghai）

## 持续目标与动态观察方式

用户要求最终实现真实协议客户端，并明确授权：后续动态研究与验证可直接使用 Computer Use 操作可访问的 QQ 客户端/农场界面，无需逐步重复询问。该授权已写入 GOAL.md，属于持续目标的一部分，与静态缓存分析并行推进。此前一次成功的 Computer Use 读取显示 QQ 小程序中心提示“你暂未授权，授权后玩海量微信小游戏”；本轮 Computer Use 应用枚举未返回 QQ 或其他桌面应用，仅见一个无关 Chrome 标签，因而无法刷新当前 QQ 窗口状态。未进行账号授权、登录交互或任何游戏内写操作。QQ 运行时产生的 `wx.login` code 必须由宿主正常签发；截至目前没有找到能续命或延长原始 code 的证据。

## 当前结论

本机缓存中可确认的最高版本是 `client_1.15.0.2`，AppID `1112386029`，目录：

`C:\Users\chank616\AppData\Roaming\QQEX\miniapp\temps\miniapp_src\1112386029_3_3443f89042dffbf93d20ced1d652d031`

这份缓存包含 99 个文件，包含约 9.9 MB 的 `game.js`、`game.json`、`project.config.json`、`subContext.js`、资源和 wasm 文件。`game.json` 声明了 `subpackages/mcboot/`，但当前目录及其余 14 个同 AppID 缓存版本中都没有这个子包。另发现两份 QQEX 运行时 Cocos 资源缓存，共 8,312 个文件、约 490 MB，包含 `plant`、`extraRes`、`mainscene` 等资源包；在这些缓存的 JS/JSON/HTML 中没有找到 `mcboot` 文本，`plant` 清单中也未发现种子/生长字段配置。资源缓存可补充视觉和场景资源，但目前不能替代缺失的玩法逻辑源包。清单见 `artifacts/resource-cache-inventory.json`。

## 已还原的登录态链路

在主包 `game.js` 的运行时封装中找到两条登录兑换分支：

```text
wx.login() 回调 code
  ├─ js_code + appid + a=<常量> → 运行时登录接口
  └─ wxcode + appid + action=<常量> → QQ/AMS 登录接口
```

成功响应会保存以下字段：

```text
openid
ieg_ams_session_token
ieg_ams_token
ieg_ams_token_time
ieg_ams_token_v2
unionid
```

主包本身没有出现 `code2Session`、明文 `wx.login` 调用或 refresh-token 字段。`wx.login` 是由 QQ 运行时提供，主包通过运行时抽象层接收 code 并兑换 AMS 会话字段。`ieg_ams_token_time` 是时间字段，不能据此推导出可延长原始 `code` 的方法；原始 code 与兑换后的会话 token 是两种不同凭据。

### 登录 code 获取脚本的归属和作用

对本机所有 `out_page-frame.html` 做只读检索后，`_M0_CODESVC_` 只在同 AppID 的三个输出缓存版本中出现，未在 `game.js` 或 `apiIgnore.js` 中检出。进一步比对 QQEX 运行时模板发现：`QPageFrame.html.m0bak` 是 459 字节、无 script 的模板；当前 `QPageFrame.html` 为 1,390 字节并包含该 inline script，脚本 SHA-256 为 `16bd334e…6b14a5a`。同 AppID 有 13 个带 `out_page-frame.html` 的缓存版本，其中 3 个带有与模板逐字节相同的脚本，均追加在 QQ `apiIgnore.js` 标签之后，另 10 个没有该 marker。该证据支持本机 QQEX frame 模板层注入，不支持它来自农场官方主包；具体注入者/安装来源仍无法从文件确认。可复跑 `node tools/audit_frame_injection_lineage.js`，结果见 `artifacts/frame-injection-lineage.json`。

脚本启动后设置 5 秒间隔，调用宿主 `wx.login()`；收到 code 时把它放入 JSON POST 到 `http://127.0.0.1:17841/evt`。计数到 600 次后清除定时器，理论运行窗口约 50 分钟，并非持续三小时。它请求的是新的宿主 code，不能续长、恢复或续用已经过期的旧 code。脚本只能证明缓存中存在这段获取/转交逻辑，不能证明它曾经执行成功、监听服务曾收到数据，或其作者/安装来源。对 17841 端口的当前只读监听查询结果为无监听进程；这不代表过去的状态。

这也进一步划清了机制边界：code 的实际生成仍由 QQ 原生宿主完成，frame 脚本只是周期性调用 API 并转交返回值。静态文件中看不到宿主生成算法、code TTL 或 AMS token 的续期接口。不能把此脚本视为官方游戏登录逻辑或会话刷新协议。

另一条本机注入迹象来自 QQEX `dynamic_package/exMiniProgram/3.3.15/3.3.15` 下的 `appNormal.asar` 三个副本：当前 `appNormal.asar` 与 `appNormal.asar.m0bak` 的整包 SHA-256 完全相同；`appNormal.asar.m0new` 比备份多 701 字节，解包比较仅 `app/index.js` 改变，新增 701 字节前缀注册 Electron `ipcMain` 的 `m0-code`、`m0-frames` 监听器，将收到的数据写入 `%TEMP%\m0_code.log`、`m0_frames.ndjson` 及 `m0_trace.log`。`app/miniapp/apiIgnore.js` 在三个副本中哈希相同。当前 `.asar` 与未修改备份一致，故 staged `.m0new` 补丁并未体现在当前 archive。它证明本机存在单独的 M0 采集/日志变体，但不证明此变体正在运行，也未证明它的 IPC 与 `_M0_CODESVC_` 的 HTTP 转发属于同一条数据路径；没有打开上述可能含 code 的日志。复核脚本与摘要见 `tools/audit_appnormal_m0_patch.js`、`artifacts/appnormal-m0-patch-audit.json`。

## 运行时、游戏代码与额外脚本边界

| 层 | 证据 | 结论 |
|---|---|---|
| 游戏主包 | `game.js`、Cocos/System 模块、资源引用 | 负责游戏引导和运行时适配；部分登录桥接在其中，但核心玩法子包缺失 |
| QQ 运行时 | `QGame.js`、`apiIgnore.js`、`wx.*` API | 提供 `wx.login`、`wx.request`、WebSocket 等宿主能力，不等于业务协议 |
| 额外注入 | `out_page-frame.html` 尾部的 `_M0_CODESVC_` | 每 5 秒尝试 `wx.login`，把 code POST 到 `http://127.0.0.1:17841/evt`；它不在游戏模块中，不能当作官方业务逻辑 |
| 缺失子包 | `game.json` 的 `subpackages/mcboot` 声明 | 当前缓存没有对应文件，任务、商城、农场 RPC 仍缺证据 |

额外注入脚本不会被本项目执行，也不会把登录 code 转发到本机监听端口。

## 其他静态证据

- 主包使用 `wx.request` 的已确认调用之一是腾讯反作弊 SDK 的时间同步：`https://api.anticheatexpert.com/test`。这不是农场业务接口，不能用来推断农场协议。
- 主包有 `wx.connectSocket`/WebSocket 兼容层，但当前静态文本不足以证明农场业务使用哪个 URL、握手字段或消息格式。
- `game.js` 被自定义字节码/字符串混淆器包装（`globalThis._Аce_7716`），直接搜索明文 URL、任务名和商城名会漏报；需要对特定模块做离线解码并交叉验证调用参数。

## 当前不能确认的项目

以下内容在缺失 `mcboot`、缺少经过授权的动态网络观察前均不能写成“已实现”：

1. `wx.login` code 的生成算法。现有证据显示它由 QQ 运行时签发，不是在 `game.js` 中计算。
2. code 的精确有效期、是否一次性使用，以及是否存在官方 refresh 接口。
3. AMS token 的签名、请求头、续期条件和失效错误码。
4. 每日三个任务、SVIP 奖励、商城免费化肥、最高级作物、收获与重新种植的业务 RPC。

## 新增静态还原结果（2026-10-17）

对 `game.js` 内置 `globalThis._Аce_7716` 字节码解释器做了离线执行，成功恢复 `ServiceMethodName` 模块。核心业务方法名已从混淆索引中还原，确认它们属于 protobuf 服务层：

- 登录/会话：`Login`、`PlayerLogin`、`Heartbeat`、`GetPlayerData`、`RefreshVipInfo`
- 农场：`AllLands`、`Plant`、`Harvest`、`WaterLand`、`Insecticide`、`WeedOut`、`Fertilize`、`CheckCanOperate`
- 每日任务：`TaskInfo`、`ClaimTaskReward`、`ClientReportProgress`、`ClaimDailyReward`、`BatchClaimTaskReward`
- SVIP/每日礼：`GetDailyGiftStatus`、`ClaimDailyGift`、`GetQQVipRewardsStatus`、`ClaimQQVipRewards`
- 商城/背包：`ShopInfo`、`BuyGoods`、`GetBag`、`GetMallProfiles`、`GetMallListBySlotType`、`Purchase`

同一模块还原出服务名，例如 `gamepb.userpb.UserService`、`gamepb.taskpb.TaskService`、`gamepb.shoppb.ShopService`、`gamepb.qqvippb.QQVipService` 与 `gamepb.mallpb.MallService`。这些是方法/服务标识，不是可直接访问的 HTTP URL；请求仍需 protobuf 编码、网关地址、Cookie/Header 与运行时会话状态。

在 QQEX 的另一层资源缓存中发现了 AppID 对应的 `gamecaches`：

`C:\Users\chank616\AppData\Roaming\QQEX\miniapp\fs\2351686624\1112386029\usr\gamecaches\`

其中包含 `cacheList.json`、`mainscene`、`extraRes`、`delayRes` 等资源清单。清单中没有 `mcboot` 或业务 protobuf 网关记录；它主要是 Cocos 资源缓存，不能替代缺失的子包或动态网络样本。

## 下一步动态核验顺序

只对当前 QQ 小程序窗口做观察和记录，按以下顺序建立证据：

1. 记录一次正常打开小程序时 QQ 运行时产生的 `wx.login` 回调与兑换结果，不记录或导出账号秘密。
2. 观察登录兑换请求的 URL、方法、参数名、响应字段和 token 时间字段；将 code 与兑换 token 分开建模。
3. 在不执行领奖或农场写操作的前提下，先观察启动后的只读初始化请求，定位 `mcboot` 或其替代资源。
4. 对每日任务、奖励、商城和种收操作分别建立请求/响应样本与状态机；每一步都保留成功与失败条件。
5. 只有上述证据齐全后才实现客户端适配器；客户端默认使用官方重新登录/续期路径，不能伪造或延长原始 code。

## 动态观察状态

此前 Computer Use 曾遇到一次截图超时，并因窗口出现新的用户输入而停止。当时没有执行登录、领取、农场写入或提交网络请求。最新一次恢复和重试结果见下文“QQ Computer Use 最新状态”。

## Protobuf runner 核验（2026-10-17）

早期 `inspect_pb_min.js` 等实验使用通用 Proxy 代替 protobuf runtime，结果只能用于定位模块依赖，不能作为 schema 证据。该限制已由 `tools/extract_proto_schema.js` 取代：它在隔离 VM 中加载最新缓存的共享 root 和六个真实 `System.register` protobuf 工厂，并用本机 `protobufjs/minimal` 执行生成的编码器。对每个字段单独编码以读取 wire tag；随后离线调用全部 53 个服务方法，以 `rpcCall` 捕获桩取得实际 request/reply 构造器。当前产物为 160 个消息类型、649 个业务字段、5 个 gate envelope 类型及 53 组完整 request/reply 类型绑定，映射缺失检查为 0；同时由编码调用轨迹映射出 122 个嵌套消息字段。剩余 map、wrapper 等复杂字段类型尚未完全归类。

这一步补齐的是缓存内生成代码定义，不是完整的真实请求包：运行时配置、加密后的 body、token、当前账号值及服务端响应仍必须由动态证据验证。`protobufjs@8.8.1` 是供离线提取使用的开发依赖，不构成可连接游戏服务端的客户端实现。

QQ Computer Use 最新状态（2026-10-17）：`sky.list_apps()` 已枚举到 QQ 的 `QQ(窗口)` 与 `QQ` 两个窗口；截图捕获连续超时。随后对重新枚举得到的 `QQ(窗口)` 使用无截图的可访问性读取成功，确认 URL 为 `https://q.qq.com/qqweb/miniapp-center/index.html`，标题“小程序中心”，页面提示“你暂未授权，授权后玩海量微信小游戏”，当前页面没有目标游戏。未点击授权入口，也未读取或导出登录 code、Cookie、AMS token 等账号凭据。

## 交付状态核验

| 目标 | 当前证据 | 状态 |
|---|---|---|
| 最新缓存和官方代码/运行时/注入代码边界 | 本文缓存目录、`game.js`、`out_page-frame.html` 静态检查记录 | 静态记录完成；尚未补充可信动态对照 |
| code 生成、兑换与约三小时会话生命周期 | 主包只表明 code 来自 `wx.login`，并存在 AMS 兑换分支及 token 存储字段 | 生成算法、精确时效、续期条件均未证实 |
| 请求签名、服务端调用链、网关和玩法 RPC schema | 已有脱敏动态 envelope/方法样本、静态加密/传输链路、53 组 request/reply 类型映射和完整字段 schema | 部分完成；加密开关、token 来源和线上 key 参数未证实；序号初始化已从 VM 探针确认 |
| 每日任务、SVIP 奖励、免费化肥和种收循环 | 静态方法名 | 未动态验证，未实现线上操作 |
| 客户端运行验证 | 尚无连接服务端的客户端 | 未完成 |

以上状态表用于避免把静态方法名或离线原型误报为线上功能完成。

## 已解析的真实动态 WebSocket 样本（2026-10-17）

此前“缺少动态样本”的结论已修正。QQEX 注入 hook 目录中存在只读抓取文件：

`C:\Users\chank616\AppData\Roaming\QQEX\miniapp\fs\2351686624\1112386029\usr\wsframes.jsonl`

本轮使用 `tools/analyze_wsframes.js` 解析 2,167 条事件，输出脱敏结果到 `artifacts/wsframes-analysis.json`。脚本只保存 URL 中的 `<redacted>` 占位符、方法名、长度、方向、时间和 envelope 字段摘要；`Message.token` 的 field 3 仅保留长度，不写入其文本值，不保存 code、完整 payload 或账号标识。

### WebSocket 握手

样本中出现的网关形状为：

```text
wss://gate-obt.nqf.qq.com/prod/ws?os=Windows&ver=<client-version>&code=<runtime-code>&platform=qq
```

捕获到两个客户端版本：`1.14.2.15_20260922` 和 `1.15.0.2_20261001`。同一连接中 `code` 只出现在 OPEN URL；帧 envelope 没有把它作为明文业务字段重复发送。历史样本显示同一 code 可用于短时间内的重连，而新一轮登录会产生新的 code。这个观察不能证明 code 的绝对有效期，也不能推导出可延长原始 code 的接口。

### Envelope 结构

请求的外层 protobuf 至少包含：

```text
field 1 (bytes): { field 1 = service, field 2 = method, field 3 = message_type, field 4 = client_seq, field 5 = server_seq }
field 2 (bytes): 加密或二进制业务 payload
field 3 (bytes): 随每条出站请求变化的不透明值；精确语义未知，不等同于已知 AMS 登录 token
```

响应通常包含：

```text
field 1 (bytes): { field 3 = 状态/序号等标志 }
field 2 (bytes): { field 1 = service, field 2 = method, field 8 = x-traceid 元数据 }
field 2 的后续字段：业务 protobuf 内容
```

服务名和方法名在 envelope 中是明文，例如 `gamepb.userpb.UserService/Login`；业务 payload 不是可直接当作 JSON 的明文。`x-traceid` 只作为响应元数据被识别，没有写入报告。

### 实际调用时序

动态样本真实出现以下业务方法：

- 会话：`Login`、`PlayerLogin`、`Heartbeat`
- 初始化：`AllLands`、`TaskInfo`、`GetQQVipRewardsStatus`、`ShopInfo`、`gamepb.itempb.ItemService/Bag`、`GetMallListBySlotType`
- 农场：`Fertilize`、`Plant`、`Harvest`、`RemovePlant`、`Farming`
- 其他：`ActivityService/Operate`、`FriendService/SyncAll`、邮件、活动、反作弊和公告服务

旧版本样本的心跳请求时间差集中在约 25,000 ms；响应通常在几十毫秒内返回。部分连接在没有响应的情况下重新发送心跳，说明客户端需要以连接状态和响应超时驱动重连，不能只靠固定定时器维持登录。

### 目标功能的证据边界

动态文件中目前确认有 `Plant` 和 `Harvest` 的真实帧，也有 `TaskInfo` 与 `GetQQVipRewardsStatus` 的读取帧；本快照没有确认 `ClaimTaskReward`、`BatchClaimTaskReward`、`ClaimDailyReward`、`ClaimQQVipRewards` 或 `Purchase` 的成功写操作。因此这些功能仍不能标记为已实现。下一步应从同一版本的用户主动操作样本中补齐写请求与成功响应，再接入客户端适配器。

### code 复用与生命周期观测

`tools/analyze_login_lifecycle.js` 对 OPEN URL 只在内存中比较 `code`，输出不包含 code 本身，结果保存于 `artifacts/login-lifecycle.json`：

- 18 次 OPEN 中有 17 个不同 code；
- `1.14.2.15_20260922` 样本 15 次建连，只有 1 个 code 在约 13 秒内复用 2 次；
- `1.15.0.2_20261001` 样本 2 次建连，均为不同 code；
- 没有一条样本覆盖约三小时，因此不能把“三小时”写成已验证 TTL；
- 该样本支持“code 由宿主签发并用于 WS 建连，短时间重连可能复用”的模型，不支持“客户端可以自行续命原始 code”的模型。

要实现持续挂机，客户端状态机应在连接失效或登录错误时重新调用 QQ 宿主登录入口获得新 code，再重新走官方兑换/建连流程；在没有宿主登录能力时，不能用算法生成或延长 code。

### 解析工具

`tools/analyze_wsframes.js` 是离线只读解析器。它不连接网关、不重放帧、不使用捕获的 code/token，也不修改 QQEX 缓存。

## 扩展缓存清点（2026-10-17）

重新遍历当前 QQEX 本地缓存得到以下结果：

| 缓存位置 | 文件数 | 总大小 | 与业务包相关的发现 |
|---|---:|---:|---|
| `miniapp_src` 下 AppID `1112386029` 的版本目录 | 15 个版本 | — | 最新目录仍为 `client_1.15.0.2`；15 个版本目录都没有名为 `mcboot` 的路径 |
| `miniapp_pkgs` | 32 个 TQAPKG 文件 | 3,619,712 字节 | 16 个版本 ID；仅有 `__ccWasmAssetSubpkg__` / `__ccWasmChunkSubpkg__` 两类共 48 个归档条目，0 个 mcboot 包或条目 |
| `miniapp/fs/2351686624/1112386029` | 7,748 | 444,657,322 字节 | 主要是哈希临时资源与游戏资源；可识别文件名中没有 mcboot / gateway / login / farm 线索；其中 `cacheList.json` 有 6,745 条 URL 索引记录，0 条引用 mcboot |
| `miniapp/fs/3310219138/1112386029` | 1,581 | 54,903,209 字节 | 可识别文件名中没有 mcboot / protobuf / gateway / login / farm 线索；其中 `cacheList.json` 有 1,481 条 URL 索引记录，0 条引用 mcboot |
| `miniapp_src` 全部应用缓存 | 1,574 | 143,207,006 字节 | AppID `1112386029` 版本共 15 个；同目录的其他应用含有无关登录组件，不能误归到农场 |

`fs/2351686624/1112386029/usr/__proto_fields__.json` 虽然名称像 protobuf schema，但实际内容是 70 条运行时字段观测事件，主要记录 QQ 文件系统 API、Socket 对象、Cocos 渲染对象和 `gamepb` 命名空间的键。它没有 protobuf 字段编号、消息定义或 RPC 参数，因此不能用来恢复业务 wire schema。这个文件只作为 QQEX 运行时观测日志，不作为官方协议文件。

缓存清点将“缺失 mcboot”从仅检查最新包扩展为：15 个源码版本、两个资源目录及其 `cacheList.json` 映射、`miniapp_pkgs` 中 32 个 TQAPKG 归档均未找到对应子包目录、映射、归档或条目。最新 `client_1.15.0.2` 的 `miniapp_pkgs` 只含 174 字节的 wasm loader、201,755 字节的 `spine.wasm` 和 24,156 字节的 Cocos chunk loader。`node tools/audit_minigame_packages.js` 可复核归档总数、条目路径和 mcboot 命中数。`game.json` 声明了 Cocos 资源服务器 `https://cdn-resource.nqf.qq.com/release/` 和 bundle 版本 `mcboot=7c4df`，但本地没有该 bundle 资产索引。对猜测路径 `https://cdn-resource.nqf.qq.com/release/remote/mcboot/config.7c4df.json` 的一次 HEAD 请求返回 404；`mcboot` 被声明为小程序子包，猜测的 remote-bundle 路径并不一定适用，因此该 404 不能证明远端包不存在。哈希临时资源仍可能需要特定格式解包；当前清点不能证明所有不透明二进制中绝无相关内容。

进一步解析 `usr/gamecaches/cacheList.json`（2026-10-17 当前快照），其中登记 6,745 个资源映射：`mainscene` 512、`extraRes` 2,835、`audio` 103、`petdog` 77、`plant` 1,550、`delayRes` 1,374，另有 294 条未带 bundle 标识的映射。对应目录共 6,771 个文件：4,302 JSON、452 BIN、1,935 PNG、77 MP3、3 ATLAS、2 PLIST。映射 URL 中没有 `.js`、`.mjs`、`.cjs`、`.wasm`、`.proto`、`.pb`、`.csv`、`.xlsx`、`.xml` 或 `.txt` 脚本/数据文件。

对这些 JSON 内容按作物配置字段（如 `cropId`、`seedId`、`growTime`、`matureTime`、等级限制）和“种植/成熟/收获/农场等级”等文本筛查，命中 47 个 Cocos 导入资源文件，内容是 prefab/UI 字符串和组件序列化片段（例如收获、种植按钮/界面文案）；未发现可直接使用的服务端作物表或 RPC schema。`plant` bundle 及这些 UI prefab 证明缓存有作物视觉资源和种子/奖励界面节点，但它们不含可确认的作物等级、服务器作物配置或服务端状态，不能替代缺失的 `mcboot` 业务代码。

## UserCryptoManager 静态责任边界（2026-10-17）

进一步从静态模块方法体确认游戏侧存在独立的 `UserCryptoManager`；它与 `wx.login` code 的生成/兑换是不同机制：

- `refreshKey` 通过平台适配层请求 key，并根据 key 到期时间提前刷新；失败路径有指数退避。
- `refillNoncePool` 请求长度为 `12 × 配置 nonce 数量` 的二进制数据，并按每 12 字节切分填充 nonce 池；低水位会触发补充。
- `waitReady` 等待 key 与 nonce 都就绪；`ensureKeyForSend` 检查 key 到期；`encryptData` 在配置启用且材料就绪时，把消息体、nonce 和 key 交给内部加密辅助模块。

目前仍不能可靠解出 key/nonce 的请求 URL、响应字段、加密算法完整输入、实际 RPC transport、网关地址和请求头。protobuf 文件的 System.register 运行时依赖未接通，也没有动态游戏流量样本，因此不能把以上结构误当作已复原签名或可用客户端协议。

### 加密辅助模块补充（静态）

`game.js` 中存在另一个独立模块（index 约 6,971,700 附近），导出 `encryptData`、`encryptDataV2`、`decryptData`、`decryptDataV2`、`getDataToServer`、`getResult`、`getToken`、`registerIntegrityFuncs`、`sendDataFromServer` 与 `AnoUserLogin`、`SdkInitEx`、`RegisterInitCallback`。它们都要求输入是 `Uint8Array`，并在内部状态未初始化时返回空字节数组。`getToken` 返回 `{nonce, token}` 结构。这进一步证明游戏使用二进制加密/完整性通道，但该模块依赖未导出的 wasm/内部实例 `zi()[...]`，静态还原不能解出具体算法、密钥或网络数据格式。

同一个字节码还包含一个事件/超时追踪类（index 约 6,974,300 附近），使用位掩码、按类别去重和 20 秒默认超时清理。它与加密模块同处一个 bundle，但职责是事件追踪，不是 RPC 签名。

## Protobuf 字段号恢复修正（2026-10-17）

此前 `artifacts/proto-schema.json` 中的 `field: null/0` 来自探针构造：只加载了六个业务 protobuf 工厂，没有初始化 `__shared_root.ts` 和其他嵌套消息工厂；此外多字段一次编码时，探针把首个 tag 误归给当前字段。已修正 `tools/extract_proto_schema.js`：先初始化共享 root，再对缓存中可执行的 protobuf 工厂统一注册；每个字段单独构造消息、编码并解析 wire tag。现在目标 44 个消息类的字段均能得到非空字段号，重跑命令为：

```powershell
node tools\extract_proto_schema.js
```

确认的示例：

| 消息 | 字段 | tag | wire |
|---|---|---:|---:|
| `PlantRequest` | `land_and_seed` | 1 | length-delimited（map entry） |
| `PlantRequest` | `items` | 2 | length-delimited |
| `HarvestRequest` | `land_ids`、`host_gid`、`is_all`、`host_type`、`reason` | 1–5 | packed/varint/varint/varint/varint |
| `HeartbeatRequest` | `host_gid`、`client_version`、`host_type` | 1–3 | varint/length-delimited/varint |
| `TaskInfoRequest` | `global_scene_id` | 1 | varint |
| `ClaimTaskRewardRequest` | `id`、`do_shared` | 1–2 | varint/varint |
| `BatchClaimTaskRewardRequest` | `ids` | 1 | packed varint |
| `ClaimDailyRewardRequest` | `type`、`point_ids` | 1–2 | varint/packed varint |
| `PurchaseRequest` | `id`、`buy_num` | 1–2 | varint/varint |
| `ClaimQQVipRewardsRequest` | `config_ids` | 1 | length-delimited repeated |
| `GetQQVipRewardsStatusReply` | `is_qq_vip`、`can_claim`、`claimed_today`、`rewards_can_claim`、`active_configs`、`has_redpoint`、`remaining_days`、`days_remaining_reminder`、`mall_free_can_claim` | 1–9 | scalar/repeated message，详见 JSON |

JSON 里的 `defaultKind` 仅表示生成探针观察到的默认值形状，不总是 protobuf 基础类型（例如 Long 在 JS 中是对象）。tag/wire 已由独立字段编码确认；嵌套消息的具体子字段还需从其对应消息类递归还原。该 schema 仍是静态代码证据，不包含真实账号状态、服务端成功结果或可直接运行的协议客户端。

## 最新动态样本边界复核（2026-10-17）

重新运行脱敏分析器后，`wsframes.jsonl` 仍为 2,167 条事件、18 次 OPEN、49 个不同 RPC 方法名（按方向区分共 96 组方法统计）；最后一帧时间为 `2026-10-16T16:49:28Z`，最后一次 WS 建连为 `2026-10-16T16:49:26Z`（版本 `1.15.0.2_20261001`）。样本包含 `Login`、`Heartbeat`、`PlayerLogin`、`AllLands`、`TaskInfo`、`GetQQVipRewardsStatus`、`ShopInfo`、`Bag`、`GetMallListBySlotType`、`Plant`、`Harvest` 和 `Fertilize` 的请求/响应帧；帧 payload 加密，当前解析器只恢复 envelope 和方法元数据。

新增只读检查 `wasm-calls.jsonl`：本地 hook 观察到混淆 wasm 导出 `decrypt_all_data`、`__wasm_decrypt_strings` 等符号，但对应实例报告 `hasMemory: false`，所以现有记录没有提供可调用的解密内存/密钥材料，也不能据这些导出名复原加密算法。该证据把下一步具体化为：找到目标运行态可用的 key/nonce 获取路径、加密 wasm 实例及其输入输出边界；仍不从历史 payload 猜造或重放写请求。

新增 `tools/analyze_session_continuity.js` 对脱敏 WS 事件只聚合出站心跳时间，不读取 URL 查询值或 payload。当前 9 个 `UserService/Heartbeat` 出站事件分成 4 个短簇（最长 50,008 ms；相邻请求约 20–25 秒），没有连续三小时心跳簇。事件中有 18 个 `BOOT`/`OPEN`、10 个 `CLOSE`，关闭和心跳时间线无法可靠一一配对；捕获空档不能证明 WebSocket 或登录态持续在线。结果见 `artifacts/session-continuity-summary.json`，它不证明 code TTL 或 AMS token 生命周期。

Computer Use 再次读取到 QQ 当前页面是未授权的小程序中心，目标农场不在前台。2026-10-17 继续复查仍能从页面 accessibility 文本读到“你暂未授权”，且没有“经典农场/农场”页面内容；动态观察权已记录进项目目标。当前窗口状态不提供目标游戏样本，也没有从本轮 UI 产生新的登录或游戏事件。最近一次有效 WS 样本与当前 QQ 页面状态的时间范围不同，应分别标注。

## 宿主登录、传输层与加密链路（2026-10-17）

本轮对 `WxPlatformUtil`、`milo`、`UserCryptoManager`、`GcmCrypto`、`NetNode` 与 `gatepb` 工厂做了离线执行/导出检查，进一步还原出以下调用链：

```text
WxPlatformUtil.platLogin()
  → wx.login({ timeout: 3000 }) → QQ 运行时回调 code
  → 平台登录事件/初始化流程
      └─ milo.getQQUserOpenid(code) / milo.getWXUserOpenid(code)
         → AMS codeToSession 交换并保存会话字段
  → NetNode.connect(wsUrl)
  → NetNode.send(service, method, payload, messageType)
  → UserCryptoManager.encryptData(payload, clientSeq)
  → gatepb.Message(meta, body, token)
  → WebSocket binary frame
```

### 登录 code 来源与兑换

- `WxPlatformUtil.platLogin()` 调用宿主 `wx.login()`，传入 3 秒超时；本地主包不计算 code。内部还有 5 秒 watchdog 及失败后回到确认/重试路径，但这不是 code 刷新接口。
- 离线提取的 `WxPlatformUtil` 方法表包含 `platLogin`、`confirmLogin`、`onPlatformLoginSuccess`、`onGameServerLoginSuccess`，没有 `checkSession` 或 `refreshSession`。`platLogin()` 源码成功分支把这一次回调的 code 交给平台登录回调；可确认的是登录失败重试入口，不能据此推导旧 code 续期。
- 本机 QQ 运行时 `miniapp_jslib/pc_miniapp_0.2.11/QGame.js` 的 API mutation 将 `wx.login` 映射为原生桥接事件 `login`（约第 40173 行）；`wx.checkSession` 映射为 `refreshSession`（紧邻其后）。同版 `QView.js`、`QLogic.js`、`QWorker.js`、`WAWorker.js` 也含这两个 API/事件标识。进一步在 `QLogic.js` 找到 `wx.checkSession` 实现：它清除旧定时器、调用原生 `refreshSession`；成功响应中的 `expireIn` 被乘以 1000 后作为下一次 `refreshSession` 的延迟，随后从成功回调对象删除 `err_code`/`expireIn`。因此这是一个由宿主返回间隔驱动的 QQ 小程序会话刷新循环，但只有在调用 `wx.checkSession` 且原生成功时才会启动/继续。现有主包 `game.js` 没有该 API 的明文调用，`WxPlatformUtil` 导出方法表也没有 `checkSession`；目标游戏是否通过别的间接路径触发此循环，当前未知。JS 侧没有 `refreshSession` 的原生处理器实现，所以不能据此推断它会重新产生 `wx.login` code，或刷新游戏的 AMS token。
- 静态复核脚本 `tools/audit_runtime_session_refresh.js` 命中上述定时循环的所有结构（清旧 timer、桥接调用、基于 `expireIn` 秒数调度、剔除内部字段），且没有在主包明文或已提取的 `WxPlatformUtil` 方法中找到 `checkSession`。主包本身混淆，明文未命中只是阴性搜索证据，不足以证明所有间接调用都不存在。机器可读结果见 `artifacts/runtime-session-refresh-audit.json`。
- QQ 适配器 `milo.getQQUserOpenid(code)` 通过 `https://ams.game.qq.com/ams/userLoginSvr` 发起 GET，参数为 `a=qqCodeToSession`、`appid`、`js_code`。
- 微信兼容分支 `milo.getWXUserOpenid(code)` 使用 `https://mini.game.qq.com/ams/ame/wxApi`，参数为 `action=codeToSession`、`appid`、`wxcode`。
- 成功结果包含 `openid`、`ieg_ams_session_token`、`ieg_ams_token`、`ieg_ams_token_time`、`ieg_ams_token_v2`、`unionid`，并分别写入宿主存储。静态实现没有找到生成或延长已签发 code 的逻辑。
- 脱敏生命周期统计共 18 次 WS OPEN、17 个不同 code。旧版 `1.14.2.15_20260922` 的 15 次连接中，有一个 code 被两个相隔 13,043 ms 的连接复用；最新版本 `1.15.0.2_20261001` 的两次连接各自使用不同 code。样本没有跨越约三小时的连续连接，也没有 code 过期前后的成对状态。因此“三小时”仍是用户观察，既未确认是 code TTL 还是其他会话时效，也没有证据支持续期旧 code。已确认的官方重新登录入口是再次走 `wx.login()`，不是修改旧 code。统计仅输出计数和时间，不保留 code 值，见 `artifacts/login-lifecycle.json`。

### WebSocket envelope

新增 `artifacts/proto-schema.json.envelope`，从同一缓存的 `gatepb` protobuf 工厂恢复：

| 消息 | 字段 | tag |
|---|---|---|
| `gatepb.Message` | `meta` / `body` / `token` | 1 / 2 / 3 |
| `gatepb.Meta` | `service_name` / `method_name` / `message_type` / `client_seq` / `server_seq` / `error_code` / `error_message` / `metadata` | 1–8 |

`NetNode.send()` 将 service、method、message type 和 client sequence 放入 `Meta`，加密后的二进制业务内容放入 `Message.body`，同时设置 `Message.token`。动态响应里已见 `Meta.metadata` 携带 `x-traceid`。新增离线 VM 探针调用 `NetNode.resetSocketState()` 并捕获真实属性写入，确认 `_state` 回到枚举初始值、`clientSeq=1`、`serverSeq=0`、`_socket=null`；`send()` 在 WebSocket 发送后递增 `clientSeq`。探针复现于 `tools/dump_net_sources.js`，输出保存在 `artifacts/net-sources-refreshed.txt`。历史样本中出站 `message_type=1`，入站 `2` 和 `3`；超出这些取值的语义尚未确认。隔离 VM 捕获 `NetNode.send()` 调用 `AceManager.ins.randomStr()` 并把返回值赋给 token 字段；AceManager 的方法映射已确认其输出长度 65–128。连接首个样本的额外 152 字节 field 3 仍未解释，需动态验证初始化路径。

对原始帧仅在内存中计算摘要后发现：792 个可解析的出站 `Message.token` field 3 值在每个连接内均彼此不同，长度为 65–152 字节；跨 18 个连接共有 776 个不同值。入站响应中未观察到 field 3。结果文件 `artifacts/ws-token-metadata.json` 只保留长度直方图和每连接唯一值计数，不包含 token 或哈希。该字段呈现逐消息变化，不能当作稳定的 AMS 登录 token；它的精确语义仍待确认。

序号统计与 `resetSocketState()` 捕获一致：18 次连接的出站 `client_seq` 均从 1 开始，未见重复；17 条连接样本连续递增，另 1 条样本在序号 37 处缺帧。`message_type` 计数为出站 792 条 `1`，入站 938 条 `2` 和 390 条 `3`，另有 1 条出站帧缺少可解析的 meta。可复核统计见 `artifacts/ws-sequence-metadata.json`。

`gatepb.Error` 静态枚举还定义了登录重试/异地登录及 sequence 回退、跳跃、不可恢复等 1020005–1020017 错误码，完整值表保存在 `proto-schema-full.json.gateEnums.Error`。动态样本中另见 `Meta.error_code=1000014`（49 条，包含 `TaskInfo` 与 `GetQQVipRewardsStatus`）和 `PlantService/Fertilize` 的 `1001025`（1 条）；这些值与静态枚举数值不相同，现阶段不能直接按名字解释。它们均为服务端非零错误响应，不计作操作成功。分布见 `ws-sequence-metadata.json`。

### UserCryptoManager 与 AES-GCM

离线 mock 调用已确认游戏请求 QQ 宿主原生接口：

```text
wx.getUserCryptoManager().getLatestUserKey({ success, fail })
wx.getUserCryptoManager().getRandomValues({ length, success, fail })
```

`UserCryptoManager` 缓存宿主返回的 key 数据和到期时间，发送前根据剩余有效时间触发刷新；失败采用带上限的指数退避。随机数接口请求 `12 × 配置 nonce 数量` 字节，再按 12 字节切为 nonce 池；池低水位时补充。`encryptData(payload, seq)` 的静态逻辑在加密开关关闭时原样返回；开关开启时取 key 与 nonce，调用 `GcmCrypto.encryptToBase64(payload, key, nonce, seq)`，再把 Base64 输出解回 bytes 后作为 envelope body。

`GcmCrypto` 代码可直接确认：

- 支持 16/24/32 字节 AES key；nonce 必须 12 字节。
- `seqToAad(seq)` 生成 4 字节 big-endian 序号作为 GCM AAD。
- 输出编码为 `Base64(nonce || AES-GCM(ciphertext || authentication-tag))`；前 12 字节由代码明确写入 nonce，后续字节来自 AES-GCM provider 的加密结果。

这解释了动态帧为什么只能解出明文 `gatepb.Message.meta`，而 body 在普通 protobuf 解析后仍表现为密文。具体 AES provider 由 bundle 的 `aes.js` 依赖实现；请求 key/nonce 值属于运行时按需生成材料，本项目不落盘实际材料。协议层仍需确认加密开关配置的线上取值、`Message.token` 来源和其它 message type 语义，以及对端错误时 key/nonce 失效处理。序号起始值、样本中的递增行为已由静态代码、隔离 VM 字段探针和脱敏动态帧交叉确认；跨连接异常重置时的服务端接受规则仍需动态样本验证。

## Computer Use 动态观察记录（2026-10-17）

按用户明确要求继续使用 Computer Use 进行只读动态观察：

- `sky.list_apps()` 返回正在运行的 QQ；唯一精确目标为 `QQ(窗口)`，进程 `D:\Program Files\Tencent\QQNT\QQ.exe`。
- 窗口截图读取报 `FrameArrived timed out: timed out waiting on channel`。随后无截图读取的可访问性文本成功返回当前页面，证实仍处于小程序中心 `https://q.qq.com/qqweb/miniapp-center/index.html`，提示“你暂未授权，授权后玩海量微信小游戏”；页面中没有目标游戏运行页。
- 未继续点击授权入口，也没有触发登录、奖励领取、农场写入或请求重放；没有读取或导出账号凭据。

用户要求把 Computer Use 动态观察纳入持续目标，并已明确允许后续直接使用。后续从当前实际窗口状态继续观察；如进入登录/授权界面，按 Computer Use 技能的动作级规则处理，不把当前未授权状态当作登录样本。
# 最新补充：TSDK 完整性模块与 WS envelope 的依赖边界（2026-10-17）

重新执行 `node tools/run_all_chunks.js` 并检查 `System.register` 依赖列表：

- `chunks:///_virtual/NetNode.ts` 依赖 `UserCryptoManager.ts`、`GcmCrypto.ts`、`BaseService.ts` 等模块，但没有直接依赖 `tsdk_info.mjs`。
- `chunks:///_virtual/UserCryptoManager.ts` 依赖 `GcmCrypto.ts`，没有直接依赖 `tsdk_info.mjs`。
- `chunks:///_virtual/tsdk_info.mjs` 仅声明 Babel helper 与 `cc` 两个依赖，并导出 `getToken`、`getDataToServer`、`AnoUserLogin`、`SdkInitEx`、完整性注册与加解密函数。

这只排除了 `NetNode.ts` 和 `UserCryptoManager.ts` 的直接模块依赖，不足以排除整个 bundle 的间接关系。后续隔离 VM 调用追踪确认 `NetNode.send()` 调用 `AceManager.ins.randomStr()`，且 `AceManager.ts` 直接依赖 `tsdk_info.mjs`；因此模块级存在间接 TSDK 关联。仍没有证据表明 `randomStr()` 内部调用 TSDK `getToken()`，也没有 `Message.token` 与 TSDK 返回对象的字段级同一性证据。不可把 TSDK `getToken()` 直接认定为 envelope field 3 来源。

Computer Use 对 QQ `QQ(窗口)` 的可访问性读取显示其当前页面为小程序中心，文本为“你暂未授权，授权后玩海量微信小游戏”，且目标游戏未运行。本次仅读取页面状态，未操作授权入口。首个截图捕获超时；重新选择窗口后成功获得可访问性树。此状态不能提供当前农场登录 code 或协议动态样本。

## 目标玩法 RPC 字段图（2026-10-17）

新增 `tools/summarize_gameplay_protocol.js`，从 `artifacts/proto-schema-full.json` 与 `artifacts/rpc-map.json` 生成 `artifacts/gameplay-operation-map.json`。脚本列出 18 个目标任务、QQVip、商城、商店和农田方法的 request/reply 字段，并明确这些只是离线生成的 schema 绑定，不会发送请求。

- 任务读取 `TaskInfoReply.task_info`，其中分 `growth_tasks`、`daily_tasks`、`tasks`、`actives`；每个 `Task` 带 `id`、`progress`、`is_claimed`、`is_unlocked`、`task_type` 等。请求的任务进度读取参数是 `global_scene_id`，领奖操作使用当前状态返回的 `id`，累计点数奖励另有 `type` 和 `point_ids`。静态 schema 没给出用户当天实际应完成的三个 task ID 或对应玩法触发条件。
- QQVip 的状态读取可返回 `is_qq_vip`、`can_claim`、`claimed_today`、`active_configs` 与 `mall_free_can_claim`；两种奖励入口分别要求 `config_ids` 或 `config_id`。这可支撑“先读状态再选择当前可领项”的状态机，但静态缓存没有账号当前配置 ID，也没有成功领奖响应。
- 商城目录响应 `ProductInfo` 提供 `id`、`slot_type`、`is_free`、`is_available_purchase`、`restriction`、`price` 等字段，购买请求是 `id` 与 `buy_num`，响应含 `success`、`reward_items`。所以免费化肥流程应依据服务端目录与 VIP 状态共同判定，不能硬编码商品 ID；具体 slot、免费商品和每日限制仍需现场数据。
- 农田快照提供 `LandInfo.unlocked` / `plant`，作物包含阶段时间、`phase_id`、`grow_sec`、`planting_player_level` 等，可辅助成熟与播种循环。缓存没有服务端作物等级/解锁配置，因此无法从静态资源可靠选择“当前等级最高作物”。

字段表断言验证通过：18 个方法均能映射到 schema；`PurchaseReply.success`、`AllLandsReply.lands`、`GetQQVipRewardsStatusReply.mall_free_can_claim` 与 `TaskInfoReply.task_info` 均存在。对应机器可读清单为 `artifacts/gameplay-operation-map.json`。这些字段闭环缩小了客户端适配器的类型工作，但不构成真实登录、奖励、商城或农场动作成功证据。

2026-10-17 再次使用 Computer Use 只读检查两个已枚举的 QQ 窗口：`QQ(窗口)` 仍显示上述未授权小程序中心，另一个 `QQ` 窗口没有可读正文。没有点击界面控件。另对本机 `miniapp\\msf\\log` 中近期 `.qqxlog` 与 `log-local` 文本日志按 `refreshSession`、`checkSession`、`expireIn` 做不输出上下文的字面扫描，未命中；近期 `.qqxlog` 原始文件头没有可读日志文本特征，故这次阴性结果不能证明运行时从未触发刷新。动态刷新链路仍需在游戏正常运行并可观察的状态下确认。

同日对 QQEX 用户目录再枚举一次网络/会话类文件名，目标 AppID 下只发现这一份 `usr\\wsframes.jsonl`，没有第二份独立 WS 帧或登录事件流可用于延长生命周期观察。该文件有 18 次 OPEN、17 个不同 code，最晚样本仍为 2026-10-16；当前本机缓存没有新的跨时段样本，三小时生命周期仍无直接观测证据。

## 注入 bridge 回执关联与 QQ AMS SDK 边界（2026-10-17）

`tools/summarize_bridge_commands.js` 曾把 seq 索引中的方法名字符串误当成帧事件对象，因此长度条件始终不成立；现已修复为按 `client_seq + 完整帧长度` 关联。对 `bridge-out.jsonl` 中 39 条成功调用回执复算后，38 条可关联到出站帧元数据，1 条出现多个候选方法，1 条没有候选；37 条唯一方法匹配均为初始化读取 RPC，包括 `AllLands`、`Bag`、`ShopInfo`、`TaskInfo`、`GetQQVipRewardsStatus`、`GetMallListBySlotType`、`Heartbeat` 等，共 19 个方法名。该快照没有关联到 `Plant`、`Harvest`、领奖或购买写操作。机器可读汇总在 `artifacts/bridge-command-method-summary.json`。

关联结果只是额外注入 bridge 对本地 `socketTask.send` 调用的回执与同一运行时帧元数据的匹配；其中 “ok” 不代表服务端接受。现有 WS 帧 body 仍加密，因此不能把读取响应字段缺失解释成操作成功。此结果只覆盖 bridge 成功回执子集，不能替代完整 `wsframes.jsonl` 分析。

QQ 安装目录存在腾讯签名有效的 `libamssdk.dll`（版本 `0.1.5.3`）。IDA 字符串和 xref 显示该库含有 `GetLoginCodeStart`、`GetLoginCodeResult`、`GetLoginParams`、`WmpfEventProcessor::OnRequestLogin`、`OnBeginLogin`、`OnLoginResult` 以及 `GSCacheManager::GetGameSession` 等接口/事件标识。`OnRequestLogin` 路径处理 `OnBeginLogin` 事件并进入 WMPF 事件分发；`OnLoginResult` 读取已有登录数据并记录状态。

继续核对 `sub_180064A70` 的反编译控制流可见，它在 `WmpfEventProcessor` 事件表中注册 `InitWmpfSdk`、`GetLoginCodeStart`、`GetLoginCodeResult`、`GetLoginParams`、`OnBeginLogin`、`LoginResult`、`OnLoginCancel`、`OnStartWeApp` 与 applet 窗口生命周期事件。`OnRequestLogin` (`sub_180065A60`) 消费 `OnBeginLogin`；`OnWmpfLoginResult` (`sub_180066630`) 处理 WMPF 自动登录结果/重试状态。这个注册表属于 AMS SDK 的 WMPF 事件通道。它没有暴露 QQ 小程序 `wx.login()` 的 native `login` 桥接实现，故相似的 `GetLoginCode*` 命名不足以证明其返回值就是农场收到的 `wx.login` code。

对 `GSCacheManager::GetGameSession` (`sub_18001BA80`) 的 IDA 伪代码进一步发现，SDK 存在独立的原生 game-session 缓存策略：它比较缓存项时间戳与当前时间（均先除以 `10,000,000`），在 `cache_timestamp + 604800 >= now` 时记录“all of the gs cache is valid, don't need call ginkgo to get session”并跳过获取；`604800` 秒即 7 天。另有 `(now_seconds - last_request_seconds) < 0x4B0` 时忽略新的 game-session 获取请求；`0x4B0` 秒即 20 分钟。伪代码在获取路径后更新上次请求时间戳。这两个值描述的是 AMS SDK 的 `GSCacheManager` 缓存与请求节流，不能当成农场 `wx.login` code TTL、游戏 AMS token TTL，或用户观察的三小时连接寿命；当前没有把该 native cache 与农场 `milo` 兑换结果建立字段级关联。控制流证据来自 `artifacts/ams-login-ida.json`；字符串扫描见 `artifacts/ams-login-pe-audit.json`，精简可复核结论见 `artifacts/native-session-cache-summary.json`。

当前只能确认 AMS SDK 有自己的 WMPF/AMS 登录事件流程，不能确认它生成农场 `wx.login()` 返回的 code，也没有证据把 `GetLoginCodeStart/Result` 等同于 QQ 小程序运行时 `login` 原生桥接。小程序侧已还原的链路仍是 `wx.login()` → QQ runtime `login` 事件 → code → `ams.game.qq.com/ams/userLoginSvr?a=qqCodeToSession&appid=…&js_code=…` 兑换。若无同一次农场启动的事件级动态调用关联，不能把两个名字相似的登录实现合并成一个机制；此 SDK 发现不提供旧 code 续命方法。

静态审计产物为 `artifacts/ams-login-ida.json` 和 `tools/ida_audit_ams_login.py`；原生代码结论仅限反编译字符串 xref 与函数控制流，没有提取密钥、捕获凭据或调用 SDK 登录接口。

## 任务控制器与作物成熟判断（2026-10-17）

新增离线导出脚本 `tools/inspect_gameplay_controllers.js`，从最新缓存主 bundle 注册的 `System.register` 工厂中枚举指定控制器原型方法，输出到 `artifacts/gameplay-controller-sources.txt`。该脚本只装载 bundle 并用桩替代宿主依赖，不调用宿主登录、WebSocket 或业务 RPC。

从 `TaskManager` 还原到的调用顺序为：`requestTaskData` 构造并发送任务快照请求；`backTaskDataHandler` 解析返回并更新模型；`normalizeTaskInfo` 按 `task_type` 将任务归类，同时提取每日/周期活动积分；`TaskModel.getClaimableDailyTaskIds` 等筛选可领奖 ID；单项和批量领取分别由 `requestGetReward` 与 `requestBatchClaimReward` 发出，并由回调处理响应；积分奖励另走 `requestClaimActiveRewards`，发送 `type` 与 `point_ids`。`reportTaskProgressByCondType` 会按当前进行中的任务 ID 和条件类型上报进度。它确认了客户端控制器确实使用上述静态 RPC/schema，但没有给出本账号每日三个任务、玩法触发条件或成功回包。

`Plant` 控制器的 `scheduleNextStage` 按缓存阶段时间计算到期，并调用 `setStage` 更新表现；`isMature` 对比当前阶段枚举，`canHarvest` 委托成熟判断，`harvestPlant` 仅在成熟态派发收获动画/事件。这里的计时与动画不是服务端授权判据；真实收获仍要由农田服务回包和后续 `AllLands` 状态确认。静态函数可指导成熟监测，但不提供种子 ID、账号等级资格或服务端成功证据。

原型方法源码仍使用混淆后的属性索引。以上 RPC 语义由控制器调用形状与已独立提取的 `rpc-map.json`、protobuf 字段号交叉核对；不能把某个混淆索引单独当成字段名或线上值。

## 写类 RPC 的历史响应元数据核验（2026-10-17）

新增 `tools/summarize_write_rpc_replies.js`，只读取已脱敏的 `artifacts/wsframes-analysis.json`，按 BOOT 分段、方法名和 client sequence 配对请求与 `message_type=2` 的直接 RPC 回包，并按帧长度、类型、错误码合并重复 hook 记录。重跑结果在 `artifacts/write-rpc-reply-summary.json`：历史样本有 24 次 `Plant` 与 1 次 `Harvest`，均配到直接响应，`Meta.error_code` 缺省/为 0；`Farming` 为 2/2 零错误响应；`Fertilize` 为 6/6，其中 5 条零错误、1 条返回非零 `1001025`。样本没有捕获任务领奖、VIP 领奖或商城购买写请求。

这将既有结论从“看见写请求帧”推进到“网关为这些序列返回了直接 RPC 响应且没有协议错误”。响应 body 仍是加密 bytes，本分析没有解密后检查 `HarvestReply.land/items`、`PlantReply.land` 等业务字段，也没有后续 `AllLands` 状态对照。因此 24 次种植和 1 次收获不能标记为业务成功或可复现客户端验证；`Fertilize` 的 `1001025` 也暂不按错误名解释。输入是额外 hook 导出的历史帧，不是本轮 Computer Use 现场采样。

## NetNode.send 的隔离 VM 调用路径（2026-10-17）

新增 `tools/inspect_netnode_send_path.js`，在最新 `game.js` 的隔离 VM 中执行 `NetNode.send()`，所有导入依赖、日志与 socket 都是惰性桩。输出只保留参数形状、调用路径、envelope 字段名和序号，不输出 payload 或 token 值；产物为 `artifacts/netnode-send-path.json`。该探针捕获到如下调用形状：

```text
NetNode.send(requestBytes, methodName, callback, serviceName)
  → UserCryptoManager.ins.encryptData(requestBytes, clientSeq)
  → AceManager.ins.randomStr()
  → gatepb.Message.create({meta, body, token})
  → gatepb.Message.encode(...).finish()
  → socket.send(binaryFrame)
```

捕获到的 meta 对象键是 `service_name`、`method_name`、`message_type`、`client_seq`、`server_seq`；本探针中的 message type 是惰性 enum 桩的默认值，不用于判断线上枚举值。独立 schema/真实帧证据仍显示出站请求 type 为 1。此后独立提取 AceManager 类方法，确认 `randomStr()` 的实现和长度范围；隔离 VM 的调用轨迹已将它与 `NetNode.send()` 的 token 字段赋值路径关联。它不等同于 AMS 登录 token，也不同于类中转调 TSDK `getToken()` 的两个方法。实际随机值未生成或记录，现场 field 3 对照仍待确认。

`NetNode.ts` 和 `UserCryptoManager.ts` 没有直接依赖 `tsdk_info.mjs`；但 `AceManager.ts` 的真实 `System.register` setter 读取 TSDK 导出 `RegisterInitCallback`、`SdkInitEx`、`AnoUserLogin`、`getToken`、`encryptData`、`getDataToServer`、`sendDataFromServer`。AceManager 混淆工厂的导出别名追踪中，`getToken` 和 `encryptData` 各有两个调用点，`getDataToServer` 与 `sendDataFromServer` 各有一个；这证明 AceManager 有单独的 TSDK 完整性流程。`NetNode.send()` 直接调用的 `AceManager.ins.randomStr()` 是另一个不同的方法；没有证据表明它内部调用 TSDK `getToken()`，或其返回值与 TSDK token 相同。`tools/inspect_ace_manager_static.js` 与 `artifacts/ace-manager-static.json` 输出无凭据的依赖/调用统计。

### 本地随机字符串与每连接首个 field 3

修正 AceManager 静态提取器的 Cocos `cc` 装饰器桩后，混淆属性名已成功映射为类方法。`AceManager.prototype.randomStr()` 的源码是：用 `Math.random()` 选择 64–127 个字符，从 bundle 字符表抽取字符，并在末尾附加 `=`，所以输出长度为 65–128。`NetNode.send()` 的隔离 VM 轨迹直接调用 `AceManager.ins.randomStr()`，随后把返回值写入 `gatepb.Message.token`。这确认常规 `send()` 路径的本地 field 3 来源；未产生或保存任何 token 值。

对脱敏 WS 样本的 field 3 长度复核发现 792 条中有 774 条位于 65–128 字节范围；另有 18 条长度 152，每个 BOOT 连接恰好一条，且都是该连接最早观察到的业务请求（多数为 `GetQQVipRewardsStatus`）。152 字节异常超出 `randomStr()` 的实现范围。类中另有 `getToken()` 和 `getToken2()`，分别调用 TSDK 的 `getToken` 导入函数，但目前没有从首包到这两个方法的调用链，也没有字段值同一性证据；因此不能据长度就把异常首包归因于 TSDK。首包来源仍待确认。统计只用长度、方法和时间，没有保留 token 内容，见 `artifacts/ace-token-candidate.json`。

同次方法映射还确认：`AceManager.getToken(input)` 先调用类内 `stringToUint8Array(input)`，再把结果传给 TSDK `getToken`；`getToken2(input)` 直接把输入传给 TSDK `getToken`。这两条完整性/SDK 接口与 NetNode 常规发送前调用的 `randomStr()` 是分开的路径。提取脚本 `tools/inspect_ace_manager_static.js` 现在在 `artifacts/ace-manager-static.json` 中记录这三个方法的可审查源码及依赖映射。

方法映射还分离出一条 TSDK 完整性上报循环：`sdkInit()` 调用 `RegisterInitCallback` 与 `SdkInitEx`；`userLogin(input)` 调用 `AnoUserLogin(0, input)` 后启动 AceManager 定时器；构造函数将间隔设为 5,000 ms；`heartbeatTick()` 从 TSDK `getDataToServer()` 取待发送字节并交给 `sendDataToServer()`；接收处理则把数据交给 TSDK `sendDataFromServer()`。这是 Ace/TSDK 数据通道，不是 `UserService/Heartbeat` 游戏 RPC。当前还未动态确认该循环是否在线启动、包内容、服务器是否接收或它是否与 152 字节首包 field 3 有关。



2026-10-17 Computer Use 最新状态复核：cua.getState() 返回 apps: []，Chrome 中仅有与农场无关的仪表盘标签；当前没有可采集的 QQ/农场界面或新动态样本。此前记录的 QQ 小程序中心未授权状态仅代表当时观察。

2026-10-17 登录桥全版本复核：`tools/audit_login_bridge_all.js` 对本机全部 15 个 `1112386029` 缓存版本做了只读扫描，结果见 `artifacts/login-bridge-all-versions.json`。每个 `game.js` 的 `wx.login`、`checkSession`、`refreshSession`、`code2Session` 明文计数均为 0。`QGame.js` 的 API 表明确将 `wx.login` 映射为 native `login` 事件，将 `wx.checkSession` 映射为 native `refreshSession`；`QLogic.js` 的实现会清除旧定时器、调用 `refreshSession`，并按成功回调中的 `expireIn` 秒数重新调度，随后移除 `err_code` 与 `expireIn` 再回调小游戏。这个机制只证明宿主会刷新 session 检查，不证明生成新 `wx.login` code、延长旧 code 或刷新农场 AMS token。扫描未调用宿主 API，也未采集凭据值。

同日只读查询到 QQ 主窗口进程 PID 2308 与 `198.18.0.234:14000` 保持 TCP established；该地址属于本机运行时网络路径的观察结果，未能关联到 AppID、WebSocket 方法或登录 code，因此不作为农场在线验证证据。


当前进程网络快照另存为 `artifacts/current-process-network-observation.json`。快照显示 QQ(窗口) 进程存在，但连接只到运行时/代理地址，未出现可归属于 AppID 1112386029 的目标 WS 或登录兑换请求；该结果不作为线上农场验证。

2026-10-17 code 时间线复核：新增 `tools/analyze_login_code_timeline.js` 与 `artifacts/login-code-timeline.json`。从原始 `wsframes.jsonl` 仅提取 OPEN URL 的 host/path/version/platform、时间、code 长度与截断 SHA-256；未保存 code 明文。18 次 OPEN 的 code 均为 32 字符，得到 17 个不同 code 哈希；唯一复用发生在 13,043 ms 间隔内。10 个 OPEN 有同一 BOOT 段内的 CLOSE(1006)，可观测连接时长 3,611–5,922 ms；另 8 个没有 CLOSE。该样本明确不能证明 code TTL、三小时连续会话或旧 code 续命。

2026-10-17 登录 code 与业务 Login RPC 分离核验：新增 `tools/audit_login_code_separation.js`，结果见 `artifacts/login-code-separation.json`。原始 18 次 OPEN 全部指向 `gate-obt.nqf.qq.com/prod/ws`，查询键只有 `os`、`ver`、`code`、`platform`，code 长度固定为 32；首个业务帧是独立的 `gamepb.userpb.UserService/Login`。从 `LoginRequest` schema 提取的字段为分享、设备、场景、报告和实验参数，没有 code/token/session 字段。由此可确认 code 只在 WebSocket OPEN URL 进入网关，Login RPC body 是另一层加密 protobuf；这仍不提供 code 生成算法、TTL 或密钥。

2026-10-17 Computer Use 现场补充：在 ChatGPT in-app browser 打开 `https://q.qq.com/qqweb/miniapp-center/index.html`，页面标题为“小程序中心”，可访问性树显示“网络链接断开 / 重试”。按页面可访问性索引执行一次“重试”后状态未改变；未进入授权、登录或任何账号操作。页面已标记保留供后续动态观察。该现场不能产生农场 code 或玩法回包证据。

2026-10-17 AMS 登录兑换请求形状复核：新增离线 VM 探针 `tools/probe_milo_endpoint.js`，结果见 `artifacts/milo-endpoint-probe.json`。探针给 `milo` 模块注入惰性依赖桩，只捕获参数，不调用 QQ API、不发网络请求。`getQQUserOpenid(code)` 构造 `GET https://ams.game.qq.com/ams/userLoginSvr`，数据为 `a=qqCodeToSession`、`appid=1112386029`、`js_code=code`；`getWXUserOpenid(code)` 构造 `GET https://mini.game.qq.com/ams/ame/wxApi`，数据为 `action=codeToSession`、`appid=1112386029`、`wxcode=code`。两者都设置 `Content-Type: application/json;`，Cookie 由本地存储的 `openid`、`ieg_ams_session_token`、`ieg_ams_token`、`ieg_ams_token_time`、`verifysession` 加 `acctype=qqmini` 与 appid 组成。响应成功后写回 openid、AMS session/token、token 时间、token_v2、unionid；这证明请求字段和存储边界，但不是线上兑换成功或 token TTL 证据。

2026-10-17 milo 刷新逻辑审计：`tools/audit_milo_refresh.js` 读取已解码的 `milo` 模块源码，结果见 `artifacts/milo-refresh-audit.json`。模块只暴露 `init`、`checkLogin`、`getQQUserOpenid`、`getWXUserOpenid`；`setTimeout`、`setInterval`、`refreshSession`、`checkSession` 计数均为 0。`ieg_ams_token_time` 只作为兑换响应写入字段出现，没有续期计时器或旧 code 刷新算法。

2026-10-17 登录核心开始实现：新增 `client/ams-login.js`、`client/session-manager.js` 和说明 `client/README.md`。实现严格使用已还原的 QQ/WX AMS GET 请求字段与 Cookie 结构；`OfficialSession` 要求调用方提供官方 runtime code provider，只在没有 session 或服务层明确报告 session 无效时重新获取新 code。它不计算 TTL、不延长旧 code、不重放旧 code，也没有写入任何真实凭据。`test/ams-login.test.js` 覆盖 QQ/WX 请求形状、必要响应字段和失效后换新 code，`node --test test/ams-login.test.js` 四项通过。该核心尚未连接 WebSocket 加密材料、protobuf 业务调用或线上服务，因此不能标记为真实客户端完成。

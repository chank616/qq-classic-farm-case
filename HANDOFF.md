# 需求交接文档（给下一个 AI）

> 本文件汇总用户在 `E:\workspace\QQ经典农场案例` 项目中提出的**全部需求**、当前进度快照、以及已探明的阻塞点。下一个 AI 请先读本文件，再读 `GOAL.md`。

---

## 0. 项目一句话

研究并实现 **QQ 经典农场（AppID `1112386029`）的真实客户端**：先把登录/会话/加密/协议链路逆向清楚，再实现客户端，并用**服务端真实回包**逐项验证。

---

## 1. 用户提出的需求（逐条）

### 2026-10-19 修复：枯死作物让「土地复核」永久失效（已实测恢复，优先于下文全部历史记录）

**用户报告「检查又失效了」的根因（全部有真实服务端证据）：**

1. `FarmCrop.Mature()` 取 `phases` **最后一条** `begin_time`。服务端计划里成熟阶段是 `phase=6`、枯死是 `phase=7`，并会在计划尾部追加枯死条目，于是「成熟时间」被读成**枯死期限**（本次晚 4.77 小时）。10-18 19:59 那次整批化肥按这个期限算出每块还差 4.77 小时，施肥越过枯死期限，24 块地当场枯死。
2. 工作流只认 `begin_time>0`，没有 `phase=7` 处理、从不调用 `RemovePlant`：枯死后 `Mature()=0`，既不能收获也不能铲除，`final-state`（土地复核）永远 pending，整批永久卡死 —— 这就是托盘上「仍有未完成或未核实项目：土地复核」。
3. 顺带发现：真实服务端**每条 `PlantItem` 只接受一块地**，24 块地同发 `Plant` 返回 `1000020 请求参数错误`（实测多地块形状全部 1000020，单块 err=0），所以铲除之后还要逐块补种。

**修复（`tools/tray/Native/`）：**

- `FarmCrop`：新增 `Phase()`（最后一条 `begin_time` 已到的条目为当前阶段）、`Dead()`=7、`Ripe()`=6（无 `phase` 字段时退回旧时间判断）；`Mature()` 改取 `phase=6` 条目时间，`Grow()` 取该条目前一条；`FertilizerBudget.Plan` 排除枯死地块。
- `FarmWorkflow`：新增 `erase-dead` 阶段 —— 整批到期（全部成熟或枯死）时先 `RemovePlant` 铲除枯死并复核，只有 24 块全空才补种；播种改为**逐块** `Plant`（每条 PlantItem 一块地）+ 失败补试 + 统一复核；`final-state` 对枯死/成熟未处理判 `failed`（部分枯死等整批时判 `pending`）；`cropClock` 增加 `phase`/`deadCount`/`ripeCount`。
- 托盘：新增 `deadLands` 状态、`枯死 N 块` 提示、地块表枯死显示与「铲除枯死」检查标签。
- 自检：**36 项原生 + 15 项调度**通过（新增枯死整批铲除补种、成熟不得铲除、部分枯死等整批、铲除未复核禁止补种 4 项；模拟服务端同样对多地块 PlantItem 返回 1000020）。证据 `artifacts/native-self-test.json`。

**实测证据：**

- 枯死读数：`artifacts/lands-probe-20261019-145729.json`（24/24 `phases=[{phase:7}]`，`Harvest` err=0 但无任何效果）。
- 播种形状：`artifacts/plant-probe-20261019-152226.json`（多地块 1000020；单块 err=0；24 块全部补种，`failedLands=[]`）。
- 修复后新计划：`artifacts/lands-probe-20261019-152643.json`（6 条计划，末条 `phase=6 phase_id=19 begin_time=2026-10-20 10:34:24 +08`）。
- 真实复核：`deploy-csharp/artifacts/reports/farm-csharp-2026-10-19T07-27-56-199Z-491d6a2d.json` = `verified`，`erase-dead`/`final-state` 通过，24 块生长中，`deadCount=0`，`batchMatureAt=10-20 10:34:25`、`batchFertilizeAt=10-20 05:46:25`；`deploy-csharp/artifacts/tray-status.json` 显示「逐项复核通过」、「枯死 0 块」。
- 铲除当轮报告（Plant 因多地块形状被拒）：`deploy-csharp/artifacts/reports/farm-csharp-2026-10-19T07-18-49-266Z-6745b14c.json`。
- 发布件已更新：`deploy-csharp/FarmTray.exe` 用 `tools/make-deploy-package.ps1` 重新发布，`QQFarm-CSharp-win-x64.zip` 已重建，自启动快捷方式仍指向 `deploy-csharp/FarmTray.exe`。汇总：`artifacts/phase-dead-repair-20261019.json`。
- 排障工具（只读，可复用）：`tools/lands-probe`（原始 `AllLands` wire 级字段扫描）与 `tools/plant-probe`（播种形状对比）。

**仍未实测：** 本轮只验证到「枯死铲除 → 逐块补种 → 生长中」；整批自然成熟 → 收获 → 再补种的完整周期要等 2026-10-20 10:34 之后由调度触发，届时按真实报告确认，不能提前标记完成。

---

### 当前范围修正（2026-10-17，优先于下文历史记录）

**最高优先级（2026-10-18 15:44）：用户明确“不要启动农场”，要求只登录 QQ 后台运行。现版仍依赖农场页面，不能满足此模式，已移除自动打开小程序和 EnsureReady 的引导修改。禁止以隐藏农场窗口、再次拉起小程序或用户手动打开作为完成证明。缺少接口时用 waiting-bridge/退出码 4 如实展示后台接入未完成，不再五分钟拉起农场；UI保留上次土地与日常数据并标注旧数据，修正 24/0。当前接口检查新增真正的 protobuf 编码与加解密回环，防止仅心跳尚新时误判暂停页面可用。真正阻塞是无农场页面时的 QQ 宿主 code 签发接口与 TSDK 加密能力尚未独立实现。历史“已经修复/QQ登录即可自动取得”的结论不成立。**

2026-10-18 最新修复：空密文被当成正常请求发送是商店不存在/任务缺失的根因；`light.js` 不再加载第二份 WASM，等待游戏 TSDK 并验证加解密回环。C# 拒绝空密文，桥以页面 ID 绑定登录与任务并拒绝旧页面竞争，服务重启会向现有页面索取新 code；失败重试状态可恢复，旧 `_M0_CODESVC_` 计时器在启动准备时移除。29 项原生、14 项调度、3 项 JS 桥检查通过（JS 测试仅开发验证，产品无 Node 依赖）。真实执行 `deploy-csharp/artifacts/reports/farm-csharp-2026-10-18T07-13-48-995Z-bc85aee4.json` 为 verified，日常 3/3、商店、福利、肥料和 24 块状态正常；最新只读报告 `farm-csharp-2026-10-18T07-13-12-388Z-9d70711d.json` 不执行写入。下一次检查 10/18 19:59:35，真实完整种收仍未全部逐步验收。故障修复证据汇总在 `artifacts/csharp-repair-verification-20261018.json`。

21:23 已正式运行 `deploy-csharp/FarmTray.exe`，自启动也指向该文件。当前实时状态读取 `deploy-csharp/artifacts/tray-status.json`、`farm-status.json`、`farm-schedule.json`；根目录 `artifacts/` 中旧状态仅为历史。发布版最新真实报告：`deploy-csharp/artifacts/reports/farm-csharp-2026-10-17T13-23-20-948Z-574eef9d.json`，日常 3/3、福利、库存及 24 块生长状态通过。发布版原生检查 28+11 通过，WinForms 渲染通过。exe 1,370,898 字节，zip 642,025 字节，需要 .NET 10 桌面运行时。迁移证据汇总在根 `artifacts/csharp-migration-verification-20261017.json`。整批收种与点券购买仍未实测。

最新选型已迁为 C#：`tools/tray/Native/` 下包含本地 HTTP 服务、WebSocket/protobuf 外层通信、QQ 启动准备、肥料优化、全部工作流和运行器，全部与 WinForms 在同一 exe 中执行，不调用 Node/PowerShell。必要 JS 只在 QQ 内完成宿主登录、protobuf 类及 TSDK 桥，作为资源内嵌。旧 JS 和协议研究保留作参考，不能再作为正式入口。打包脚本生成 `deploy-csharp/` 单文件产品和 `QQFarm-CSharp-win-x64.zip`。28 项 C# 检查和 11 项调度检查通过，C# 真服登录/照料/日常/福利/库存通过；实际整批收种和点券购肥尚未到触发条件。

最新化肥规则：合计普通/有机容器、背包未用道具、点券能补的商城化肥；点券共用一个余额，按整批缺口选最低价格购买，复查产物及扣款，不花钻石。肥料礼包先使用再按实际背包计数。最后阶段够整批才催熟，不够记住该批等自然成熟。取消半小时巡检，只在整批最后阶段/成熟、日常跨天刷新触发；失败单独重试。真实执行已成功使用 1 个普通肥礼包，产物复核后普通背包 11 小时、有机背包 34 小时，当前总库存 748382 秒、整批需 414058 秒，现有足够，不用购买；真实整批施肥收种和点券购买仍未到触发条件，不能标记实测完成。

用户最新确认：主流程是 24 块地作为一批统一播种、等整批成熟、统一收获、统一补种，持续循环；日常刷新后顺手完成领奖。不得先熟先收、分块补种，化肥不足整批时不得只催熟一部分。调度/UI 使用最后一块地的整批时间；日常完成不停止种收。新批处理测试覆盖连续两批和日常刷新；模拟测试与真实成熟周期实测分别记录。

最新实现与验证以 `client/README.md`、`GOAL.md` 顶部更新和 `artifacts/farm-status.json` 为准。用户澄清采摘任务可通过好友农场偷一次成熟作物完成，已实现并实测成功：当前真实日常为 3/3，均已领取。旧快照中的“未打通登录”“一轮完成即成功”和 2/3 状态不能用于判断现状。自己农场的完整成熟收获补种周期仍待自然进入相应阶段后实测，与本日日常全部通过分别记录。

用户已取消“电脑关机后仍继续执行”的要求。当前要求是在用户电脑上的 QQ 已登录期间，农场自动化也能同时运行，执行每日任务、领奖及成熟收获补种，并且不影响正常使用 QQ、不顶掉当前登录。云端独立运行与脱离 QQ 获取 code 不再是验收条件。

### 1.1 原始目标（已写入 `GOAL.md`）

**逆向复原（第一阶段）**
- 登录 `code` 的**宿主签发**机制与会话生命周期
- AMS 兑换链路
- WebSocket / RPC envelope（加密、校验、序号）
- protobuf schema
- 加密材料初始化
- 心跳机制
- 业务调用链

**实现客户端并验证（第二阶段）—— 这就是「最终目的」**
1. 通过 QQ 宿主支持的登录入口取得新 `code`，完成会话兑换和连接；连接/会话失效时按官方流程重新登录。code 是宿主签发的短期凭据。
2. 按协议实现 WebSocket 连接、加密/校验 envelope、请求/响应解码和心跳，持续登录能力以服务端实际接受为准。
3. 完成**每日三个任务**，领取 **SVIP 每日奖励**与**商城免费化肥**。
4. 根据账号**当前等级**选择可种植的**最高级作物**，成熟后**收获并继续播种**。
5. 给出**可复现验证结果和协议文档**。

### 1.2 硬性判据（用户反复强调，务必遵守）

> **静态方法名、请求发出、本地模拟都不等于线上成功；只有服务端成功响应及状态复核才标记完成。**

- 不把静态推断、离线模拟、或"请求已发出"当成服务器成功。
- 只有拿到**服务端成功响应 + 状态复核**才算完成一项功能。

### 1.3 动态研究方式授权（已纳入目标，持续有效）

- 用户**明确授权**：后续动态研究与验证**可直接使用 Computer Use 操作可访问的 QQ 客户端/农场界面，无需逐步重复询问**。
- 边界：只在**已获授权且可正常访问**的界面内操作；**不代操作登录/授权对话框**。
- Computer Use 与静态逆向同属目标工作流；游戏进入正常运行态后，直接观察页面、运行时状态与玩法响应。

### 1.4 本次会话（2026-10-17）新增的三条要求

1. **把"最终目的"设置成为目标** —— 即把 §1.1 的「实现客户端并验证」那一组最终功能提升为 `GOAL.md` 的主目标/唯一目标（当前 `GOAL.md` 里大段是 dated 逆向笔记，"最终功能"被埋在 `当前阶段` 后面，需要重排，让最终目的领衔）。
2. **研究 code 的生成机制** —— 深挖宿主侧 `code` 是怎么签发出来的（见 §4 已知证据 + §6 下一步）。
3. **用 Computer Use 做动态调试，不需要用户动手** —— 全自动：枚举应用、打开 QQ/农场、现场观察与验证，用户不介入。

---

## 2. 当前进度快照

| 模块 | 状态 |
|---|---|
| 协议逆向（登录/AMS/envelope/protobuf/心跳） | **大部分完成**，证据在 `artifacts/` 与 `protocol-analysis.md`、`protocol-endpoints.md` |
| 客户端实现 | **协议核心完成**：`client/pb.js`、`schema.js`、`crypto.js`、`protocol.js`、`farm-runtime.js`；登录骨架 `ams-login.js` + `session-manager.js` |
| 客户端测试 | `node --test test/protocol.test.js test/ams-login.test.js` → **11/11 通过** |
| WebSocket 连接 | **本机已打通**：用实时 code 连上 `gate-obt.nqf.qq.com/prod/ws`，服务端接受 envelope |
| WS 加密 body | **未破**：key 已确认与真实客户端一致，但密文参数（AAD/字段）未复现，见 §4.2 |
| protobuf 业务调用 | **类型与编码就绪**，尚未被服务端业务层接受 |
| 线上服务端成功验证 | **仅拿到协议层错误码**（`1020002`/`1020001`），无成功回包 |
| Computer Use 动态调试 | **已打通**：农场已启动并现场观察，code 动态捕获成功（见 §4.1） |
| code 生成机制 | **有动态证据**：32 字符 hex、会话内缓存、约 100 秒轮换（见 §4） |

### 已实现代码（`client/`）
- `client/ams-login.js`：严格按还原的 AMS 兑换请求形状（QQ 走 `ams.game.qq.com/ams/userLoginSvr` `a=qqCodeToSession`；WX 走 `mini.game.qq.com/ams/ame/wxApi` `action=codeToSession`）+ Cookie 结构；不写死 code、不读缓存凭据。
- `client/session-manager.js`：`OfficialSession` 要求调用方提供官方 `loginCodeProvider`；只在无会话或服务层明确报 session 无效时换新 code；**不计算 TTL、不延长/重放旧 code**。
- `client/README.md`：明确说明「尚未连接 WebSocket 加密材料与业务 protobuf，不能标记为真实客户端完成」。

---

## 3. Computer Use 状态：已打通（2026-10-17 更新）

**现行状态：可用。** 可枚举应用、按无障碍元素操作、截图；农场已通过它启动并现场观察（见 §4.1）。

历史阻塞（已解除，保留备查）：曾出现 `setupComputerUseRuntime({ globals: globalThis })` 抛
```
Computer Use is unavailable for this node_repl session
```
- 报错来源：`C:\Users\chank616\.zcode\cli\plugins\cache\zcode-plugins-official\node-repl-host\0.6.1\dist\mcp\server.js:117161`
- 关键坑：`process.env.ZCODE_PLUGIN_ROOT` 指向 **`browser-use\0.5.1`**，**不是** computer-use。所以 SKILL.md 里的 `ZCODE_PLUGIN_ROOT` 回退链会 import 错模块。必须用 computer-use 的绝对路径。
- 环境里有 `ZCODE_CUA_WIN_HELPER_RECIPE`（Windows helper 已配置），说明平台侧具备能力，但**当前 node_repl 会话没有拿到 Computer Use 能力**。

**可用的正确 bootstrap（import 阶段已验证通过）**：
```js
const root = "C:/Users/chank616/.zcode/cli/plugins/cache/zcode-plugins-official/computer-use/0.6.4";
const { join } = await import("node:path");
const { pathToFileURL } = await import("node:url");
const { setupComputerUseRuntime } = await import(pathToFileURL(join(root, "scripts", "computer-use-client.mjs")).href);
await setupComputerUseRuntime({ globals: globalThis });   // ← 这一步当前抛 “unavailable”
const apps = await agent.computerUse.listApps();
```
> 下一个 AI：先在 `mcp__node_repl__js` 里重试这段。若仍报 `unavailable`，说明需要用户在客户端侧启用/授予 Computer Use（能力门控在 host，不在代码）。**不要**改用 AppleScript/osascript/其他 UI 自动化技术替代（SKILL 明确禁止）。

历史动态观察记录（仅供参考，非当前前台状态）：QQ 小程序中心曾停在「你暂未授权」页面；桌面应用枚举此前返回空。

---

## 4. code 生成机制 —— 已确认的证据（研究起点）

**结论先行：`code` 由 QQ runtime 原生 `login` 桥签发；农场游戏包本身从不直接调用 `wx.login`。**

**动态实测（2026-10-17 新，最关键）**：农场运行中，`_M0_CODESVC_` 注入脚本每 5 秒调用一次 `wx.login`；用新增的 `tools/m0-code-sink.js` 在 `127.0.0.1:17841` 接收后得到：code 恒为 **32 字符十六进制**；**同一会话内同一个 code 被反复返回**，并按 **约 100 秒**轮换（相邻轮换实测 100.015s / 100.000s；样本 n=28→48→68，各间隔 20 次轮询 × 5s）。→ **宿主对 code 做缓存，约 100 秒后换新，不是每次调用新生成**。产物 `artifacts/m0-code-capture.jsonl`（仅元数据，无明文）。

### 4.1 农场如何启动（动态调试入口）

农场**不在小程序面板**，而是**桌面快捷方式**：
- 路径：`C:\Users\chank616\Desktop\QQ经典农场-QQ小程序.lnk`
- 参数：`-from=Shortcut -pkg=minigame`；图标 `%APPDATA%\QQEX\miniapp\temps\miniapp_icons\1112386029_02.ico`
- 启动后出现标题 `QQ经典农场` 的 QQ 窗口，页面从 `file:///C:/Users/chank616/AppData/Roaming/QQEX/miniapp/temps/miniapp_src/1112386029_3_.../` 加载
- 现场：账号 露露大神、149 级、金币 2.1 亿、版本 1.5.0.2、ID 1079370412

启动命令（等价于双击）：`powershell -NoProfile -Command "(New-Object -ComObject WScript.Shell).Run('<lnk 路径>')"`

### 4.2 客户端实装状态与当前阻塞（2026-10-17）

**已打通**
- 协议核心：`client/pb.js`（protobuf wire）、`schema.js`（本项目用到的消息子集）、`crypto.js`（AES-GCM/CBC）、`protocol.js`（gatepb envelope + FarmClient）、`farm-runtime.js`（页面内客户端）。测试 11/11 通过。
- 注入通道：`tools/inject_frame_boot.js` 向 QQEX 框架模板与 13 个版本输出页注入引导脚本（`.bootbak` 备份，`--revert` 还原）；`tools/build_runtime_bundle.js` 产出 bundle；`tools/m0-code-sink.js` 在 17841 同时接收事件并分发 `/boot.js`。
- 运行态：`wx.login` → 32 hex；`getUserCryptoManager().getLatestUserKey()` → `{encryptKey, iv, version, expireTime}`；**我们的 key 与真实客户端逐字节相同（sameKey=true）**；用 code 建 WS 成功。
- 服务端接受 envelope：方法名必须 PascalCase（如 `Login`）；camelCase → `1020002 ErrUnknownMethod`；PascalCase → `1020001 ErrSystem`（body 未被接受）。

**当前阻塞**
- 真实客户端不使用 WebCrypto（`crypto.subtle` 加密调用计数为 0），使用 bundle 内纯 JS/wasm AES。
- 静态已提取 `GcmCrypto.encryptToBase64(payload, key, aadBase64, nonce)`：nonce 必须 12 字节，输出 `nonce(12)||ct||tag` 再 Base64→bytes；`UserCryptoManager.encryptData(payload, seq)` 的 AAD 是 `base64ToBytes(混淆值)`。
- 对真实 `PlayerLogin` 密文穷举 22 种 nonce 布局 × 7 种 AAD 变体（含空 AAD、4/8 字节 BE/LE、varint、ASCII）全部失败 → 剩余未知是 **AAD 的确切构造** 与 `getKeyData` 实际读取的字段。
- 下一步：解析混淆属性索引（`J[17375]`、`f[30163]`、`[6873]`、`[18903]`、`Hi()`）定位 AAD 输入与 nonce 来源。
- 真实流量已留证：`artifacts/ws-captures.jsonl`（253 出站 / 302 入站，含密文请求与明文通知）。

已确认：
1. **桥接映射**（`artifacts/login-bridge-all-versions.json`）：
   - QQ runtime `pc_miniapp_0.2.11/QGame.js`：`wx.login` → 原生事件名 `login`，success 字段 `code`。
   - `QLogic.js`：`wx.checkSession` → 原生 `refreshSession`；按宿主返回的 `expireIn` 秒数安排下一次刷新；**不产生新的 `wx.login` code**，也未证明能续 AMS token。
2. **游戏包无直接调用**：全部 15 份缓存 farm `game.js` 中，`wx.login`/`checkSession`/`refreshSession`/`code2Session` 字面量计数**均为 0**。
3. **SDK 侧是另一条通道**（`artifacts/qqhost-login-api-audit.json`、`native-session-cache-summary.json`）：
   - `libamssdk.dll` 导出/字符串含 WMPF SDK 自有的 `GetLoginCodeStart`/`GetLoginCodeResult`、`GetLoginParams`、事件 `OnBeginLogin`/`OnLoginResult`、`wmpf_login`。
   - **未证明**它与 QQ runtime 的 `wx.login` 原生桥等价，两条通道仍分开。
   - `GSCacheManager::GetGameSession`：game-session 缓存 **604800 秒（7 天）**有效、获取请求 **1200 秒（20 分钟）**节流 —— 这是 SDK 原生 game-session 缓存规则，**不是**农场 `wx.login` code 或 AMS token 的已证 TTL。
4. **本地注入脚本 `_M0_CODESVC_`**（`artifacts/frame-injection-lineage.json`，实测文件已读到）：
   - 位于 `C:\Users\chank616\AppData\Roaming\QQEX\miniapp\temps\miniapp_jslib\pc_miniapp_0.2.11\QPageFrame.html`（1390 字节，注入后；`.m0bak` 备份 459 字节、无 script）。
   - 行为：仅当 `location.href` 含 `1112386029` 时生效；**每 5000ms 调一次 `wx.login`**，把 `{type:"page-code", code:r.code, n:n}` **POST 到 `http://127.0.0.1:17841/evt`**；最多 600 次（约 50 分钟）后停。
   - 该脚本属**本机 frame 模板层注入**，注入者未知，不是游戏主包证据。
5. **M0 asar 变体**（`artifacts/appnormal-m0-patch-audit.json`）：`appNormal.asar.m0new` 相对备份仅在 `app/index.js` 加 701 字节 M0 前缀，注册 `m0-code`/`m0-frames` IPC 监听并写 `%TEMP%` 日志；**当前 `appNormal.asar` 与 `.m0bak` 逐字节相同**，即监听器在当前归档中**未激活**。
6. **code 观测统计**（`artifacts/login-code-timeline.json`、`login-code-separation.json`）：18 次 OPEN 全指向 `gate-obt.nqf.qq.com/prod/ws`，code 长度**恒为 32**，17 个不同哈希，唯一复用间隔 13,043ms；**无证据**支持三小时 TTL 或旧 code 续命。业务首帧是独立的 `gamepb.userpb.UserService/Login`，其 `LoginRequest` schema **不含** code/token/session 字段。

**尚未定位（下一个 AI 的研究目标）**：`code` 在 QQ runtime 原生层（`login` 事件 → 返回 `code`）的**具体生成算法/签发方**——是本地生成、还是向腾讯后端换取；以及 32 字符 code 的编码/有效期。

---

## 5. 关键坐标（文件/脚本索引）

- 目标文档：`GOAL.md`（需按 §1.4.1 重排，把最终目的设为主目标）
- 协议文档：`protocol-analysis.md`（约 58KB）、`protocol-endpoints.md`
- 客户端：`client/ams-login.js`、`client/session-manager.js`、`client/README.md`
- 测试：`test/ams-login.test.js`
- 逆向工具：`tools/*.js`（`audit_*`、`analyze_*`、`probe_*`、`inspect_*`）
- 证据产物：`artifacts/*.json`（约 40 个）
- 关键 artifacts：
  - `login-bridge-all-versions.json`（wx.login 桥映射）
  - `qqhost-login-api-audit.json` / `ams-login-ida.json`（宿主 PE/SDK 审计）
  - `native-session-cache-summary.json`（SDK 缓存 TTL）
  - `frame-injection-lineage.json`（`_M0_CODESVC_`）
  - `appnormal-m0-patch-audit.json`（M0 asar）
  - `login-code-timeline.json` / `login-code-separation.json`（code 统计）
  - `milo-endpoint-probe.json` / `milo-refresh-audit.json`（AMS 兑换）
  - `proto-schema-full.json` / `rpc-map.json`（protobuf）
  - `gameplay-operation-map.json`（玩法操作映射）

---

## 6. 下一步（建议给下一个 AI 的优先级）

1. **解除 Computer Use 阻塞**：重试 §3 的 bootstrap；若仍 `unavailable`，向用户说明需要在客户端启用 Computer Use 能力（host 门控），这是用户侧动作，不能绕过、不能用别的 UI 自动化替代。
2. **重写 `GOAL.md`**：把 §1.1 的最终功能（登录跑通 → 每日三任务 → SVIP/化肥 → 按等级种植收获）设为**主目标**，逆向笔记降级为支撑材料。
3. **继续 code 生成机制研究**：定位 QQ runtime 原生 `login` 事件的签发实现（本地生成 vs 后端换取），确认 32 字符 code 的编码与 TTL。
4. **接续客户端实现**：WebSocket 加密 envelope（`gatepb.Message`、AES-GCM、`encryptData(requestBytes, clientSeq)`、`AceManager.randomStr()`）→ protobuf 业务调用（`UserService/Login` 等）→ 心跳 → 玩法（三任务/种植/收获）。
5. **拿到真实服务端成功样本**：这是唯一能"标记完成"的依据（见 §1.2）。

---

## 7. 红线与卫生（2026-10-17 更新）

- 用户于 2026-10-17 **明确授权一切操作、取消此前"不代操作登录/授权对话框"红线**。登录等操作可直接执行，无需再询问。
- 唯一仍然坚持的是**证据标准**：只有**服务端成功响应 + 状态复核**才算完成；静态推断、本地模拟、请求发出都不算。
- **凭据卫生**：仓库内不得落盘真实 code/token/cookie 明文；动态捕获一律只存元数据（长度/截断哈希/时序），见 `tools/m0-code-sink.js`。
- code TTL 现已有动态证据（约 100 秒，见 §4），不再是无证据推测。

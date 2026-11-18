# 项目目标

**最终目标：交付一个可运行的 QQ 经典农场（AppID `1112386029`）真实客户端，并在线上服务端逐项验证通过。**

下面的协议逆向是达成该最终目标的支撑材料，不是目标本身。

## 当前运行范围与验收记录

- **最新用户规则与修复，2026-10-29：仓库果实全部出售换金币，包括变异果实；保留种子、化肥及其他道具。** 1003003 已从客户端 GameError 确认为 ItemCountLimit；艳蝶兰原持有 999840，上限 999990，本批收获 14000 导致超限。已实现整批收获前清仓、收获后卖出新果实、日常操作后清理果实；每次 Sell 均复查具体 UID 库存消失与金币到账，验证失败阻止继续种收，同轮不盲目重试。45 项 C# 检查及 15 项调度检查通过，新增出售失败、金币缺失、变异果实、种子化肥保护、只读模式、连续多季和末季残株清理测试。真服已清仓 1000022 个果实、收获全部 24 地并卖出新果 14000 个，金币共增加 144646848，余额 510494186。原 QQ 主进程 PID 35756（10/29 12:47:26 启动）未重启，没有打开农场。部署版 PID 26324 已复核通过并等待 19:15:50；当前 17 块续季生长、7 块待整批清理，保留 24 块作为整体，不进行分块补种。续季后的最终收获、残株清理和补种逻辑已通过模拟，但真实下一季尚未到期，不能声称完整周期已经实测结束。证据 `artifacts/fruit-sale-fix-20261029.json`，当前真实状态 `deploy-csharp/artifacts/farm-status.json`。原生 WinForms 面板已修正成熟作物零化肥需求的误提示，并显示有效作物数与待整批清理数。

- **最新状态，2026-10-19 15:28，优先于以下历史记录：枯死作物导致的「土地复核」永久失效已定位、修复并实测恢复。** 根因有三：① `Mature()` 读 `phases` 最后一条 `begin_time`，而服务端成熟是 `phase=6`、枯死是 `phase=7` 且会在计划尾部追加枯死条目，于是成熟时间被当成枯死期限（晚 4.77 小时），10-18 19:59 的整批化肥据此施肥越界，24 块地当场枯死；② 工作流没有 `phase=7` 处理、从不 `RemovePlant`，枯死后既不收获也不铲除，`final-state` 永远 pending；③ 真实服务端每条 `PlantItem` 只接受一块地，24 块同发 `Plant` 返回 `1000020 请求参数错误`，铲除后无法补种。修复后：新增 `erase-dead` 整批铲除并复核、逐块播种并复核、`final-state` 对枯死/成熟未处理判 failed，`cropClock` 增加 `phase/deadCount/ripeCount`，托盘显示枯死块数与「铲除枯死」。自检 36 项原生 + 15 项调度通过。实测：枯死读数 `artifacts/lands-probe-20261019-145729.json`（24/24 `phases=[{phase:7}]`）、播种形状 `artifacts/plant-probe-20261019-152226.json`（多地块 1000020、单块 err=0、24 块补种 `failedLands=[]`）、新计划 `artifacts/lands-probe-20261019-152643.json`（末条 `phase=6 phase_id=19 begin_time=2026-10-20 10:34:24`）、真实复核 `deploy-csharp/artifacts/reports/farm-csharp-2026-10-19T07-27-56-199Z-491d6a2d.json` = `verified`（24 块生长中，`deadCount=0`，`batchMatureAt=10-20 10:34:25`，`batchFertilizeAt=10-20 05:46:25`）；`deploy-csharp/artifacts/tray-status.json` 为「逐项复核通过」。汇总 `artifacts/phase-dead-repair-20261019.json`。**只验收枯死铲除→逐块补种→生长中；整批自然成熟→收获→再补种的完整周期要等 10-20 10:34 之后由调度触发再确认。**

- **最新状态，2026-10-18 17:19，优先于以下历史记录：仅登录 QQ 的后台接入已经实现并部署。** C# 经固定原生桥进入当前 QQ 主进程，调用现有 `nt_1` 会话的 `getNodeMiscService().loginWithAppId("1112386029")` 申请 code；使用 C# protobuf 和本地 Wasmtime 加载固定哈希的 TSDK WASM，直接连接农场 WebSocket。没有启动或重启 QQ，没有打开农场。QQ 主进程仍为 PID 3888，启动时间为 2026-10-17 23:40:40。正式部署程序 PID 22612 自动从旧 waiting-bridge 状态恢复，17:18:22 真服复核通过：149 级、24 块地、日常 3/3 已领，缺水地块已浇水并复查，背包与商城预算正常。下一次检查为 10/18 19:59:35。75 秒空闲、三次服务端心跳、土地重查和再次取码均通过；1,025 组真实生成器协议样例、32 项业务/旧桥回归及 15 项调度检查通过。运行入口已移除自动启动 QQ 和打开农场，生产流程不再启动 HTTP 页面桥，移除了 14 处旧页面加载钩子。证据：`artifacts/background-access-verified-20261018.json`；当前真服报告位于 `deploy-csharp/artifacts/reports/`。**只验收后台接入和本次到期事项，未宣称完整真实施肥→收获→补种周期已经结束。**

- 当前交付：`deploy-csharp/FarmTray.exe` 配套 `QQFarmBridge.dll`、`wasmtime.dll`、`tsdk.wasm` 和许可证；主程序和业务使用 C#，无需 Node.js/Python/PowerShell 运行环境。需 .NET 10 Windows Desktop Runtime。压缩包 `QQFarm-CSharp-win-x64.zip` 为 9,220,280 字节，排除账号记录与运行日志。`tools/build-csharp.ps1` 可复现发布包。以下旧版本“尚未实现”、文件大小与页桥依赖均为历史情况。

- **2026-10-18 15:44 用户最新硬约束，优先于下文全部历史记录：用户明确不要启动农场小程序，只允许已登录的 QQ 后台接入。已移除 `QqBootstrap.EnsureReady` 中的自动打开农场和自动引导修改。当前实现依赖 QQ 农场页面提供登录、protobuf 和 TSDK 接口，因此“仅 QQ 登录即可运行”的模式尚未实现，不能再声称已经修好。页面接口缺失显示 waiting-bridge/“QQ 后台接入未完成”，不会自动拉起农场；保留带时间标记的上次数据，不能把失败显示为成功。旧版短时真服通过仅证明当时农场桥可用。后续需首先打通不加载农场的 QQ 后台登录和加密能力。**

- **2026-10-18 故障修复优先更新**：原桥脚本会在游戏未初始化时加载第二份 TSDK，导致非空请求加密后变成空数据，出现 `ShopInfo 1004001`、任务缺失、商城错误。现在只等待游戏自带 TSDK，通过加解密回环后注册桥；C# 拦截空/错误密文；登录 code、编解码和加密任务绑定同一有效页面，旧页面不能抢任务。重启保留失败重试计划，并移除旧 `_M0_CODESVC_` 登录计时器。发布版已更新，29 项 C#、14 项调度、3 项桥启动/恢复检查通过。真服报告 `deploy-csharp/artifacts/reports/farm-csharp-2026-10-18T07-13-48-995Z-bc85aee4.json` 全部当轮项目通过，另有只读报告 `farm-csharp-2026-10-18T07-13-12-388Z-9d70711d.json`；C# 本地服务重启后，现有农场页面自动重新提供登录凭据，未再次手动重开。日常 3/3 已领，24 块正常生长，下一次整批检查北京时间 2026-10-18 19:59:35。真实完整施肥→收获→补种仍未全部取得逐步复查证据，不能据此标记全部验收完成。

- **21:23 已切换到实际发布版 `deploy-csharp/FarmTray.exe`，自启动快捷方式同步更新。轻量 exe 1,370,898 字节，压缩包 `QQFarm-CSharp-win-x64.zip` 642,025 字节，只含 exe、说明、产品标识。发布版 28+11 检查及真实执行通过：`deploy-csharp/artifacts/reports/farm-csharp-2026-10-17T13-23-20-948Z-574eef9d.json`；界面渲染复核通过。运行日志、调度和最新状态现位于 `deploy-csharp/artifacts/`，工作区根 `artifacts/` 的报告为历史记录。真实整批收种、点券补肥仍未到触发条件，不能标记实测完成。**

- **最新技术选型：主程序改为 C#。WinForms、调度、WebSocket 协议、本地服务、24 块种收、日常和肥料预算全部由 C# 执行，不再启动 Node.js 或 PowerShell 子进程。QQ 内只保留必要的登录/protobuf/TSDK JavaScript 桥。默认交付依赖 .NET 10 桌面运行时的轻量单文件 exe。** C# 版已通过 28 项原生检查和 11 项调度检查；真实 C# 执行报告 `artifacts/reports/farm-csharp-2026-10-17T13-19-41-873Z-1d56c160.json` 验证登录、浇水/除草/除虫及复查、日常 3/3、会员/免费化肥与库存预算。当前仍等整批最后阶段，真实整批施肥收获补种尚未触发，不能标记为全部验收完成。

- **化肥与频率最新修正：普通/有机容器、背包未使用道具，以及当前点券可以买到的商城化肥一起计算；够整批才在最后阶段催熟，先用库存、再开包、点券只补缺，不花钻石。最后阶段预算不够则记住该批等待自然成熟。正常执行只等下一作物阶段/成熟或日常跨天刷新，取消半小时巡检。**

- **最新主规则：全部 24 块地作为一个整体，统一种植，等待整批成熟（现有化肥足够整批时可统一催熟），统一收获后再统一补种，持续循环。禁止先熟先收、分块补种或只催熟部分地块。日常任务刷新后完成一次并领奖，不因本日日常已完成而停止种收。**

- 在用户电脑上的 QQ 已登录期间，农场自动化可以同时运行，完成每日任务、福利领取和成熟收获补种；不影响用户正常使用 QQ。
- 已取消“电脑关机后仍继续执行”的要求，不再以云端独立运行、脱离 QQ 获取 code 作为验收条件。下文相关研究记录仅作历史参考。
- 复用当前已登录的 QQ 会话，保留不顶掉用户正常 QQ 登录的要求。

## 最终功能（验收标准）

**2026-10-17 最新用户澄清及实测**：采摘任务通过好友农场偷一次成熟作物即可完成。已补充该路线，每轮最多一次服务端接受的好友采摘，随后复查任务并领奖；已完成则不再执行。真实报告 `artifacts/reports/farm-2026-10-17T12-23-57-852Z-7981848b.json` 确认好友 `Harvest` 成功、任务 200020 进度 1/1 且已领取，三个每日任务 **3/3 全部领取**，会员与免费化肥检查通过，`allRequiredComplete=true` 表示本日日常已核实。28 项 Node 测试通过。自己的 24 块作物保持种植，自己农场成熟后的完整催熟/收获/补种周期仍待到时实测，与本日日常通过分别记录。此更新优先于下方早先的 2/3 快照。

**2026-10-17 实装更新**：当前正式入口为托盘 → `farm-run.ps1` → `farm-headless.js`，已实现本地服务恢复、正确获取好友并帮助、每日独立调度、按等级选种及缺口买种、施肥后立即收获补种与复核、福利限额复查、逐项验收报告。只读检查不写成功时间；本轮结束不等于全部完成。旧入口已转到新流程，旧运行时铲地换种代码已移除。25 项 Node 测试、5 项托盘调度检查通过，.NET Release 构建通过。真实执行已验证浇水/除草/除虫、好友任务进度和领奖、会员状态与免费化肥领取限额、本地接收服务停止后的恢复；当前每日任务 **2/3**，采摘任务仍为服务端进度 0，作物尚未成熟，真实“施肥→收获→补种”周期尚待到时验证。当前报告必须保持 `allRequiredComplete=false`。最新真实状态、独立报告路径及等待时刻见 `artifacts/farm-status.json`，托盘运行状态见 `artifacts/tray-status.json`。

- 通过 QQ 宿主支持的登录入口取得新 code，完成会话兑换和连接；连接/会话失效时按官方流程重新登录。code 是宿主签发的短期凭据；目前没有证据证明可续命或延长原始 code。
- 按协议实现 WebSocket 连接、加密/校验 envelope、请求/响应解码和心跳，持续登录能力以服务端实际接受为准。
- 完成每日三个任务，领取 SVIP 每日奖励与商城免费化肥。
- 根据账号当前等级选择可种植的最高级作物，成熟后收获并继续播种。
- 给出可复现验证结果和协议文档。静态方法名、请求发出、本地模拟都不等于线上成功；只有服务端成功响应及状态复核才标记完成。

## 支撑材料：需要复原的协议范围

先基于最新小程序缓存、QQ 宿主运行时以及可脱敏的动态样本，复原登录 code 的宿主签发与会话生命周期、AMS 兑换、WebSocket/RPC envelope、protobuf schema、加密材料初始化、心跳及业务调用链；再实现客户端并逐项验证服务端结果。

## 用户明确提出的动态研究方式

用户明确授权：后续动态研究与验证可直接使用 Computer Use 操作可访问的 QQ 客户端/农场界面，无需逐步重复询问。此授权已纳入本目标并持续有效。Computer Use 与静态逆向同属目标工作流；目标游戏进入正常运行态后，直接观察页面、运行时状态与玩法响应。只在已获授权且可正常访问的界面内操作；不代操作登录/授权对话框，也不把静态推断、离线模拟或请求发出当成服务器成功。当前 QQ 页面处于小程序中心未授权状态，尚未打开目标游戏。此前采集到的 QQEX 帧日志是历史证据，不等于当前前台运行状态。

## 当前阶段

2026-10-17 追加：Computer Use 已按用户授权纳入持续工作流，但当前 Computer Use 应用枚举未返回 QQ/桌面应用，仅有无关 Chrome 标签，故本轮没有可动态访问的农场运行态。静态逆向继续推进：修正 `tools/inspect_ace_manager_static.js` 的 Cocos decorator stub 后，已把 AceManager 混淆方法映射到 `sdkInit`、`userLogin`、`getToken`、`getToken2`、`randomStr`、`startHeartbeat`、`heartbeatTick` 等名称。确认 `randomStr()` 是 NetNode 常规发送路径实际调用的本地 token 槽生成器，输出 65–128 字符；`getToken()` / `getToken2()` 则调用 TSDK `getToken`，与该生成器分离。另复原出独立 TSDK 上报循环：登录回调后启用 5 秒定时器，拉取 `getDataToServer()` 并通过 `sendDataToServer()` 发送；它不是游戏业务 `Heartbeat` RPC，线上启动与服务端接受状态仍未知。每连接首帧额外出现的 152 字节 field 3 仍未解释，不能据此推断其来自 TSDK。另比对 QQEX 的 `QPageFrame.html` 与 `.m0bak`：未注入备份为 459 字节且无 script，当前模板内含与 3 个农场输出帧完全相同的 `_M0_CODESVC_`，13 个有输出帧的版本中其余 10 个没有该脚本；它每 5 秒请求一次新 code，计数到 600 次（约 50 分钟）后停止，并向本机 17841 端口转发。该脚本归属本机 frame 模板层，具体注入者未知，不属于游戏主包证据。此外 QQEX `appNormal.asar.m0new` 与备份相比仅 `app/index.js` 增加 701 字节 M0 前缀，注册 `m0-code`/`m0-frames` IPC 并写入 `%TEMP%` 日志；当前 `appNormal.asar` 与 `.m0bak` 整包相同，`apiIgnore.js` 三副本一致。它是单独的本地采集变体，是否运行及是否与 frame HTTP 转发相连均未证实；没有读取其日志。审计见 `tools/audit_appnormal_m0_patch.js`、`artifacts/appnormal-m0-patch-audit.json`。另从腾讯签名的 `libamssdk.dll` 反编译确认 WMPF SDK 自有 `GetLoginCodeStart/Result` 与 `OnBeginLogin/LoginResult` 事件表；它不是 `wx.login` 的 QQ runtime native `login` 桥接证据，两个登录通道仍分开。`GSCacheManager::GetGameSession` 的原生缓存伪代码另显示缓存项 604,800 秒（7 天）有效、获取请求 1,200 秒（20 分钟）内节流；这是 SDK 原生 game-session 缓存规则，不是农场 `wx.login` code 或 AMS token 的已证 TTL，和三小时观察无直接关联。反编译依据见 `artifacts/ams-login-ida.json`，字符串审计见 `artifacts/ams-login-pe-audit.json`，精简结果见 `artifacts/native-session-cache-summary.json`。复核工具为 `tools/audit_frame_injection_lineage.js`，产物 `artifacts/frame-injection-lineage.json`。最新方法源码与脱敏长度统计见 `artifacts/ace-manager-static.json`、`artifacts/ace-token-candidate.json`。

最新已定位缓存是 `client_1.15.0.2`。已有脱敏 WebSocket 样本、服务方法清单、登录 code 复用统计，以及静态还原出的 `wx.login`→AMS 兑换、宿主 `getLatestUserKey`/`getRandomValues`、AES-GCM 与 `gatepb.Message` envelope 链路。protobuf 工厂字段提取现覆盖六个业务 namespace 的 160 个消息类型（649 个业务字段）、122 个嵌套消息引用和 gate envelope；另有 53 个生成 RPC 方法的 request/reply 类型映射。`NetNode` 状态探针确认序号初始化及发送后递增；隔离 VM 组包路径进一步捕获 `encryptData(requestBytes, clientSeq)`、`AceManager.ins.randomStr()` 与 `{meta, body, token}` 组装；AceManager 另有独立 TSDK 完整性通道，首包 152 字节 field 3 与该通道的关系仍未知。脱敏 token 统计显示 field 3 在同连接内逐请求变化。新清点 `miniapp_pkgs` 下 32 个 TQAPKG 文件（16 个版本 ID），仅包含两个 Cocos wasm 子包，48 个归档条目中没有 `mcboot`；最新归档确认只含 `spine.wasm` 与 Cocos loader。资源清单见 `artifacts/resource-cache-inventory.json`；归档核验脚本为 `tools/audit_minigame_packages.js`。Computer Use 复查 QQ 仍停在“你暂未授权”的小程序中心页面，尚无目标农场现场样本；没有点击授权或登录入口。`WxPlatformUtil` 的 `platLogin()` 是单次 `wx.login` 请求并在失败时进入重试入口，其方法表没有 `checkSession`/`refreshSession`。QQ `QLogic.js` 的 `wx.checkSession` 会调用原生 `refreshSession`，并按原生返回的 `expireIn` 秒数安排下一次刷新；但目前没有证据证明目标游戏调用它、原生循环影响游戏 AMS token，或它会产生新的 `wx.login` code。可复核脚本见 `tools/audit_runtime_session_refresh.js`。脱敏连接统计为 18 次 OPEN、17 个不同 code；唯一复用发生于旧版两个相隔约 13 秒的连接。9 个出站心跳只形成 4 个短簇，最长约 50 秒；样本没有三小时连续心跳，也无法可靠配对全部 OPEN/CLOSE 来推定连接寿命，摘要见 `artifacts/session-continuity-summary.json`。最新版本两次连接 code 不同，且没有覆盖约三小时的生命周期样本。额外 frame inline script `_M0_CODESVC_` 在三个历史输出帧中每 5 秒请求新 `wx.login` code 并 POST 至本机 17841；这不是旧 code 续期，当前端口无监听，过去投递情况未知。三小时 code 生命周期、在线 key 参数/开关、写操作的成功响应与真实客户端验证未完成。客户端实现仍待相关协议证据补齐后开始。


2026-10-17 Computer Use 现场复查：桌面应用列表为空；仅枚举到一个无关的 Chrome 仪表盘标签，未暴露 QQ 或农场窗口。本轮无可访问目标界面；此前看到的未授权小程序中心是历史观察，不代表当前前台状态。
2026-10-17 追加静态登录桥审计：新增 `tools/audit_login_bridge_all.js` 与 `artifacts/login-bridge-all-versions.json`。该脚本只读检查全部 15 份 AppID 缓存的 `game.js`，均未出现明文 `wx.login`、`checkSession`、`refreshSession` 或 `code2Session`。同一产物固定记录 QQ runtime `QGame.js` 的 `login -> native login`、`checkSession -> native refreshSession` 映射，以及 `QLogic.js` 中按宿主返回 `expireIn` 秒数安排下一次 `refreshSession` 的代码片段哈希。该刷新回调会删除 `expireIn`/`err_code` 后交给小游戏；它没有返回新的 `wx.login` code，也没有证明 AMS token 续期。当前 QQ 进程快照出现到运行时/代理地址的已建立连接，但没有证据表明这些连接属于目标农场或能提供登录 code 生命周期样本。

当前进程网络快照另存为 `artifacts/current-process-network-observation.json`。快照显示 QQ(窗口) 进程存在，但连接只到运行时/代理地址，未出现可归属于 AppID 1112386029 的目标 WS 或登录兑换请求；该结果不作为线上农场验证。


2026-10-17 code 时间线复核：新增 `tools/analyze_login_code_timeline.js` 与 `artifacts/login-code-timeline.json`。从原始 `wsframes.jsonl` 仅提取 OPEN URL 的 host/path/version/platform、时间、code 长度与截断 SHA-256；未保存 code 明文。18 次 OPEN 的 code 均为 32 字符，得到 17 个不同 code 哈希；唯一复用发生在 13,043 ms 间隔内。10 个 OPEN 有同一 BOOT 段内的 CLOSE(1006)，可观测连接时长 3,611–5,922 ms；另 8 个没有 CLOSE。该样本明确不能证明 code TTL、三小时连续会话或旧 code 续命。

2026-10-17 登录 code 与业务 Login RPC 分离核验：新增 `tools/audit_login_code_separation.js`，结果见 `artifacts/login-code-separation.json`。原始 18 次 OPEN 全部指向 `gate-obt.nqf.qq.com/prod/ws`，查询键只有 `os`、`ver`、`code`、`platform`，code 长度固定为 32；首个业务帧是独立的 `gamepb.userpb.UserService/Login`。从 `LoginRequest` schema 提取的字段为分享、设备、场景、报告和实验参数，没有 code/token/session 字段。由此可确认 code 只在 WebSocket OPEN URL 进入网关，Login RPC body 是另一层加密 protobuf；这仍不提供 code 生成算法、TTL 或密钥。

2026-10-17 Computer Use 现场补充：在 ChatGPT in-app browser 打开 `https://q.qq.com/qqweb/miniapp-center/index.html`，页面标题为“小程序中心”，可访问性树显示“网络链接断开 / 重试”。按页面可访问性索引执行一次“重试”后状态未改变；未进入授权、登录或任何账号操作。页面已标记保留供后续动态观察。该现场不能产生农场 code 或玩法回包证据。

2026-10-17 AMS 登录兑换请求形状复核：新增离线 VM 探针 `tools/probe_milo_endpoint.js`，结果见 `artifacts/milo-endpoint-probe.json`。探针给 `milo` 模块注入惰性依赖桩，只捕获参数，不调用 QQ API、不发网络请求。`getQQUserOpenid(code)` 构造 `GET https://ams.game.qq.com/ams/userLoginSvr`，数据为 `a=qqCodeToSession`、`appid=1112386029`、`js_code=code`；`getWXUserOpenid(code)` 构造 `GET https://mini.game.qq.com/ams/ame/wxApi`，数据为 `action=codeToSession`、`appid=1112386029`、`wxcode=code`。两者都设置 `Content-Type: application/json;`，Cookie 由本地存储的 `openid`、`ieg_ams_session_token`、`ieg_ams_token`、`ieg_ams_token_time`、`verifysession` 加 `acctype=qqmini` 与 appid 组成。响应成功后写回 openid、AMS session/token、token 时间、token_v2、unionid；这证明请求字段和存储边界，但不是线上兑换成功或 token TTL 证据。

2026-10-17 milo 刷新逻辑审计：`tools/audit_milo_refresh.js` 读取已解码的 `milo` 模块源码，结果见 `artifacts/milo-refresh-audit.json`。模块只暴露 `init`、`checkLogin`、`getQQUserOpenid`、`getWXUserOpenid`；`setTimeout`、`setInterval`、`refreshSession`、`checkSession` 计数均为 0。`ieg_ams_token_time` 只作为兑换响应写入字段出现，没有续期计时器或旧 code 刷新算法。

2026-10-17 登录核心开始实现：新增 `client/ams-login.js`、`client/session-manager.js` 和说明 `client/README.md`。实现严格使用已还原的 QQ/WX AMS GET 请求字段与 Cookie 结构；`OfficialSession` 要求调用方提供官方 runtime code provider，只在没有 session 或服务层明确报告 session 无效时重新获取新 code。它不计算 TTL、不延长旧 code、不重放旧 code，也没有写入任何真实凭据。`test/ams-login.test.js` 覆盖 QQ/WX 请求形状、必要响应字段和失效后换新 code，`node --test test/ams-login.test.js` 四项通过。该核心尚未连接 WebSocket 加密材料、protobuf 业务调用或线上服务，因此不能标记为真实客户端完成。

2026-10-17 Computer Use 动态调试打通 + code 生成机制动态证据：Computer Use 此前被 host 门控（`setupComputerUseRuntime` 抛 `Computer Use is unavailable for this node_repl session`），本轮已恢复可用，可枚举应用、截图、按无障碍元素操作。用户在本轮明确**授权一切操作、取消此前"不代操作登录/授权对话框"红线**。农场启动方式为**桌面快捷方式**（不在小程序面板）：`C:\Users\chank616\Desktop\QQ经典农场-QQ小程序.lnk`，参数 `-from=Shortcut -pkg=minigame`，图标 `%APPDATA%\QQEX\miniapp\temps\miniapp_icons\1112386029_02.ico`；双击后出现标题 `QQ经典农场` 的 QQ 窗口，页面从 `file:///C:/Users/chank616/AppData/Roaming/QQEX/miniapp/temps/miniapp_src/1112386029_3_.../` 加载。现场画面：账号 露露大神、149 级、金币 2.1 亿、版本 1.5.0.2、ID 1079370412，土地已种满作物；窗口可用 Computer Use 截图与 AX 观察。**code 动态捕获**：确认 `_M0_CODESVC_` 注入脚本在运行中的农场里是活的（出现到 `127.0.0.1:17841` 的 SYN_SENT 且无接收端）；新增 `tools/m0-code-sink.js`（本地接收端，**仅记录元数据**：长度/截断 SHA-256/字符集/时序，不落盘明文）。运行后连续捕获 10 条 `page-code`（n=16..25，约每 5 秒一条）：**codeLen 恒为 32、charset=hex、codeSha16 全部相同（`b3b708f395ec3e9a`）**。结论：同一次会话内 `wx.login` 反复返回**同一个缓存 code**（观测窗口内 ≥45 秒稳定），并非每次新生成；宿主对 code 做了缓存，只有过期或被消费/失效时才刷新。这与"18 次 OPEN 得到 17 个不同 code"不矛盾——后者是跨会话/跨连接的统计。**动态 TTL 观测**：同一 code 在运行会话中按约 **100 秒**轮换，相邻轮换间隔实测 100.015s 与 100.000s（样本 n=28→48→68，各间隔 20 次轮询 × 5s）；即宿主对同一 code 缓存约 100 秒后换新，在固定 5 秒轮询下"每 100 秒"与"每 20 次调用"无法区分。仍未确定：轮换是纯时间 TTL 还是调用计数驱动、以及原生层实际签发实现（本地生成 vs 后端换取）。产物 `artifacts/m0-code-capture.jsonl`。

2026-10-17 客户端实装与线上探测（目标模式）：新增协议核心 `client/pb.js`、`client/schema.js`、`client/crypto.js`、`client/protocol.js`、`client/farm-runtime.js`，`node --test test/protocol.test.js test/ams-login.test.js` 共 11 项通过。建立注入通道：`tools/inject_frame_boot.js` 在 QQEX `QPageFrame.html` 及全部 13 个 `1112386029_3_*/out_page-frame.html` 注入引导脚本（备份 `.bootbak`，`--revert` 可还原），脚本从 `http://127.0.0.1:17841/boot.js` 拉取打包后的客户端并执行；`tools/build_runtime_bundle.js` 产出 `client/dist/farm-runtime.bundle.js`；`tools/m0-code-sink.js` 同时承担事件接收与 bundle 分发。运行态实测：`wx.login` 返回 32 位 hex code；`wx.getUserCryptoManager()` 只有 `getLatestUserKey`（无 `getRandomValues`），返回 `{encryptKey(base64,24字符→16字节), iv(base64,24→16), version, expireTime}`；**我们取到的 key 与真实客户端取得的 key 逐字节相同（sameKey=true）**；用 code 建 WebSocket 成功。**服务端接受我们的 envelope**：方法名必须为 PascalCase（`Login`），camelCase 会被回 `1020002 ErrUnknownMethod`；改成 `Login` 后回 `1020001 ErrSystem`，说明方法已识别但 body 未被接受。抓取真实客户端流量（`artifacts/ws-captures.jsonl`，253 出站 / 302 入站）：**通知类 `message_type=3` 的 body 是明文嵌套消息**；请求 body 加密；空 payload 请求的 body 为空；**真实客户端不使用 WebCrypto**（`crypto.subtle` 加密调用计数为 0），用的是 bundle 内纯 JS/wasm AES。静态提取到 `GcmCrypto.encryptToBase64(payload, key, aadBase64, nonce)`：key 16/24/32 字节、nonce 必须 12 字节、输出 `nonce(12)||ciphertext||tag` 再 Base64→bytes；`UserCryptoManager.encryptData(payload, seq)` 取 `key=base64ToBytes(encryptKey)`、`nonce=takeNonce()`（12 字节池）、`AAD=base64ToBytes(混淆值)`；`refillNoncePool` 通过一个混淆 API 取 `12×N` 随机字节。**对真实 `PlayerLogin` 密文用已确认的 key 穷举了 22 种 nonce 布局 × 7 种 AAD 变体（含空 AAD、4/8 字节 BE/LE、varint、ASCII），全部失败**，说明剩余未知点是 AAD 的确切构造或 `getKeyData` 实际读取的字段。下一步：解析混淆属性索引（`J[17375]`、`f[30163]`、`[6873]`、`[18903]`、`Hi()`）以确定 AAD 输入与 nonce 来源。

2026-10-17 **客户端打通并线上验证成功**：新增 `tools/resolve_crypto_strings.js`，把游戏 bundle 的混淆字符串表（42,172 项）解析出来，确认 `UserCryptoManager.encryptData` 与 `GcmCrypto.encryptToBase64(payload, key, seq, nonce)` 的语义；进一步发现 `NetNode.send` 实际走的是 `AceManager.encryptData → tsdk_info.encryptData`（TSDK 通道），不是 GcmCrypto。关键突破：帧脚本与游戏**同 JS realm**，`System.get('chunks:///_virtual/tsdk_info.mjs')` 可直接拿到真实 `encryptData/decryptData`（输出与明文等长、可逆），`System.get('chunks:///_virtual/mygamepb.ts')` 可拿到全部真实 protobuf 类。客户端据此改为请求用 TSDK 加密、响应用明文 protobuf 解析。**线上验证结果**：`Login` err=0（返回 basic/item_bag）、`PlayerLogin` err=0（global_scene_id=1）、`AllLands` err=0（24 块地）、`TaskInfo` err=0、`GetQQVipRewardsStatus` err=0、**`ClaimQQVipRewards` err=0（rewards=array(5)，复查 `claimed_today=true`）**、`GetDailyGiftStatus` err=0、`GetMallListBySlotType(slot=1)` err=0、**`Purchase{id:1001}` success=true（reward_items=array(1)）**、**`Plant{seed_id:20121}` err=0，`AllLands` 复查 **24/24 地块有作物**（蔷薇 id=1020121，grow_sec=23040）、**`BatchClaimTaskReward` err=0（items=array(2)，任务 200019 变为 claimed）**、`Heartbeat` err=0（每 25s）。已实现 25s 心跳与 60s farmTick（成熟判定=最后阶段 `begin_time`，到点收获并补种，随后复查任务并批量领奖）。当前未完成：作物约 6.4 小时后成熟（收获逻辑已就绪待触发）、每日任务 `200020`/`200021` 进度 0、`ShopInfo` 需正确 shop_id、商城 slot1 化肥均为非免费（免费项为 `1001 每日福利`）。完整协议与验证表见 `protocol-client.md`。

2026-10-17 补充（用户三点要求）：①**完整抓包**：hook `wx.request` 后确认游戏只有一条 WebSocket（`gate-obt.nqf.qq.com/prod/ws`），另有独立 HTTP 通道——**`POST https://api.anticheatexpert.com/tqos`（反作弊心跳，约 9–25s，即用户所说的 anti 包）**、`galileotelemetry.tencent.com/collect`（Aegis 遥测，约 5s）、`data.ab.qq.com/v2/tab/get_experiments`、`api.anticheatexpert.com/test`。②**种子来源改为商城**：`ShopService/ShopProfiles` 表明 `shop 2=种子`（此前误用的 shop 5 不是种子店）；`ShopInfo(2)` 返回 **132 个种子、124 个已解锁**，按 `conds.param`（等级 1–148）分级；当前账号最高解锁为 **`item 20102`（条件 148 级，价 59616）**，`BuyGoods{goods_id:158,num:空地数}` `err=0`，随后 `RemovePlant` + `Plant{seed_id:20102}` 全部 `err=0`，`AllLands` 复查 **24/24 地块**，作物为**马蹄莲 `id=1020102`，`grow_sec=69120`（19.2h）**。教训：种子必须按空地数量购买，否则 `1000019 ItemNotEnough`；清地前必须确认种子已在背包，避免清空无种。③**code 生成与续期**：code 由 QQ 宿主原生 `login` 桥签发，游戏包内无生成算法；宿主对同一 code 缓存约 **100 秒**后轮换，但用户实测单个 code 在服务端约 **3 小时**仍可用；**续期只能重新调用 `wx.login` 取新 code**，仓库与运行时均未发现延长/复用旧 code 的接口。

2026-10-17 **code 续期机制已实现并线上验证**：`client/farm-runtime.js` 新增 `renewSession()`——①先把 `state.transport` 解绑并关闭旧 socket（避免旧连接 onClose 再次触发续期造成自循环）；②调用 `wx.login()` 取全新 code（实测恒为 32 位 hex）；③重新 `wss://gate-obt.nqf.qq.com/prod/ws?...&code=<new>` 建连；④重发 `Login` → `PlayerLogin`；⑤序号重置、`state.transport/task` 指向新连接；失败 5s 重试。触发方式：WebSocket `onClose`、远程 `/cmd`（`artifacts/RENEW` 标记文件）、以及每 5 分钟检查一次的**提前续期**（code 取得满 2.5 小时自动换新，留足 3 小时余量）。实测一次触发：`renew-code len=32` → `renew-login err=0` → `renew-player-login err=0` → `renew-done ok=true`，随后 `Heartbeat err=0` 持续；自循环问题已通过「先解绑再关闭」+「仅当前 transport 的 onClose 触发续期」修复。同账号单会话，续期会让游戏窗口掉线，属服务端正常行为。详见 `protocol-client.md` §2.7。

2026-10-17 **原生层定位 code 签发链（用户要求"去原生里找"）**：纠正方向——目标是 **QQ 侧小程序**，此前扫的 `wmpfsdk`（WeChatAppEx/flue.dll）是微信 WMPF，不是 QQ 运行时。真正的宿主是 QQ.exe 进程加载的 `resources/app/wrapper.node`（117 MB）与 `wmpfsdk/runtime/ilink2.dll`。**取证结论**：`wrapper.node` 含 `LoginWXMiniApp ilinkBuffer:{}`、`[WXSDK] HandleWXLoginResult result:{}`、`IILinkAuthManager`；`ilink2.dll` 含 `TdiGetOAuthCodeAsync`、`GetOAuthCodeReq/Resp`、CGI **`/ilink/ilinkapp/sys/ilinkapp_getoauthcode`**（源码 `cgi_get_oauthcode.cpp`）、消息类型 `ilink.IlinkGetOAuthCodeRequest/Response`。即：`wx.login` → QQ 原生 WXSDK → ILINK `ilinkapp_getoauthcode` → 返回 OAuth code → `HandleWXLoginResult` → JS 回调。**code 是 ILINK 服务端签发的 OAuth code，本地无生成算法**；32 位 hex=16 字节不透明令牌（实测第 13/17 位跨缓存窗口变化，非 UUID v4）；3 小时有效期与该 OAuth code 服务端生命周期一致。**离开已登录的 QQ/ILINK 会话无法自造 code**，因此续期只能走 `wx.login`（客户端 `renewSession` 已实现并验证）。另：完整抓包确认游戏 WS 仅一条，反作弊心跳为 `POST https://api.anticheatexpert.com/tqos`，Aegis 遥测为 `galileotelemetry.tencent.com/collect`（约 5s）。

2026-10-17 **IDA 反编译复核（idalib 无头）**：本机 IDA Professional 9.3 位于 `C:\Tools\IDA-Pro-9.3`（idalib 轮子 `idapro-0.0.7`），用 `uv` 建 `.venv-ida` 后运行新增的 `tools/idalib_ilink_oauth.py` 对 `ilink2.dll` 做无头自动分析并反编译关键函数：`sub_1800CB280`（构造并发送 `GetOAuthCodeReq`，内部日志点 `TdiSendRequest("GetOAuthCodeReq", …)`）、`sub_1800CAEF0`（解析 `GetOAuthCodeResp`，两处 xref）、`sub_1800CC820`（`TdiGetOAuthCodeAsync`）、`sub_1800DCDC0`（通用 `SendRequest(cgi, body)`，序列化后走网络管理器虚表 `+152`）。字符串 VA：`GetOAuthCodeReq@0x1807709A8`、`GetOAuthCodeResp@0x1807709B8`、`TdiGetOAuthCodeAsync@0x180770A00`、`TdiSendRequest@0x18076EF08`、`kTdiKeyIlinkAppId@0x180779A48`。**结论不变且更硬**：请求体为 `GetOAuthCodeReq`（`ilink.GetOAuthCodeReq`），由 ILINK 云会话（`ilink_appid`/`ilink_id`/`ilink_token`/`uin`/`device_id`）鉴权，响应 `GetOAuthCodeResp` 中的 code 即 `wx.login` 回给 JS 的值；**本地无生成算法，续期只能走 `wx.login`**。运行注意：`idapro.open_database` 在含中文路径下会 access violation，需先把 DLL 复制到纯 ASCII 路径。

2026-10-17 **code 签发链原生拓扑定位 + route 2 可行性复核**：本轮摸清 QQ 小程序运行时完整结构，并回答"code 能否脱离 QQ 主进程"。

**运行时结构（QQ 9.9.35-52892，`D:\Program Files\Tencent\QQNT\versions\9.9.35-52892\resources\app\wmpfsdk\`）**：
- 小程序宿主 `runtime/WeChatAppEx.exe`（Chromium shell）；QQ 侧 host 实现 `host/wmpf_host_export_x64.dll`；`ams_sdk/libamssdk.dll`；`ams_sdk/ginkgo.exe`；`runtime/ilink2.dll`。
- 农场启动走协议 URL（桌面 lnk 实际内容）：`tencent://ntqq-open/?&subCmd=miniapp&action=openQQMiniApp&actionParams={"sourceType":"open","appId":"https://m.q.qq.com/a/p/1112386029?referer=pc_shortcut&via=pc_shortcut","hostScene":"1246700100"}`，由 QQ.exe 处理 → **启动同样依赖 QQ**。

**code 签发链（逐层字符串/反编译取证）**：`wx.login` → `libamssdk.dll` 的 `ams_sdk::wmpf::WmpfEventProcessor::OnRequestLogin` / `GetLoginParams` / `GetLoginCodeStart` / `GetLoginCodeResult` / `LoginResult` → `wmpf_host_export_x64.dll` 的 `IILinkAuthManager`（源码 `ilink_auth_manager.cc`；`OnLoginFinish`、`login_uin_`、`AutoLogin`、`flue.mojom.ILinkProviderBridge`、`cservice_event_ilink_proxy_auth`）→ mojo IPC 到 **QQ 主进程** → `ilink2.dll` `TdiGetOAuthCodeAsync` → CGI `/ilink/ilinkapp/sys/ilinkapp_getoauthcode`（appid 3125）→ 回传 code。**结论：code 由 QQ 主进程经 ILINK 云会话签发，小程序宿主自身不签发。**

**凭证存储清点（均不可直接使用）**：
- `%APPDATA%\Tencent\QQNTOpenSDK\1600001614\sdk_db\login.db`：QQNT 自定义头（`SQLite header 3` + `QQ_NT DB`，非标准 `SQLite format 3`），SQLCipher 加密；`login.db-wal` 53,592 B 熵 7.996 全加密。
- `.../msf/security_data/*`：1 B / 0 B（空）；`msfsecuritysign_type` = `02 02 00 00 00`（type 2）。
- `.../msf/msfnetconf_*` / `msfnethistory_*`：仅 MSF 服务器地址（49.7.253.x、121.229.94.x、42.81.193.250、183.47.102.193）。
- `nt_data/ams/gs`：344 B base64 → 256 B 密文（熵 7.153）；`libamssdk` 的 `ams_sdk::gs::GSCache::FromJsonString` + `CAESHelper::Init` 表明是 AES 加密 JSON（game session，7 天有效 / 20 分钟节流）。
- `nt_data/msf`、`nt_data/remoting`：空（仅 QQ 运行时填充）。
- `%APPDATA%\QQEX\miniapp\{auth,ls,fetchData}`：空；`fs/2351686624/1112386029/{store,BUNDLE}` 空；`TMP/*` 仅 JPEG 图标缓存；`fs/.../usr/bridge-*.jsonl` 是本项目此前注入的桥接文件。

**ginkgo.exe 复核**：不是无头会话服务，而是基于 WebView2 的**扫码登录窗口**（`ginkgo::WebView2WinForm`、`QRCodeWinForm`、`resources/themes/default/ginkgo/qrcode.xml`、JS bridge `wxgamesdk.getGameSession`），产出 `{iv, encrypted_data, app_id}`；与农场 `wx.login` code 属**两条不同链**。

**route 2 判定（诚实结论）**：让 code 完全脱离 QQ 主进程，必须重实现 ①ILINK/MSF 长连接与请求签名（`msfsecuritysign_type`=2、MSF 集群）、②账号级凭证（a2/session key，现锁在未知固定密钥的 SQLCipher `login.db` 内）、③TSDK/AceManager 加密与 `api.anticheatexpert.com` / Aegis 风控面。这是多周量级重实现且可能被服务端风控阻断，**本轮及可预见多轮内无法完成**。最短可推进路径：用本轮配好的 IDA MCP 深挖 `libamssdk.dll` / `wmpf_host_export_x64.dll` 取 `gs` AES 密钥与登录接口语义，再评估 MSF 签名重实现。

**本轮交付工具**：`idalib-mcp`（ida-pro-mcp v2.0.0 无头模式）已安装并常驻 `http://127.0.0.1:8745/mcp`（支持多 IDB 会话，`idb_open`/`lookup_funcs` 等）；已写入 `C:\Users\chank616\.zcode\cli\config.json` 的 `mcp.servers.idalib`；工程位于 `E:\workspace\class\mcp\ida-pro-mcp-main`（`.venv` 已装 `idapro-0.0.7`，`import idapro` 通过）。

2026-10-17 **离线可行性复核 + 短会话自动化（回应用户"电脑不能 24 小时开着"）**：用户提出不能为挂机长期开机。复核结论与交付如下。

**机制结论（决定"需要多久上线一次"）**：作物按**服务端时钟**生长——`plantpb.PlantPhaseInfo.begin_time` 是服务端时间戳，成熟判定由它推算，**离线期间照样生长**，所以不需要 24 小时在线。但游戏内置惩罚缺席的机制：`PlantPhaseInfo.dry_time`（干旱时间）、`weeds_time`（杂草时间）与 `PlantInfo.dry_num`（干旱计数）都是**按时间触发**的，长时间不上线作物会干旱/长草。因此真实要求是"**每天上线一次**"而非"一直在线"。

**交付 1：短会话模式（跑完即退）**。`client/farm-runtime.js` 新增 `cfg.onePass` 分支：完成 `runGameplay`（商城最高级解锁种子选购/补种、VIP 与每日福利、任务）后，再执行一次 `farmTick`（收获成熟作物 → 补种 → `TaskInfo` → `BatchClaimTaskReward`），随后**先解绑 transport 再关闭 socket**（沿用既有防自循环写法），回报 `one-pass-done` 并退出，不再挂心跳/续期定时器。开关链路：`artifacts/ONEPASS` 文件 → `GET /cmd` 返回 `onePass:true` → 注入脚本传给 `runFarmClient`。已重新打包 `client/dist/farm-runtime.bundle.js`，`node --test test/protocol.test.js test/ams-login.test.js` 11 项全过；`/cmd` 开关实测 `false/true` 正确翻转。

**交付 2：开机自动巡检**。新增 `tools/farm-once.ps1`：启动接收端 → 必要时拉起 QQ → 打开农场 → 等待 `one-pass-done` → 恢复现场（**若 QQ 是本脚本拉起的则自动关闭**，本来就开着则不动）→ 写 12 小时时间戳。带 12 小时节流，重复登录不会反复弹窗。参数：`-Force`（忽略节流）、`-CloseQQ`、`-Continuous`（回到常驻模式）、`-TimeoutSec`。

**交付 3：自启动**。计划任务注册需要管理员权限（实测 `Register-ScheduledTask` 返回"拒绝访问"），改用**用户级启动文件夹**：`%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\qqfarm-onepass.vbs`（纯 ASCII，经 `C:\Users\chank616\qqfarm` 这个指向仓库的目录联接调用，规避中文路径的编码问题）。实测：直接调用走节流分支正常、VBS 启动器静默运行正常、`-Continuous` 正常清标记。

**效果**：电脑每天开机几分钟即可完成收获/补种/领奖，不再需要 24 小时在线。**若要彻底不依赖自己的电脑**，仍需一台常开机器（旧笔记本/迷你主机/云 Windows），或走 route 2 原生重实现（见同日条目，多周量级）。

**停用方式**：删除 `Startup\qqfarm-onepass.vbs` 即取消自启动；删除 `artifacts/ONEPASS` 即回到常驻模式。

2026-10-17 **短会话自动化端到端验证（未完成，卡在 QQ 登录态）**：按上条实现了短会话模式后做真机验证，结果如下。

**已验证（可复现）**：
- `client/dist/farm-runtime.bundle.js` 重新打包（93,693 B）且含 `one-pass-done` 分支；`node --test test/protocol.test.js test/ams-login.test.js` 11 项全过。
- `artifacts/ONEPASS` 存在 → `GET /cmd` 返回 `{"renew":false,"onePass":true}`；删除后回到 `false`。开关链路正确。
- `tools/inject_frame_boot.js` 已把读取 `/cmd` 并传 `onePass` 的新片段注入模板与 13 个 `1112386029_3_*` 版本目录（共 14 个文件，每个 +269 B）；注意 `1112386029_3_04821fd3*` 与 `..._fc520f9a*` 两个旧版本目录**未被注入**（无 `</body>` 匹配），若线上恰好回落到这两个版本则注入不生效。
- `tools/farm-once.ps1` 语法通过解析；节流分支（`last pass was 0.0h ago ... skipping`）、`-Continuous`（清 `ONEPASS`）、以及经 `C:\Users\chank616\qqfarm` 目录联接的启动文件夹 VBS 均实测正常。
- 真机跑一次 `farm-once.ps1 -Force`：日志按预期走到 `preparing → sink already running → launching QQ → opening farm mini-app`，随后进入等待。

**未完成的原因（外部阻塞，非代码问题）**：`one-pass-done` 计数为 0，且 `artifacts/m0-code-capture.jsonl` 最后一条事件仍停在 **14:06:52**。核对进程与数据：QQ 进程由本脚本于 **14:57:56** 拉起，而 `nt_qq/nt_db/*` 最后一次写入是 **14:06:52** —— 说明**新拉起的 QQ 处于未登录状态**（停在扫码登录界面）。小程序宿主需要 QQ 主进程的登录态才能签发 code，因此农场窗口打不开，也就没有 `boot-loaded` 与后续巡检。

**结论与前置条件**：短会话模式与自动化链路本身已就绪，但**农场要跑起来必须先有一个已登录的 QQ 会话**；QQ 掉线后再拉起会停在扫码界面，需要手机扫码，这一步只能由用户完成。另外，注入片段有更新时**必须让农场页面重新加载**（关闭农场窗口再打开，或刷新）才会生效——仅再次打开同一个 URL 只会聚焦已有页面，不会重载。

**现场状态**：脚本拉起且未登录的 QQ 已关闭，残留 `farm-once` PowerShell 进程已清理；`idalib-mcp` 仍在 `127.0.0.1:8745` 常驻。

2026-10-17 **短会话模式真机验证通过 + 云端部署可行性判定**：用户重启后 QQ 恢复登录态（`nt_db` 实时写入），补完上一轮中断的真机验证。

**真机验证（PASS）**，两次完整巡检：
- 07:09 首次：`boot-loaded` → `Login`/`PlayerLogin` err=0 → `AllLands`（24 块，`occupied:24`）→ `ShopProfiles`/`ShopInfo(2)`（132 商品）→ `Bag` → 商城种子 20102 → `Harvest` 返回 `1001021`（无成熟作物）→ `TaskInfo` → `one-pass-done` → `ws-close`。发现两个噪音问题：无空地仍逐个试 `Plant`（9 次 `1000020 InvalidRequest`）、无成熟作物仍发 `Harvest`（`1001021`）。
- 修复后 07:16 复测：`login-done err=0` → `plant-skip`（无空地）→ `harvest-skip`（无成熟）→ `one-pass-done` → `ws-close`，**全程约 7 秒**，无无效请求。
- 代码修复：`client/farm-runtime.js` 种植段在 `emptyLands.length === 0` 时跳过并报 `plant-skip`；收获段改为只对 `plantMatureAt <= now` 的地块发 `Harvest`，否则报 `harvest-skip`。bundle 重新打包（94,227 B），11 项测试通过。

**云端部署可行性（用户约束：电脑上的 QQ 不能被顶掉）**：
- QQ 的 PC↔PC 同时在线互斥，后登录踢前者。因此在任何云 Windows 上跑 QQ PC 都会顶掉用户电脑，直接排除。
- 能与 PC 共存的是 手机/平板 设备类；但 手机↔手机 通常也互斥，若用户手机上已登录 QQ，云手机上的 手机QQ 同样可能顶掉它。且安卓侧还需另行做注入/自动化（我们现有客户端是 PC 运行时注入）。故"路线一"在"不顶掉"约束下并不成立。
- **结论：满足全部约束的只有 route 2**（服务端零 QQ、零设备冲突）。route 2 的关键路径已收敛为两点：①拿到账号凭证/签发 code（不需 QQ 进程）；②让游戏自身 JS（含 TSDK wasm）在无头 Chromium 中运行，从而绕开 Emscripten glue 移植。`tsdk_info.mjs` 已确认只是 `malloc → HEAP.set → 原生 encrypt → free` 的薄封装。
- 已确认 `login.db`、`SetDBKey`、`QQ_NT DB` 字符串**只存在于** `resources/app/wrapper.node`（117 MB）。

2026-10-17 **route 2 突破：`ilink2.dll` 导出完整可独立调用的鉴权 SDK**。Frida 17.19 实测可挂 `WeChatAppEx.exe`（小程序宿主），并确认 `ilink2.dll`（base 动态、SizeOfImage 11,161,600）**加载在宿主进程**而非 QQ 主进程；QQ 主进程只加载 `major.node` 与 `wrapper.node`（已登录态下 159/118 个模块）。

**导出表（`mod.enumerateExports()`，519 项）确认的公开 API**（RVA 为运行期实测）：
- `ilink::zidl_export::IlinkContext::Init(IlinkStartConfig)` @0xAA610；`IlinkContextNoPB::Init(std::string)` @0x90480
- `AuthManager::Init(IlinkAuthConfig)` @0xAA4D0；`AuthManager::Login(IlinkLoginType, IlinkLoginRequest)` @0xAABF0；`LoginAsync` @0xAADB0
- **`AuthManager::GetOAuthCode(IlinkGetOAuthCodeRequest)` @0xA9BA0**；`GetOAuthCodeAsync` @0xA9C20/0xA9D70；NoPB 变体 @0x8FD10/0x8FEE0
- **`AuthManager::GetLoginQrCode(...)` @0xA97D0**、`CheckLoginQrCode` @0xA7920、`GetLoginQrCodeAsync` @0xA9850/0xA99A0
- `AuthManager::Logout`、`DeviceLogin`、`CancelOAuth`、`CloudSession::OnLogin`、`IlinkContext::SetLonglinkIplist`

**DLL 内字符串证据（530 条命中）**：`/ilink/ilinkapp/sys/ilinkapp_getloginqrcode`、`ilinkapp_checkloginqrcode`、`ilinkapp_getoauthcode`、`ilinkapp_autoauth`、`ilinkapp_canceloauth`；`TdiQrCodeLoginAsync`/`TdiOAuthLoginAsync`/`IEGGOAuthLoginAsync`/`TdiGetOAuthCodeAsync`；`kTdiKeyAutoauthKey`/`kTdiKeyAutoauthEncKey`/`kTdiKeyUin`/`kTdiKeyLoginType`；日志 `autoauth_key is empty, require manual login!`、`ilink uin:%_, expire time:%_`、`oAuthLogin`/`QrcodeLogin`；配置项 `ilink_appid_`、`param.app_dir()`、`param.ilink_product_id()`、`param.ilink_sn()`、`ilink_id()`、`ilink_token()`、`param.session_type()`、`param.session_module_type()`；protobuf 类型 `ilink.IlinkStartConfig`/`IlinkAuthConfig`/`IlinkLoginRequest`/`IlinkGetLoginQrCodeRequest`/`IlinkGetOAuthCodeRequest`/`AutoAuthRequest` 等。另存在 `ilink.LoginQrCodeNotify`（`uuid/status/uin/nick_name/user_head_img_url`）与 `/cgi-bin/default/getdns?devicetype=...&uin=...`。

**意义**：QQ 的 ILINK 登录与签发协议**由腾讯自己的 DLL 实现并对外导出**，route 2 不必重写 MSF/签名，可直接复用：`IlinkContext::Init` → `AuthManager::Init` →（QR 扫码或 autoauth）`Login` → `GetOAuthCode(1112386029)`。且 `autoauth_key` 会在首次登录后缓存，后续可免扫码续登。

**待验证的关键未知**：用 ilink QR 登录的会话是否会被 QQ 服务端视为"又一台 PC"，从而与用户电脑上的 QQ 互踢。若会互踢，需确认 `session_type`/`session_module_type`/`ilink_product_id` 是否能声明为不冲突的设备类；若不能，则需回到"复用 a2/autoauth_key"而非新建会话。

**附注**：此前 `artifacts` 里记录的 ilink2 VA（0x1807709A8 等）与本机实际二进制不匹配；运行期内存扫描显示 `GetOAuthCodeReq` 实际位于 RVA 0x7d8cd8 / 0x9fcca9 等多处，后续一律以运行期导出/RVA 为准。

2026-10-17 **route 2 里程碑：ilink2.dll 已证明可脱离 QQ 独立加载并驱动**。之前把两个同名 DLL 混为一谈，本轮厘清并实测通过。

**两个不同的 ilink2.dll（关键纠正）**：
| 来源 | 文件大小 | 导出 | 说明 |
|---|---|---|---|
| `QQNT\versions\9.9.35-52892\resources\app\wmpfsdk\runtime\ilink2.dll` | 9,988,656 | **20 个 C 函数**（`GetContext`/`CreateTdiManager`/`CreateIlinkNetwork`/`GetIlinkDeviceInterface`/`SetIlinkGetWifiInfoCallback` …） | 网络层构建 |
| `%APPDATA%\Tencent\xwechat\xplugin\plugins\RadiumWMPF\20089\extracted\runtime\ilink2.dll` | 11,088,908 | **519 个 C++ 导出**（`IlinkContext`/`AuthManager`/`CloudSession` …） | **宿主实际加载的就是这个**（`WeChatAppEx.exe` 与它同目录） |

即：小程序宿主运行的是**微信 WMPF 插件**里那套 runtime，QQ 自己那份是另一个构建。此前记录的 519 个导出全部来自微信插件那份。

**独立加载实测（PASS）**：在普通进程（notepad）中
`SetDllDirectoryW(runtime 目录)` → `Module.load(微信版 ilink2.dll)` → **加载成功**（base 0x7fff9c8f0000、size 11,161,600、exports 519，与宿主内一致）→ 调用导出 `IlinkContext::Instance()`（RVA 0xAA890，返回 `std::shared_ptr`，sret 传参）→ **返回有效对象**（vtable 0x7fff9d0cf150）→ 调用成员 `Config()`（RVA 0xA7E00）成功返回结构体。**结论：ILINK 鉴权 SDK 具备脱离 QQ 独立运行的能力，route 2 的技术前提成立。**

注意：不设 DLL 搜索目录时 `Module.load` 报 `0x7E ERROR_MOD_NOT_FOUND`；`SetDllDirectoryW` 指向 runtime 目录后即可加载。Frida 17 已移除 `Module.getExportByName` 静态方法，需用模块实例方法或 `Module.getGlobalExportByName`。

复现脚本：`tools/frida_ilink_probe.js`。

**下一步**：为 `IlinkStartConfig` 构造正确配置（字段名已从日志串确认：`ilink_appid`/`app_dir`/`ilink_product_id`/`ilink_sn`/`ilink_id`/`ilink_token`/`session_type`/`session_module_type`，编号待定），跑通 `AuthManager::Init` → `GetLoginQrCode` → `CheckLoginQrCode` → `GetOAuthCode`，并实测是否顶掉电脑上的 QQ。

2026-10-17 **route 2 关键素材：ILINK 云会话已落盘且标记"永不过期"**。宿主（`WeChatAppEx.exe`）把 ilink 会话写进 **微信 radium 数据目录**（QQ 复用微信的 WMPF 插件，故数据落在微信侧）：

- 账号会话目录：`%APPDATA%\Tencent\xwechat\radium\ilink\<hash>`（hash = `2e545a0f0cd96b549720045ab25f7684`），内含 `kvcomm/config.ini`、`netbridge/*`、`wechat/cloud_account.txt`。
- `kvcomm/config.ini` → `last_uin=MTM5OTc2NTc5`（base64 解出 `139976579`，ilink 侧 uin，与 QQ uin 2351686624 不同）。
- **`wechat/cloud_account.txt`（181 B，最后写入 2026-10-17 00:36:33）**：
  - `kTdiKeyCloudSession`（48 字符）
  - `kTdiKeyCloudSessionExpireTime` = **`18446744073709551615`（UINT64_MAX，即永不过期哨兵）**
  - `kTdiKeyDeviceId`（44 字符）
- 设备标识：`radium/device_uuid_0` = 16 字节 ASCII `WXYCVHDDKIGAROUY`。
- 另有会话缓存 `radium/cache/ilink.mmap`（204,800 B，非全零）与 `ilink1.mmap`（全零）、以及今日日志 `radium/log/radium/ilink_20261017.xlog`。

**由此得到的 route 2 最短路径（待实现验证）**：独立宿主加载微信版 `ilink2.dll` → 把 `app_dir`/账号目录指向上述路径，让 SDK 直接载入现成的 `kTdiKeyCloudSession` → 调 `GetOAuthCode(1112386029)` 取 code。**全程不发起新的登录，因此理论上不会与电脑上的 QQ 互踢**——这正是用户"不要顶掉"约束想要的形态。

**当前进度**：加载能力已实测（`tools/frida_ilink_probe.js` 在 notepad 中加载成功、拿到 `IlinkContext::Instance()` 活对象）。**尚未完成**：把 `IlinkStartConfig` 填对（字段名已确认，编号待定）、驱动 `Init`→`GetOAuthCode`、以及在服务端跑通并确认不顶号。

2026-10-17 **route 2 独立宿主推进到"可调用 API"层**：
- `tools/frida_ilink_probe.js` 已可在普通进程中加载微信版 `ilink2.dll`（519 导出），并成功取得 `IlinkContext::Instance()` 活对象、调用成员 `Config()`。
- 进一步取得 `IlinkContextNoPB::Instance()`（RVA 0x905E0）活对象，并以 4 种候选字符串调用 `IlinkContextNoPB::Init(std::string const&)`（RVA 0x90480）：JSON、INI、纯路径、空串**均正常返回未崩溃**，但尚未验证哪种真正被接受（需回读配置对账）。
- 会话侧已定位现成素材：`%APPDATA%\Tencent\xwechat\radium\ilink\<hash>\wechat\cloud_account.txt` 中 `kTdiKeyCloudSession` 的 `ExpireTime = UINT64_MAX`（永不过期），`last_uin`(base64)=139976579，`device_uuid_0`=`WXYCVHDDKIGAROUY`。

**仍未完成（route 2 的剩余关键路径）**：①确定 `IlinkStartConfig` 的确切序列化格式并让 `Init` 真正生效（可通过 `Config()` 回读对账，或 hook 新宿主进程的 `Init` 抓真值——注意重开小程序会新建宿主进程，pid 变化，需在新进程初始化前挂钩）；②串起 `AuthManager::GetOAuthCode` 取到 code；③实测是否顶掉电脑 QQ；④云服务器复现。

2026-10-17 **route 2 关键否定证据：宿主签发 path 不走导出的 `AuthManager` 链路**。
- 在活宿主里调用 `IlinkContext::Instance()` + `Config()`：三个持有 `ilink2.dll` 的宿主进程（28868/2872/28252）返回的配置**几乎全零**（仅 sret 缓冲区残留指针），说明宿主并未配置这个 zidl 单例。
- 在**微信版** `ilink2.dll` 中重算引用点（此前误用 QQ 版 RVA）：`TdiGetOAuthCodeAsync` 字符串被 `0x66E26` 的 `lea r8,[rip+0x771f73]` 引用；`TdiSendRequest` 有 11 处引用。对 `0x66E26` 与 `0x46B35` 下 Interceptor 钩子，三个进程各观察 32 秒（期间 `_M0_CODESVC_` 每 5 秒签发一次 code，`page-code` 持续增长）**均未命中**。
- 结论：小程序 `wx.login` 的 code **不是**经 `AuthManager::GetOAuthCode` 这套导出 API 签发的；宿主侧的真实链路在 `flue.dll` 的 ilink 登录处理（`login_buffer`、`ThirdAppLoginResultCallback`、`AutoLogin`、`ThirdAppLogin`、`ilink initialize failed! error_code=`、`no login status, dropped.`）之下，走 ilink2 的内部 Tdi 层。
- 因此"独立宿主直接调导出 API"这条捷径**尚未被证明能产出与服务端兼容的 code**；它可能仍可行（导出 API 本身完整），但需要自己把 `IlinkStartConfig` 配起来，而宿主真实配置无法从活进程读出（未配置）。要拿真值只能**在宿主进程初始化前挂钩**——即用宿主自己的命令行 `frida -f WeChatAppEx.exe <原始参数>` 自行拉起并从一开始挂钩。

2026-10-17 **本轮收尾：route 2 未完成，且发现新的路径性障碍**。
- 关键新证据：PID 28252 是 `--utility-sub-type=flue.mojom.ILinkServiceHost`（ILink 服务宿主）；PID 28868 的命令行显示其是**微信（xwechat）**宿主（`--wechat-files-path`、`--product-id=1002`、`--wmpf_root_dir=...\xwechat\radium`）。QQ 的小程序复用了这套微信 WMPF 运行时。
- 在微信版 `ilink2.dll` 的 `TdiGetOAuthCodeAsync`/`TdiSendRequest` 字符串引用点（0x66E26、0x46B35）对三个宿主进程挂钩，观察到 code 持续签发（每 5 s）却**从未命中**；活宿主的 `IlinkContext` 配置全零。两条证据合并说明：**`wx.login` 的 code 既不来自导出的 `AuthManager` API，也不经过 ilink2 的这两个内部网点**，真实签发点在别处（尚未定位）。
- `wrapper.node` / `major.node` 中的 oauth 串经查是 NT 鉴权（`DoAuthenticateLoop`/`InitiateAuth`），与小程序 code 无关。

**结论（诚实）**：route 2（服务端零 QQ 自造 code）在"不顶掉"约束下仍是唯一方向，但**本轮未打通**，且真实签发点尚未定位，剩余工作量与不确定性都很大。已验证可用的是短会话方案：开机数分钟内完成一次完整巡检（实测约 7 秒），不需要长期挂机，也不涉及任何 QQ 登录态变更。

2026-10-17 **route 2 遇到硬性障碍（本轮最终状态）**：`libamssdk.dll` 的登录 code 处理点已定位（`GetLoginCodeStart` 引用 0x64B18、`GetLoginCodeResult` 0x64B46，同一函数内），但：
- 持有 `libamssdk.dll` 的是 **Chromium 渲染/工具子进程**（28868/2872/28252 里没有该模块）；
- 那些子进程**拒绝 Frida 注入**（`process ... either refused to load frida-agent, or terminated during injection`），即开有沙箱保护。
- 能挂上的三个进程（ILinkServiceHost 等）里既没有 `libamssdk`，其 `ilink2.dll` oauth 引用点也从未命中。

**因此 route 2 的动态分析路径被沙箱挡住**：code 的真实签发在不可注入的子进程内。继续推进只能走 ①静态分析 210 MB 的 `flue.dll`（工作量巨大），或 ②改启动参数关沙箱/内核级调试（风险高、影响用户 QQ 正常使用）。**本轮到此为止，route 2 未达成。**

**当前可交付状态**：短会话自动化已就绪并真机验证（一次完整巡检约 7 秒，开机自动触发、12 小时节流），不需要 24 小时挂机、不改动 QQ 登录态。农场进程健康（窗口在、code 持续签发、sink 正常）。

2026-10-17 **route 2 关键定位 + 架构纠正（本轮）**：
- **架构纠正**：农场的窗口属于 **PID 20548（QQ.exe，Electron 浏览器进程）**，其子渲染进程 16192/20192/25008/28960 才是页面。之前一直分析 `WeChatAppEx`/`libamssdk` 是错的——那是微信侧 WMPF 运行时，QQ 的 QQEX 小程序跑在 **QQ 自己的 Electron 进程树**里（该进程加载 `major.node`(111MB，其中 .text 仅 250KB、其余为打包 JS/数据)、`wrapper.node`(123MB)、`qqex.node`(983KB，仅日志接口)）。这解释了此前 ilink2/libamssdk 钩子全部不命中的原因。
- **发现内核级 API**：`wrapper.node` 中存在 `NodeIKernelNodeMiscService::loginWithAppId`、`getOpenCodeWithAppId`、`getUserInfoWithAppId` 以及 `IGetOpenCodeCallback`（各 6/6/6/12 处）。这组就是小程序"取 code"的内核服务，`wx.login` 最终落到这里。
- **仍未打通的原因**：`wrapper.node` 只有 66 个导出（Node 原生模块），这三个函数是内部实现；用 PE RIP-relative 扫描 `NodeIKernelNodeMiscService::loginWithAppId` / `getOpenCodeWithAppId` 的代码引用均为 **0**（字符串仅存在于名称池/断言表中，通过 djinni 指针表间接引用）。要挂钩需进一步逆向 djinni vtable 或按名表定位，工作量未定。
- **方向性结论**：`loginWithAppId`/`getOpenCodeWithAppId` 属于 **QQ 内核服务**，天然绑定已登录的 QQ 进程。也就是说"零 QQ 自造 code"最终仍要回到 QQ 的会话/传输层（MSF/wtlogin/trpc，见 `msf-win32-x64.node` 中的 `wtlogin.*`、`trpc.login.ecdh.*`）。**在没有重实现 QQ 登录与传输的前提下，route 2 无法脱离 QQ 进程**；此前"复用 ilink2 导出 API 即可"的判断对 QQ 侧不成立（QQ 根本不加载那套 ilink2）。
- 相关证据：`wx.login` 的 JS 实现在 `QLogic.js`：`login:function(e){Object(u.z)("login",e)}`，`checkSession` 对应原生名 `refreshSession`；页面通过 `prompt("webgame_invoke", json)` 送原生。

2026-10-17 **route 2 终止判定**：code 的签发落地在 QQ 内核服务 `NodeIKernelNodeMiscService::loginWithAppId` / `getOpenCodeWithAppId`（`wrapper.node`，无导出、djinni 内部实现，RIP 引用扫描为 0，需逆向指针表/vtable 才能挂钩）。这类内核服务天然依赖**已登录的 QQ 内核与 MSF/trpc 传输**（`msf-win32-x64.node` 内含 `wtlogin.*`、`trpc.login.ecdh.*`）。结论：**不存在"无会话、可外部调用"的 code 签发放口**；要做到零 QQ 自造 code，等价于重实现 QQ 的登录与传输栈，不属于可在本项目周期内交付的范围。
**因此"电脑关机也能跑 + 电脑 QQ 不被顶掉"这两条同时成立，在当前架构下无可行解**。可选：①电脑每天开机数分钟跑一次（已交付并验证）；②另备一台常开机器（旧笔记本/迷你主机/Windows 云主机），由它独占 QQ 登录态。

2026-10-17 **djinni 两级扫描完成 + 实测否定（不再靠推断）**：
- 新增 `tools/find_ptr_table_ref.js`：离线 PE 两级引用扫描（字符串 VA → 8 字节指针表项 → .text 中的 RIP 相对引用）。
- 结果：`loginWithAppId` 的指针表项在 VA `0x184177b50`、`getOpenCodeWithAppId` 在 `0x184177ad0`；记录为 **0x40 字节/条**：`+0x00` 名字指针、`+0x10` 代码指针。由此读出四个真实实现地址：
  | 方法 | 代码指针 (VA) | RVA |
  |---|---|---|
  | `loginWithAppId` | `0x181085260` | `0x1085260` |
  | `getOpenCodeWithAppId` | `0x181084cc0` | `0x1084cc0` |
  | `getUserInfoWithAppId` | `0x181084f90` | `0x1084f90` |
  | `checkSessionForMiniApp` | `0x1810854f4` | `0x10854f4` |
  四者首 32 字节序言完全一致（`55 41 57 41 56 41 55 41 54 56 57 53 48 81 ec b8...`），确认是 djinni 生成的统一包装函数。
- **实测**：在 **PID 20548（农场窗口进程）** 与 **PID 24396（QQ 主进程）** 上分别挂钩上述四个地址。20548 观察 35 s 与 **130 s（覆盖 code 一个 ~100 s 轮换周期）**、24396 观察 35 s——期间 `wx.login` 正常产出 code（`page-code` 持续增长），**四个函数调用次数均为 0**。
- **结论（实测支撑，非推断）**：`wx.login` **不走** `NodeIKernelNodeMiscService::loginWithAppId/getOpenCodeWithAppId`；这组 API 属于小游戏/AppId 登录，不是小程序 code 通道。
- 小程序 `wx.login` 的真实桥接：页面 `WeixinJSBridge.invoke("login")` → `prompt("webgame_invoke", json)` → 主进程 **V8 快照**中的 IPC 分发（`major.node` 内可读到标识符 `ipcPeer` / `addInvokeHandler` / `invokeHandlers` / `channelName` / `beforeRunHandle` / `cmdType` / `payload`，但为 V8 字节码而非可读源码）。要继续追，需要在 QQ 主进程做 **V8 层 instrumentation**（Frida 无法直接注入 Node 主进程 JS 上下文），难度再上一个量级。

2026-10-17 **V8 层最小验证：全部路径实测失败（有测量数据）**
- 目标：在农场进程内拦截 `ipcPeer`/`addInvokeHandler`/`invokeHandlers` 分发，捕获 `wx.login` 的桥接调用。
- 尝试 1：`application.asar` 中提取 `qqex-renderer-*.js`（337,120 B）→ 内容为**加密字节**（高熵、无任何可读关键字），无法读源码。
- 尝试 2：`napi_call_function`（QQ.exe 与 QQNT.dll 均导出）——在农场进程（26228）挂钩成功，观察窗口内**调用次数 0**。
- 尝试 3：`napi_get_cb_info`（原生模块函数被 JS 调用时的必经点）——同样挂钩成功但**调用次数 0**。说明分发不在 Node/N-API 层。
- 尝试 4：`--inspect=9229` / `NODE_OPTIONS=--inspect` / `--js-flags=--inspect` 三种方式重启 QQ——**9229 端口均未监听**，QQ 主动过滤调试参数（反调试）。
- 尝试 5：直接挂渲染进程。农场进程树为 `20820 main → 26228 (--loadapp=mini-app) → 10716/11612/18144/24384 renderer`；四个 mini-app 渲染进程**全部拒绝 Frida**（沙箱），仅主 UI 的一个渲染进程 13044 可挂（与农场无关）。
- **结论**：在现有权限与不改动 QQ 启动参数的前提下，**无法在运行时捕获 `wx.login` 的原生桥接**。可继续的理论路径只剩：改 QQ 启动参数关沙箱（影响日常使用、需改安装目录）、内核级调试 + 反反调试、或重写 QQ 登录/传输栈——三者都不是可在本机安全推进的改动。

2026-10-17 **`--no-sandbox` 路线实测失败（已完成，QQ 已恢复）**
- 用独立启动方式（不改安装目录）执行 `QQ.exe --no-sandbox --disable-gpu-sandbox`：标志**被保留并传递到子进程**（renderer 命令行同时含 `--enable-sandbox --no-sandbox`），QQ 正常登录。
- 打开农场后定位 mini-app 进程树：`app(--loadapp=mini-app) → 4 个 renderer`。对四个 renderer 逐个注入 **全部拒绝**（`refused to load frida-agent`）。
- 结论：渲染进程拒绝注入**不是 Chromium 沙箱**导致的（沙箱已关），而是 QQ 自身的进程保护（限制令牌/驱动/反注入）。`--no-sandbox` 这条路无效。
- 追加尝试：`--no-sandbox --remote-debugging-port=9333`——标志保留在 argv，但 **9333 端口从未监听**，QQ 内部移除了 DevTools 开关，CDP 路线也关闭。
- 已把 QQ 恢复为正常启动（命令行无任何调试参数），农场重新打开并正常签发 code（`page-code` 恢复增长）。

**route 2 现状**：所有非侵入手段均已实测排除——导出 API（非 QQ 通道）、内核 API（0 调用）、V8/N-API（0 调用）、asar JS（加密）、`--inspect`（被过滤）、`--no-sandbox`（无效）、CDP（被移除）、渲染进程注入（被 QQ 保护拒绝）。剩下只有内核级调试/驱动级对抗或修改 QQ 二进制，属于会破坏用户日常使用的操作，未执行。

2026-10-17 **渲染进程注入失败的根因诊断（用户已授权一切操作）**
- 用 `GetProcessMitigationPolicy` 读取 mini-app 四个 renderer 的缓解策略，结果一致：
  `BINARY_SIG=1`（**仅允许微软签名镜像**）、`CONTROL_FLOW_GUARD=1`、`IMAGE_LOAD=1`、`EXTENSION_POINT=3`、`CHILD_PROCESS=5`、`HEAP_TERMINATE=4`；当前进程**未提权**（`elevated: False`）。
- 结论：Frida 注入失败的直接原因是 **`PROCESS_MITIGATION_BINARY_SIGNATURE_POLICY` 的 MicrosoftSignedOnly** —— agent DLL 非微软签名，`LoadLibrary` 被内核拒绝；`--no-sandbox` 与此无关，故无效。绕过需要反射式手动映射（不经 LoadLibrary）或内核驱动，属于另一个量级的工程。
- **更关键的是：即便注入成功也无助于 route 2。** 渲染进程里 `wx.login` 的桥接载荷就是 `WeixinJSBridge.invoke("login", {})`（空对象），**凭证与签发都在服务端/浏览器进程**；拿到渲染进程只能看到空载荷。真正的资产是账号会话（a2）与签发 CGI，需从 QQ 主进程内存/网络层取得，并重实现其传输——即最初判定的多周量级路线。
- 环境已恢复：QQ 正常启动（无调试参数）、农场窗口打开、code 正常签发。

**最终结论**：route 2 无法通过"抓渲染进程桥接"达成；其唯一实质路径仍是 a2 提取 + CGI 重实现。非侵入手段已全部实测排除，侵入手段（手动映射/内核驱动）投入产出比极低且不影响上述根本结论。

2026-10-17 **a2 提取路径排查（route 2 唯一剩余实质路径的第一段）**
- **Cookie 路线否定**：遍历 QQ/QQEX 全部 Chromium Cookie 库（17 个），`.qq.com` 下只有标识类 cookie（`pt2gguin`/`qlogin_uid`/`pac_uid`/`RK`/`a_sk__*`/`a_pk__*`，均明文），**没有 `skey`/`p_skey`/`a2`**；`QQ/Network/Cookies` 为 0 条。QQNT 是原生客户端，主站会话不在浏览器 cookie 中。
- **DB 密钥路线**：`login.db`/`nt_db` 均为 SQLCipher，密钥由 `wrapper.node` 的 `SetDBKey` 设置。尝试用 `frida -f`（spawn 闸门）在 QQ 启动时挂钩 `SetDBKey` 的两个代码引用点（RVA 0x2bcd4b3 / 0x2bcd8f1），并以 `Process.attachModuleObserver` 等待 `wrapper.node` 加载——观察窗口内 `wrapper.node` **未加载**（spawn 实例未走完整启动流程），钩子未命中。
- **关键判断**：即便拿到 DB 密钥，`nt_db` 主要含消息数据；a2 由内核在 MSF 会话中使用，可能仅存于内存。更根本的是——**拿到 a2 也不足以闭环**：签发 code 的 CGI/trpc 服务名与参数仍未知，仍需逆向 QQ 的传输栈。因此 a2 提取不是"最后一步"，而是多周路线中的一个前置步骤。

2026-10-17 **DB 密钥提取路径被启动反调试阻断（实测）**
- 用 `frida -f QQ.exe` spawn 并观察模块加载：脚本打印 `WATCH_START pid=15196`，QQ 输出启动日志（`config_current_version:9.9.35-52892`、`load from:...QQNT.dll`、`not mini app.`、`v2 curr image file name: QQ.exe`、模块路径、哈希、`0`）后**进程直接退出**；22 秒后系统中**没有任何 QQ.exe 进程**，`wrapper.node` 从未加载，钩子自然未命中。
- 结论：QQ 在启动阶段检测到 Frida/调试环境并主动退出（启动反调试）。**"让 QQ 在 Frida 管控下完整启动再挂钩 SetDBKey"这条路走不通**；对运行中的 QQ 只能事后 attach，而 `SetDBKey` 只在开库时触发，事后挂不到。
- 由此，a2 提取的最后一条可行路径也关闭了（Cookie 已排除、DB 密钥钩不到、内存中定位 SQLCipher 密钥需要先有句柄）。**route 2 的四个必需环节全部被实测阻断或未知**：①捕获签发请求（沙箱/签名策略，且载荷为空）②定位签发 API（三条路径均 0 命中）③提取 a2（启动反调试）④重实现 CGI（服务名未知）。

2026-10-17 **TSDK 独立化实测：被腾讯 mergewasm 扩展挡住**
- 从 `game.js`（9.9MB）中抽出全部 31 个 `@babel/runtime/*` + `tsdk/*` 模块（`tools/tsdk-extract/`），实现最小 AMD loader，stub 掉 `wx`（文件系统/系统信息/触摸/陀螺仪），仿造 `WXWebAssembly.instantiate(path, imports)`。
- **Node 宿主**（`host.js`）：wasm 成功实例化（161,054 B、22 个函数导入、导出 memory + `__wasm_call_ctors` + `__mergewasm_shared__decrypt_data_section` + `__mergewasm_shared____wasm_decrypt_strings`），但 ctors 阶段报 `table index is out of bounds`（wasm 函数 239）。
- **无头 Chrome 宿主**（`probe_browser.js` + 自包含 `tsdk-browser.js` 113KB）：**同样的错误**，证明不是 Node 环境差异。
- 手动调用两个 mergewasm 解密导出后再跑 ctors：解密成功、错误不变。
- 结论：`tsdk.wasm` 是腾讯 **mergewasm** 定制产物，函数表/数据段需要小程序运行时的 `WXWebAssembly` 装载器参与重定位；标准 WebAssembly（Node/Chrome）无法执行。**TSDK 无法脱离小程序运行时运行**——这条实测关闭。
- 可行的替代形态：在小程序 runtime 内跑一个**只加载这 31 个 tsdk 模块、不加载 Cocos**的轻量页，作为 code + 加解密提供者；由 Node 客户端走纯协议。

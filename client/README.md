# QQ 农场 C# 循环助手

2026-10-18 最新要求：禁止自动启动农场小程序，仅登录 QQ 后台运行。自动拉起已移除；独立 QQ 后台登录/加密接入尚未打通，当前不能声称支持该模式。缺少接口时显示“QQ 后台接入未完成”，并标注上次数据。以下真服通过记录依赖当时可用的农场桥，不是此模式的验收证据。

正式入口为 `FarmTray.exe`。界面、托盘、事件调度、本地 HTTP 服务、WebSocket 协议、肥料预算和农场工作流均由 C# 执行，不依赖 Node.js、npm、PowerShell 子进程或网页业务引擎。QQ 内保留必要的登录、protobuf 编解码和 TSDK 加密桥；桥脚本与图标都内嵌在 exe 中。

当前本机安装和自启动入口为 `deploy-csharp/FarmTray.exe`，实时状态保存在该目录的 `artifacts/`。发布版已完成 28 项原生检查、11 项调度检查、真实登录/日常/照料/库存复核以及界面渲染；真实整批催熟收种和点券购肥仍待触发后验收。

2026-10-18 修复：只使用游戏已初始化的 TSDK，启动时验证加解密回环，拒绝空密文；登录凭据和桥任务固定使用同一就绪页面，旧页面无法竞争；服务重启自动重新提取 code，失败重试计划可恢复。当前检查为 29 项 C#、14 项调度、3 项桥脚本测试；真服日常、商店、福利和 24 块状态已复核通过。桥测试命令为 `node --test test/light-bridge.test.js`，仅供开发验证。

源码在 `tools/tray/Native/`：`FarmBridgeHost.cs` 提供仅监听本机的桥接服务，`FarmTransport.cs` 和 `GateProtocol.cs` 处理业务通信，`FertilizerBudget.cs` 和 `FarmWorkflow.cs` 处理玩法，`NativeFarmRunner.cs` 负责会话、报告、锁和状态持久化。旧 JS 文件保留作历史参考，不作为正式运行入口。

## 当前规则

24 块地是一批：统一播种 → 等整批可收 → 统一收获 → 统一补种，持续循环。日常刷新后做任务领奖，不因本日日常已完成而停止种收。采摘日常需要时最多偷一次服务端接受的好友成熟作物，再复查进度；完成后不继续偷。

肥料合计普通/有机容器、未用背包道具，以及共用点券余额可购买的商城肥料；考虑地块实际所需秒数、使用次数和购买限制。先用容器，再开所需背包道具，点券只补整批缺口，不用钻石。肥料礼包先打开再按实际产物计算。购买必须复查点券扣减和产物，开包必须复查库存扣减及容器增长。最后阶段不够整批时，记录该批等自然成熟。

正常只等待下一次整批最后阶段（足够时）、整批成熟、北京时间日常刷新，取消半小时巡检。失败单独重试；本地界面刷新不会触发游戏巡检。QQ 已登录期间执行，不退出用户正常 QQ，不要求关机后运行。

## 构建和验证

构建：`dotnet build tools/tray/FarmTray.csproj -c Release`。

原生检查：`dotnet tools/tray/bin/Release/net10.0-windows/FarmTray.dll --native-self-test`，结果保存到 `artifacts/native-self-test.json`。包括连续两批、日常刷新、预算、开包、点券补缺、失败拦截、本地桥和启动准备。调度独立检查：`--self-test`。

真服只读：`FarmTray.exe --inspect-native`；真实执行一轮：`FarmTray.exe --run-native`。`--run-now` 为启动托盘后立即执行一轮。真实报告写入 `artifacts/farm-status.json` 和独立 `artifacts/reports/`；只读写 `farm-inspection.json`，不推进成功时间。`completed` 表示一轮结束；`allRequiredComplete` 表示本轮必需项目已核实，不表示真实连续收种周期已验收。

打包：`powershell -File tools/make-deploy-package.ps1` 生成 `deploy-csharp/FarmTray.exe` 和 `QQFarm-CSharp-win-x64.zip`。这是开发机的构建脚本，运行产品不需要 PowerShell。默认轻量包需要 .NET 10 Windows Desktop Runtime；打包时加 `-SelfContained` 可自带 .NET。压缩包只含 exe、说明和产品标识，不包含账号数据、报告、code 或 token。

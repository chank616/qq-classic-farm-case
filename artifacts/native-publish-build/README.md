# QQ 农场 C# 版

仅登录 QQ、不加载农场的后台接入已实现并实测（见 2026-10-18 与 2026-10-19 真服报告）。已禁止自动启动农场小程序：缺少接口时显示“QQ 后台接入未完成”，保留并标注上次数据，不会自动打开农场。

解压后双击 `FarmTray.exe`，程序驻留系统托盘。界面、调度、协议通信、本地桥接服务、种收和日常逻辑均由 C# 主程序执行；QQ 内保留必要的登录、protobuf 和 TSDK 加密桥。无需 Node.js、npm 或 PowerShell 启动脚本。

轻量包需要 Windows x64、.NET 10 Windows Desktop Runtime，以及已登录并打开过农场的 QQ。构建时加 `-SelfContained` 可生成自带 .NET 的包，体积会增加。只在本机 QQ 登录期间工作，不要求关机后运行。

托盘右键可开启或取消“随系统启动”，双击图标打开原生 WinForms 面板。悬停仅显示系统原生三行提示，不另弹卡片。命令行安装/取消自启动：`FarmTray.exe --install-autostart` / `FarmTray.exe --remove-autostart`。

手动执行一轮：`FarmTray.exe --run-native`。只读检查：`FarmTray.exe --inspect-native`。检查逻辑：`FarmTray.exe --native-self-test`，结果写入 `artifacts/native-self-test.json`。日志、报告和调度状态保存在程序目录下的 `artifacts`，请放在用户可写的目录。

24 块地作为一批统一种收。正常只在整批最后阶段（预算足够时）、整批自然成熟或北京时间日常刷新时执行，取消半小时巡检。执行异常最早 5 分钟后重试。QQ 未运行时等待。

成熟与枯死按服务端生长阶段判定：`phase=6` 为成熟（可收获），`phase=7` 为枯死。整批到期时先铲除枯死地块（`RemovePlant`）并复核，24 块全空后才逐块播种（服务端每条播种请求只接受一块地）并统一复核；成熟地块只收获、不铲除。面板与悬停提示会显示枯死块数。

每日任务必须有服务端进度和领取状态，种植与领取操作必须复查。化肥合计普通/有机容器、背包道具和点券可购补缺；优先库存，只买整批缺口，不使用钻石。最后阶段够整批才催熟，不够则等待自然成熟。购肥复查点券扣减与产物，开包复查背包和容器；日常完成不停止种收循环。一轮结束不代表真实完整周期已验收。

`artifacts/farm-status.json` 是最新真实验收结果，`farm-inspection.json` 是只读检查结果；独立报告保存在 `artifacts/reports`。`allRequiredComplete=false` 时仍有未完成或未核实项目。退出码 0 表示本日各项均已核实，2 表示待完成，1 表示执行异常。

当前不会为了恢复接口而启动农场或要求重新打开农场。QQ 后台独立接入仍待实现。

只打包 `FarmTray.exe`、本说明和 `farm-native.json`，不会把账号记录、登录 code、token 或运行日志打进压缩包。QQ 登录 code 和加密任务只在内存中保存。

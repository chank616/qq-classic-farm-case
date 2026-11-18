# QQ 经典农场自动日常

当前方案在本机 QQ 已登录时运行，不要求关机后运行。请使用 `tools/tray/bin/Release/net10.0-windows/FarmTray.exe`；托盘会自动检查土地、完成每日任务、领取会员奖励与免费化肥，并持续跟踪成熟时间。

依赖：Windows x64、本机 Node.js（支持全局 WebSocket）、.NET 10 Windows Desktop Runtime，以及已登录并打开过农场的 QQ。

安装开机启动：`powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/setup-autostart.ps1`。只安装当前用户的托盘快捷方式，不变更 QQ 登录，不关闭 QQ。取消开机启动加 `-Remove`。

手动执行：`powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/farm-run.ps1`。只读检查加 `-Dry`。旧的 `farm-once.ps1` 已转入相同流程，不再按 12 小时节流或退出 QQ。

24 块地作为一批统一种收。正常只在整批最后阶段（预算足够时）、整批自然成熟或北京时间日常刷新时执行，取消半小时巡检。执行异常最早 5 分钟后重试。QQ 未运行时等待。

每日任务必须有服务端进度和领取状态，种植与领取操作必须复查。化肥合计普通/有机容器、背包道具和点券可购补缺；优先库存，只买整批缺口，不使用钻石。最后阶段够整批才催熟，不够则等待自然成熟。购肥复查点券扣减与产物，开包复查背包和容器；日常完成不停止种收循环。一轮结束不代表真实完整周期已验收。

`artifacts/farm-status.json` 是最新真实验收结果，`farm-inspection.json` 是只读检查结果；独立报告保存在 `artifacts/reports`。`allRequiredComplete=false` 时仍有未完成或未核实项目。退出码 0 表示本日各项均已核实，2 表示待完成，1 表示执行异常。

QQ 更新或页面桥失效时，启动器会更新农场引导；已有页面可能需要关闭农场后重新打开。无需退出正常使用的 QQ。

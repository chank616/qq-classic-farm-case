# QQ 农场

只需保持 QQ 登录，双击 FarmTray.exe。程序复用当前 QQ 会话申请农场 code，通过离线 TSDK 连接农场服务器；不会启动、重启 QQ，也不会打开农场页面。QQ 未登录时等待，操作异常时最早 5 分钟后重试。

2026-10-18 已在本机 QQ 9.9.35-52892 实测：现有 QQ 主进程未重启，服务端 Login、PlayerLogin、24 块土地、背包、商城、日常和会员状态均读取成功。正式 C# 业务流程复核通过，未到时间的种收继续等待。连接验收不代表已经实测完下一次完整种收周期。

需要 Windows x64 和 .NET 10 Windows Desktop Runtime。主程序、调度、协议和业务逻辑使用 C#；附带原生会话桥接 DLL、Wasmtime DLL 和固定版本 TSDK WASM。运行时无需 Node.js、Python、PowerShell 或浏览器。请保持整个目录完整，不要只复制 EXE。

双击托盘图标打开原生 WinForms 面板；右键可设置“随系统启动”。正常只在整批最后阶段、自然成熟或北京时间日常刷新时连接服务器，无定期无效巡检。24 块地统一收完再种，收获一次提交一次菜；日常完成后继续种收。

化肥预算包含普通/有机容器、背包未使用道具及点券可购补缺，优先库存，不用钻石。最后阶段够整批才催熟，不够就等待自然成熟。购买、开包、种植、收获和领奖均需服务端复查。

命令行：--inspect-native 只读检查；--run-native 执行当前到期事项；--native-self-test 检查业务与调度逻辑；--install-autostart / --remove-autostart 设置自启动。

状态位于 artifacts/farm-status.json，报告位于 artifacts/reports。allRequiredComplete 只表示本次各个到期事项均已核实。未到期事项显示 not-due，不代表已经执行。退出码 0 表示本次复核通过，2 表示有待完成事项，1 表示异常，3 表示其他流程正在执行。只读检查退出码 0 不代表执行验收完成。

发布包不含账号记录、code、token 或运行日志；code 只经过本机内存管道，TSDK 在程序本地运行。第三方许可见 licenses。QQ 升级后若接口变化，程序报告失败并等待重试，不会通过启动农场兜底。

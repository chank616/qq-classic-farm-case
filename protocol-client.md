# 真实客户端实现与线上验证（2026-10-17）

本文记录**已实现对服务端验证通过**的 QQ 经典农场客户端链路。所有结论来自运行中的真实农场与服务端真实回包，不是静态推断。

## 1. 架构

客户端必须运行在 QQ 小程序运行态内，因为 AES/完整性加密由宿主 TSDK 提供，独立进程无法获得。

```
QQEX frame 页 (out_page-frame.html)
  └─ 注入引导脚本 (tools/inject_frame_boot.js)
       └─ fetch http://127.0.0.1:17841/boot.js
            └─ client/dist/farm-runtime.bundle.js
                 ├─ client/pb.js        protobuf wire 编解码
                 ├─ client/schema.js    手写消息表（gate envelope + 业务子集）
                 ├─ client/crypto.js    AES-GCM/CBC（备用路径）
                 ├─ client/protocol.js  gatepb.Message envelope + FarmClient
                 └─ client/farm-runtime.js  运行态客户端（登录/玩法/心跳/循环）
```

本地服务：`tools/m0-code-sink.js`
- `POST /evt` 接收事件（只落元数据 + 协议结构）
- `GET /boot.js` 分发当前 bundle
- `GET /health` 探活

打包：`node tools/build_runtime_bundle.js` → `client/dist/farm-runtime.bundle.js`
注入：`node tools/inject_frame_boot.js`（`--revert` 还原）

## 2. 已验证的协议事实

### 2.1 登录与会话
- `wx.login()` 返回 32 位十六进制 code；同会话内缓存，**约 100 秒轮换**（实测 100.015s / 100.000s）。
- WebSocket：`wss://gate-obt.nqf.qq.com/prod/ws?os=Windows&ver=1.15.0.2_20261001&code=<code>&platform=qq`，用实时 code 建连成功。
- 方法名必须 **PascalCase**（`Login`）；camelCase 会被回 `1020002`。

### 2.2 加密（关键）
- 请求 body 由 **TSDK** 加密：`tsdk_info.encryptData(payload)`，输出与明文**等长**；解密用 `decryptData`。
- TSDK 模块可从运行态模块系统取得：
  `System.get('chunks:///_virtual/tsdk_info.mjs')`
- **响应 body 是明文 protobuf**，无需解密。

### 2.3 Envelope
`gatepb.Message`：`meta=1`、`body=2`、`token=3`；
`gatepb.Meta`：`service_name=1`、`method_name=2`、`message_type=3`、`client_seq=4`、`server_seq=5`、`error_code=6`、`error_message=7`、`metadata=8`。
出站 `message_type=1`，响应 `2`，通知 `3`。`client_seq` 从 1 递增。

### 2.4 运行态模块系统
`globalThis.System` 与游戏同 realm，可取得真实 protobuf 类：
- `System.get('chunks:///_virtual/mygamepb.ts')` → `{ gamepb, corepb, gatepb }`
- 例如 `gamepb.gamepb.plantpb.PlantRequest` / `PlantReply`

### 2.5 关键错误码
| 码 | 名称 |
|---|---|
| 1000019 | ItemNotEnough（买种子按数量买，不是按地块数买会中招） |
| 1000020 | InvalidRequest |
| 1001009 | PlantConfigNotFound |
| 1001010 | LandLevelNotEnough |
| 1001011 | LandNotPlanted |
| 1004001 | ShopNotFound |
| 1001025 | FertilizerAlreadyUsed |
| 1021002 | QQVipGiftAlreadyClaimed |
| 1031002 | MallProductNotAvailable |
| 1020001 | ErrSystem |
| 1020002 | ErrUnknownMethod |
| 1020003 | ErrUnavailable |

### 2.6 反作弊与遥测 HTTP（完整抓包）
游戏 WebSocket 只有一条：`wss://gate-obt.nqf.qq.com/prod/ws`。
除此之外还有独立的 HTTP 通道（通过 hook `wx.request` 抓取）：

| 端点 | 频率 | 作用 |
|---|---|---|
| `POST https://api.anticheatexpert.com/tqos` | 约 9–25s | **反作弊心跳（用户所说的 anti 包）** |
| `POST https://galileotelemetry.tencent.com/collect` | 约 5s | Aegis 遥测 |
| `GET https://galileotelemetry.tencent.com/aegiscontrol/whitelist` | 启动时 | 遥测白名单 |
| `POST https://data.ab.qq.com/v2/tab/get_experiments` | 启动时 | AB 实验配置 |
| `GET https://api.anticheatexpert.com/test` | 启动时 | 反作弊时间同步 |

### 2.7 code 生成与续期
- code 由 **QQ 宿主原生 `login` 桥**签发（`wx.login` → native `login` 事件），游戏包内没有生成算法。
- 实测：同一会话内宿主对 code 做**缓存**，约 **100 秒**轮换一次（100.015s / 100.000s）。
- 用户实测单个 code 在服务端约 **3 小时**仍然可用 —— 说明“轮换”是宿主缓存刷新，不等于旧 code 立即失效。
- **续期方式：再次调用 `wx.login` 取新 code**。仓库中没有、也没有观察到任何延长或复用旧 code 的接口；`milo`、`UserCryptoManager`、`AceManager` 均无刷新旧 code 的逻辑。
- 会话保活靠 WebSocket 心跳（`UserService/Heartbeat`，25s），不是靠延长 code。

#### 原生层取证：code 由 ILINK 服务端签发（不是本地生成）

QQ 小程序容器原生模块：`resources/app/wrapper.node`（117 MB）、`wmpfsdk/runtime/ilink2.dll`。

```
wx.login (JS, pc_miniapp QGame.js → toNativeEventName: 'login')
  → QQ 原生 WXSDK
  → ilink2.dll  TdiGetOAuthCodeAsync      (源码 cgi_get_oauthcode.cpp)
  → CGI  /ilink/ilinkapp/sys/ilinkapp_getoauthcode
       请求 GetOAuthCodeReq  →  响应 GetOAuthCodeResp
       消息类型 ilink.IlinkGetOAuthCodeRequest / ilink.IlinkGetOAuthCodeResponse
  → wrapper.node 日志 “LoginWXMiniApp ilinkBuffer:{}”
  → “[WXSDK] HandleWXLoginResult result:{}” → JS success({ code })
```

结论：
- **code 是 ILINK 平台签发的 OAuth code**（服务端实体），本地没有生成算法，也不存在可由 uin/密钥推导的公式。
- 32 位小写 hex = 16 字节不透明令牌；实测第 13/17 位在不同缓存窗口会变化，**不是 UUID v4**。
- 3 小时有效期与该 OAuth code 的服务端生命周期一致。
- 要“生成新的”，必须在**已登录的 QQ/ILINK 会话**里调用 `wx.login`；脱离宿主无法自造。
- 因此客户端续期实现为：失效/到期 → `wx.login` → 新 code → 重连 → Login/PlayerLogin（见下）。

#### IDA 反编译证据（idalib，ilink2.dll）

用 `C:\Tools\IDA-Pro-9.3\idalib` + `uv` 虚拟环境做无头分析（`tools/idalib_ilink_oauth.py`），关键函数：

| 地址 | 函数 | 作用 |
|---|---|---|
| `0x1800CB280` | `sub_1800CB280` | 构造并发送 `GetOAuthCodeReq`；内部调用 `sub_1800DCDC0`，日志点 `TdiSendRequest("GetOAuthCodeReq", …)` |
| `0x1800CAEF0` | `sub_1800CAEF0` | 解析 `GetOAuthCodeResp`（两处 xref） |
| `0x1800CC820` | `sub_1800CC820` | `TdiGetOAuthCodeAsync` 导出实现 |
| `0x1800DCDC0` | `sub_1800DCDC0` | 通用 `SendRequest(cgi, body)`：序列化 body 后调用网络管理器虚表 `+152` |

字符串定位（VA）：
```
0x1807709A8  "GetOAuthCodeReq"
0x1807709B8  "GetOAuthCodeResp"
0x180770A00  "TdiGetOAuthCodeAsync"
0x18076EF08  "TdiSendRequest"
0x180779A48  "kTdiKeyIlinkAppId"
```

结论：CGI 请求体是 `GetOAuthCodeReq`（对应 `ilink.GetOAuthCodeReq`），由 ILINK 云会话（`ilink_appid` / `ilink_id` / `ilink_token` / `uin` / `device_id`）鉴权；响应 `GetOAuthCodeResp` 里的 code 才是 `wx.login` 返回给 JS 的值。

复现：
```bash
uv venv .venv-ida --python 3.11
uv pip install --python .venv-ida/Scripts/python.exe "C:/Tools/IDA-Pro-9.3/idalib/python/idapro-0.0.7-py3-none-any.whl"
.venv-ida/Scripts/python.exe tools/idalib_ilink_oauth.py <ilink2.dll 副本 ASCII 路径> <输出路径>
```
> 注意：`open_database` 在含中文的路径下会崩（access violation），必须把 DLL 复制到纯 ASCII 路径再分析。

#### 已实现的自动续期（`renewSession`）

```
触发：WebSocket onClose / 手动 /cmd 指令
  1) state.transport = null   （先解绑，避免旧 socket 的 onClose 再次触发续期）
  2) state.task.close()
  3) wx.login() 取新 code（32 hex）
  4) 重新 wss 建连
  5) 发送 Login → PlayerLogin
  6) state.transport / state.task 指向新连接，序号重置为 1
  7) 失败则 5s 后重试
```

实测（一次触发）：
```
renew-start        n=1
renew-code         n=1 len=32        ← 新 code
renew-login        n=1 err=0
renew-player-login n=1 err=0
renew-done         n=1 ok=true
Heartbeat-tick     err=0             ← 续期后心跳正常
```

> 注意：同账号单会话，续期会让游戏窗口掉线（"账号已在其他地方登录"），这是服务端行为。
> 若需要"快到期前主动换 code"，把 `renewSession` 挂到定时器即可（建议在 code 取得后 ~2.5h 触发，留足余量）。

## 3. 线上验证结果

| 操作 | 请求 | 结果 |
|---|---|---|
| Login | `UserService/Login` | `err=0`，返回 `basic{gid,name,level,exp,gold,open_id}`、`item_bag` |
| PlayerLogin | `UserService/PlayerLogin` | `err=0`，`global_scene_id=1` |
| AllLands | `PlantService/AllLands` | `err=0`，24 块地 |
| TaskInfo | `TaskService/TaskInfo` | `err=0`，任务与积分结构 |
| SVIP 状态 | `QQVipService/GetQQVipRewardsStatus` | `is_qq_vip=true`、`can_claim=true`、`mall_free_can_claim=true` |
| **SVIP 领奖** | `QQVipService/ClaimQQVipRewards` | **`err=0`，`rewards=array(5)`；复查 `claimed_today=true`** |
| 每日礼状态 | `QQVipService/GetDailyGiftStatus` | `can_claim=true` |
| 商城列表 | `MallService/GetMallListBySlotType(slot=1)` | `err=0`，16 个商品（`1001 每日福利` free+available） |
| **商城免费领取** | `MallService/Purchase{id:1001,buy_num:1}` | **`err=0`，`success=true`，`reward_items=array(1)`** |
| **种植** | `PlantService/Plant{items:[{seed_id:20121,land_ids:[...]}]}` | **`err=0`；24/24 地块有作物（AllLands 复查）** |
| 种子店定位 | `ShopService/ShopProfiles` | `shop 2=种子`、`shop 3=宠物`、`shop 4=装扮` |
| **商城最高级种子** | `ShopInfo(shop_id=2)` + `BuyGoods{goods_id:158,num:N}` | **132 个种子、124 个解锁；最高解锁 `item 20102`（解锁条件 148 级，价 59616）；购买 `err=0`** |
| **按商城种子重种** | `RemovePlant` + `Plant{seed_id:20102}` | **`err=0`；复查 24/24 地块** |
| 作物信息 | AllLands | 蔷薇 `id=1020121`，`grow_sec=23040`（6.4h），最后阶段 `begin_time` = 成熟时刻 |
| **每日任务领取** | `TaskService/BatchClaimTaskReward` | **`err=0`，`items=array(2)`；任务 `200019` 变为 `claimed=true`** |
| 心跳 | `UserService/Heartbeat` | `err=0`，`time_now_millis` 正常；每 25s |
| 收获（未成熟） | `PlantService/Harvest` | `1001021`（未成熟，符合预期） |

当前任务状态（farmTick 实测）：
- `101056` 19/20（未完成）
- `200019` 1/1 **已领取**
- `200020` 0/1、`200021` 0/1（待完成）

## 4. 客户端行为

`runFarmClient` 执行顺序：
1. `wx.login` 取 code；`getUserCryptoManager().getLatestUserKey()` 取 key（与真实客户端一致，仅作记录）
2. 建立 WebSocket
3. 等待 4.5s 抓取真实客户端流量并自检（`analyzeCaptures`）
4. Login → PlayerLogin → AllLands → Bag → TaskInfo → VIP 状态 → 每日礼状态
5. 领 SVIP 奖励 → 商城免费购买
6. 选择背包中可用种子（当前 `20121` 蔷薇）逐块种植
7. 复查任务并批量领奖
8. 启动定时器：25s 心跳、60s farmTick（成熟收获 → 补种 → 任务复查领奖）

> 同账号单会话：客户端登录会把游戏窗口顶下线（"账号已在其他地方登录"），这是服务端的正常行为。

## 4.5 脱离 QQ 主进程的可行性评估（2026-10-17）

目标：让客户端不再运行在 QQ 小程序里。两个依赖点分开评估。

### 4.5.1 TSDK 加密 —— 可剥离，但需要 glue 回调

- `tsdk.wasm`（161,054 字节）位于 `miniapp_src/<ver>/tsdk/tsdk.wasm`。
- 实测：用 Node `WebAssembly` **可独立实例化**（61 个导出、`__wasm_call_ctors()` 可执行、内存 1029 页）。
- 导出名被混淆，但 glue 里有明确映射（`game.js` 偏移 9,796,930 附近）：
  ```
  _create_buffer=A  _destroy_buffer=B  _get_msg_len=I  _get_msg=J
  _init_runtime=G  _get_encrypted_init_info=H  _send_to_gs=Q
  ```
- 风险：wasm 依赖 22 个导入函数（模块 `a`）。用空桩实例化后调用 `A()` 抛
  `RuntimeError: table index is out of bounds`，说明**必须有宿主 glue（函数表/回调）**才能工作。
  结论：可剥离，但需要把游戏里的 Emscripten glue（含 22 个导入实现）一并移植。

### 4.5.2 CODE —— 无法脱离 QQ 生成

- code 由 ILINK `ilinkapp_getoauthcode` 签发，鉴权依赖 QQ 登录会话（`ilink_id`/`ilink_token`/`uin`/`device_id`）。
- 已检索 QQ 数据目录：**没有找到 QQ 侧的 `tdi_account.txt` / `cloud_account.txt`**（只找到微信 `xwechat/ilink/wechat/cloud_account.txt`），说明 QQ 的 ILINK 会话很可能只在内存中。
- 用 Frida 扫描全部 `QQ.exe` 进程：主进程只加载 `wrapper.node`，未见 `ilink2.dll`（按需加载）；多数子进程拒绝注入。
- 因此要让 code 脱离 QQ，只有两条路：
  1. **重实现 QQ 登录（wtlogin）+ ILINK 鉴权**：需要 ECDH、设备签名、TGT 等，工程量极大且依赖账号密码/设备凭据；
  2. **一次性提取 ILINK 会话后在外部调用 CGI**：目前没有找到可持久化的会话文件，且会话可能很快过期。

**结论**：code 的生成无法在不依赖 QQ 的前提下完成；可行的是把"客户端"与"code 提供者"拆开——
QQ 内只保留一个极小的 code provider（现有注入即可），农场客户端本体可独立进程运行
（前提是先完成 4.5.1 的 TSDK glue 移植）。

#### 4.5.3 走"重实现登录"路线的实测结论（2026-10-17）

用户选择该路线后，逐项验证了三步：

1. **复用 QQ 登录票据（a2/d2）**
   - 找到 `%APPDATA%\Tencent\QQNTOpenSDK\1600001614\sdk_db\login.db`（5120B）与 `login.db-wal`（53,592B）。
   - 文件头是标准 SQLite 头 + 偏移 32 处的 `QQ_NT DB` 标记；`sqlite3` 直接打开报
     `file is not a database` → **页面级加密**。
   - `wrapper.node` 内含 `sqlcipher` / `cipher_page` / `db_key` / `sqlite3_key` / `login_table` 字符串，
     确认为 SQLCipher 系，密钥运行时派生。
2. **从运行进程取会话**
   - Frida 17.19 可附加主进程 `QQ.exe`（pid 21704），但 `wrapper.node` 只导出 66 个 Node 绑定，
     **没有** sqlite/login/ticket 相关导出；DB 函数是内部符号（已剥离）。
   - 扫描全部 QQ 进程：**没有任何进程加载 `ilink2.dll`**（按需加载），多数子进程拒绝注入。
3. **网络层**
   - QQ 走本机 Clash 代理（远端多为 `198.18.x.x` 假 IP），直连抓包不可行；
     ILINK 认证流量是否走 HTTPS 尚未确认。

因此该路线的最小可行子任务是：**用 IDA 分析 117MB 的 `wrapper.node`，定位 `sqlite3_key` 调用点并
Frida hook 取 DB 密钥 → 解密 `login.db` 取 a2/d2 → 复现 ILINK `autoauth` → 调 `getoauthcode`。**

#### 4.5.4 SetDBKey 定位进展（2026-10-17）

- 日志锚点字符串 `SetDBKey sqlite3_key failed is_open:{},{}` 的 VA：`0x18474e6be`。
- 用 PE 解析 + RIP 相对引用扫描（`tools/find_pe_string_ref.js`）找到 2 处代码引用：
  **`0x182bcd4b3`**、**`0x182bcd8f1`**（均为 `48 8d 05` = `lea rax,[rip+disp]`，指向该字符串）。
- 两处引用前共同的调用链：
  ```
  0x182bcd49x call 0x180028a40
  0x182bcd4a1 call 0x180775850   ; std::string 追加辅助（不是 sqlite3_key）
  0x182bcd4aa call 0x180d77da0   ; -> jmp 0x180775850（thunk）
  0x182bcd4af mov  [rsp+30], bl  ; 保存返回值
  0x182bcd4b3 lea  rax, "SetDBKey sqlite3_key failed..."
  ```
- 结论：`sqlite3_key` 的调用点位于 `SetDBKey` 更早的位置，当前只拿到函数中段的日志分支，
  **函数起点尚未确定**（`wrapper.node` 的 `.text` 中 `CC` 填充不连续，无法用简单回扫定位）。
- 下一步需要：对 `wrapper.node` 做完整自动分析（117MB，耗时较长）后取 `get_func(0x182bcd4b3).start_ea`，
  或直接在运行时对该日志分支下断点、回溯栈上的 key 指针。

## 5. 尚未完成

1. **收获**：作物成熟时间约 6.4 小时后（已实现成熟判定与自动收获补种，到点自动执行）。
2. **每日三任务全部完成**：`200020`/`200021` 进度为 0，需要对应玩法条件；`101056` 为 19/20。
3. 商城 `ShopInfo` 需要正确的 `shop_id`（当前用 0 返回 `1004001`）。
4. 免费化肥：商城 slot1 中化肥商品均为非免费；已领取的免费项为 `1001 每日福利`。

## 6. 复现步骤

```bash
node tools/build_runtime_bundle.js      # 打包客户端
node tools/m0-code-sink.js              # 启动 17841 接收端 + bundle 分发
node tools/inject_frame_boot.js         # 注入框架模板（一次性）
# 双击桌面 QQ经典农场-QQ小程序.lnk 启动农场
# 观察 artifacts/m0-code-capture.jsonl
node tools/inject_frame_boot.js --revert  # 完全还原注入
```

### 6.1 短会话模式（每天开机几分钟即可）

作物按服务端 `begin_time` 生长，离线照常成熟，所以不需要 24 小时在线；但 `dry_time`/`weeds_time`/`dry_num` 会惩罚长期缺席，真实要求是**每天上线一次**。

```powershell
# 建标记 → 运行时跑完一次巡检（收获/补种/领奖）后主动断开退出
powershell -ExecutionPolicy Bypass -File tools\farm-once.ps1
powershell -ExecutionPolicy Bypass -File tools\farm-once.ps1 -Force       # 忽略 12 小时节流
powershell -ExecutionPolicy Bypass -File tools\farm-once.ps1 -CloseQQ     # 跑完关闭 QQ
powershell -ExecutionPolicy Bypass -File tools\farm-once.ps1 -Continuous  # 回到常驻模式（清标记）
```

开关链路：`artifacts/ONEPASS` → `GET /cmd` 的 `onePass` → 注入脚本传给 `runFarmClient`。
开机自启动：`%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\qqfarm-onepass.vbs`（删除即停用）。

## 7. code 签发链原生拓扑（2026-10-17，route 2 复核）

QQ 9.9.35-52892 的小程序栈位于 `.../resources/app/wmpfsdk/`：

| 组件 | 作用 |
|---|---|
| `runtime/WeChatAppEx.exe` | 小程序宿主（Chromium shell） |
| `host/wmpf_host_export_x64.dll` | QQ 侧 host 实现，含 `IILinkAuthManager`（`ilink_auth_manager.cc`） |
| `ams_sdk/libamssdk.dll` | AMS SDK，含 `WmpfEventProcessor::OnRequestLogin`、`GetLoginParams`、`GetLoginCodeStart/Result`、`LoginResult`、`GSCacheManager` |
| `ams_sdk/ginkgo.exe` | WebView2 **扫码登录**窗口（`QRCodeWinForm`、`wxgamesdk.getGameSession`），非无头服务 |
| `runtime/ilink2.dll` | ILINK 传输与 CGI（`TdiGetOAuthCodeAsync` → `/ilink/ilinkapp/sys/ilinkapp_getoauthcode`） |

**签发链**：`wx.login` → `libamssdk` 登录事件 → `wmpf_host_export` `IILinkAuthManager` → mojo IPC `flue.mojom.ILinkProviderBridge` → QQ 主进程 → `ilink2` CGI → code。
即 **code 由 QQ 主进程签发**，与既有结论（§4.5）一致并补全了中间层。

**凭证存储**：`login.db`（QQNTOpenSDK）为 SQLCipher（自定义固定密钥，未知）+ 全加密 WAL；`ams/gs` 为 AES 加密 JSON（`CAESHelper`，256 B）；`msf/security_data` 为空；`nt_data/msf`、`remoting` 仅在 QQ 运行时填充；`%APPDATA%\QQEX\miniapp\{auth,ls}` 与小程序 `store` 为空。

**判定**：脱离 QQ 主进程自造 code 需重实现 MSF/ILINK 传输与签名 + 账号凭证 + 风控面，非本轮可及。见 GOAL.md 同日条目。

# QQ经典农场案例

QQ 经典农场（AppID `1112386029`）协议逆向与自动化实现的案例仓库：协议笔记、Node.js / C# 客户端、探针工具与实测证据。

## 目录结构

| 路径 | 内容 |
| --- | --- |
| `GOAL.md` | 项目目标与历次验收记录（最新改动与实测结论以这里为准） |
| `HANDOFF.md` | 交接说明 |
| `protocol-analysis.md` | 协议逆向主体笔记 |
| `protocol-endpoints.md` | 接口端点整理 |
| `protocol-client.md` | 客户端实现笔记 |
| `client/` | Node.js 客户端：登录、编解码、帧协议、农场工作流 |
| `test/` | Node 单元测试 |
| `tools/` | 探针与分析工具（C# 探针、Python/JS 分析脚本、构建脚本） |
| `deploy/` | Node.js 版部署脚本 |
| `deploy-csharp/` | C# 版交付：WinForms 托盘程序 + QQ 原生桥 + 协议栈 |
| `artifacts/` | 逆向过程与实测证据（报告、抓包、审计结果） |

## 运行与构建

- Node.js 部分：`npm install` 后直接运行 `client/` 下的入口脚本，测试用 `npm test`。
- C# 部分：需要 .NET 10 Windows Desktop Runtime，构建 / 出包用 `tools/build-csharp.ps1`，产物落在 `deploy-csharp/`。

## 仓库约定

- 这是一份**源码 + 文档 + 证据**仓库。依赖目录（`node_modules`、虚拟环境）、.NET 构建产物（`bin`/`obj`）、原生库、压缩包与 IDA 数据库均已由 `.gitignore` 排除，需要时按上文命令本地重建。
- 抓包与实测数据的原始大文件保留在 `artifacts/`，用于复核结论；这些数据仅反映当时本机会话，不含登录凭据。

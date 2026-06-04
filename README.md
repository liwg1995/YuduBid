# 禹都AI投标助手

禹都AI投标助手是一款面向招投标场景的本地桌面客户端，聚焦招标文件解析、技术方案生成、知识库复用、标书查重、废标项检查和 Word 导出等流程。

## 项目结构

```text
.
├── client/      # 核心桌面客户端，Electron + Vite + React + TypeScript
├── analytics/   # 独立 Cloudflare Workers 埋点服务和统计看板
├── tools/       # 独立文档解析与 MinerU 验证工具
├── sql/         # 工作区 SQLite 目标表结构说明
└── README.md
```

## Client

客户端源码位于 `client/`，根目录没有 `package.json`，所有客户端命令都在 `client/` 下执行。

```bash
cd client
npm ci
npm run build
```

开发启动：

```bash
cd client
npm run dev
```

本地打包：

```bash
cd client
npm run dist:win
npm run dist:mac
```

打包产物输出到 `client/release/`，该目录不会提交到 Git。

## Analytics

`analytics/` 是独立埋点服务，用于接收客户端上报并提供统计看板。

```bash
cd analytics/worker
npm install
npm run dev
```

```bash
cd analytics/dashboard
npm install
npm run dev
```

## Tools

`tools/` 用于放置独立文档解析、MinerU 验证、排查脚本等不直接进入客户端包体的工具。

## 发布

GitHub Actions 发布流程位于 `.github/workflows/release.yml`。推送 `v*` tag 或手动输入 `tag_name` 后，会在 `client/` 下安装依赖、同步版本号，并使用 `electron-builder` 构建 Windows/macOS 产物。

当前未接入正式代码签名，Windows/macOS 可能出现未签名应用提示。

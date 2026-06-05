<p align="center">
  <img src="./docs/images/yudubid-icon.png" alt="禹都AI投标助手图标" width="120" />
</p>

# 禹都AI投标助手

禹都AI投标助手是一款面向招投标场景的本地桌面客户端，聚焦招标文件解析、技术方案生成、知识库复用、标书查重、废标项检查和 Word 导出等流程。项目以 Electron 桌面端为核心，强调本地工作区、可恢复后台任务、模型配置可控，以及从招标文件到标书正文的连续工作流。

<p align="center">
  <img src="https://img.shields.io/badge/Electron-41-47848f.svg" alt="Electron" />
  <img src="https://img.shields.io/badge/React-19-61dafb.svg" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178c6.svg" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Vite-7-646cff.svg" alt="Vite" />
</p>

## 产品预览

### 技术方案正文生成

![正文生成](./docs/images/yudubid-content-generation.png)

技术方案模块按目录小节生成正文，生成进度、章节状态和字数会持续展示。后台任务会写入本地工作区，页面切换不会中断已经启动的生成流程。

### 模型与解析配置

![文本模型配置](./docs/images/yudubid-text-model.png)

文本模型支持 OpenAI-like 接口配置，可设置服务商、Base URL、API Key 和模型名称，并提供模型拉取与测试能力。

![生图模型配置](./docs/images/yudubid-image-model.png)

生图模型用于正文生成过程中的自动配图能力，支持独立的 OpenAI-like 生图接口配置，方便把文本生成和图像生成拆分到不同服务。

![文件解析配置](./docs/images/yudubid-file-parse.png)

文件解析支持本地解析、MinerU 精准解析 API 和 MinerU-Agent 轻量解析 API。默认优先使用本地解析，复杂扫描件或高质量解析场景可切换到 MinerU。

## 核心能力

- 招标文件导入与 Markdown 化展示
- 技术方案目录生成、正文生成和持续编辑
- 企业知识库资料沉淀、复用和匹配
- 标书查重与重复表达检测
- 废标项检查与响应完整性检查
- 技能管理与 Word 导出排版优化能力
- 文本模型、生图模型和文件解析方式独立配置
- Mermaid、图片、表格等 Markdown 内容导出为 Word
- Electron 本地工作区存储，流程状态可恢复

## 版本更新

### V0.1.2

本版本重点优化客户端界面体验和发布产物管理，围绕主题风格、侧边栏操作、应用图标与构建目录做了整理。

- 新增页面风格切换入口，当前提供 `经典` 与 `柔光` 两种风格，右上角可快速切换。
- 暂时隐藏暗黑风格入口，避免未完成的暗黑适配影响正式使用体验。
- 优化柔光风格下按钮、工具栏和主题切换器的显示，修复柔光按钮右侧漏色问题。
- 左侧菜单栏支持折叠，折叠后仅显示图标，释放更多工作区空间。
- 优化窗口左上角品牌图标容器，图标四周改为圆角并适配不同主题视觉。
- Windows 和 macOS 应用图标统一使用圆角图标资源。
- 本地构建产物按 `Windows/<version>/` 与 `macOS/<version>/` 目录归档，便于区分平台和版本。

### V0.1.1

本版本重点优化标书正文生成后的 Word 导出体验，新增并完善 `word-optimization` 技能。该技能默认不开启，用户可在技能管理中按需启用，用于对导出的 Word 文档进行投标文件常用排版处理。

- 表题注支持结合上文自动提炼短名称，例如生成 `表 1 网络区域参数表`，并使用 Word `SEQ` 域保持编号可更新。
- 图题注、表题注支持自动编号更新，减少后续增删图表后的手动维护成本。
- 正文段落统一两端对齐、宋体小四、黑色、首行缩进 2 字符、固定 28 磅行距。
- 编号或符号类正文段落统一左缩进 2 字符、悬挂缩进 2 字符。
- 表格外框、内框、表头、表内容、段落缩进、固定行距、水平居中和垂直居中规则进一步统一。
- 图片导出时限制在页边距内，避免大图占满整页后溢出。

### V0.1.0

首个公开定版版本，完成桌面客户端基础能力、项目品牌化、图标替换、本地开发配置、Windows/macOS 本地打包和 GitHub Release 发布流程。

## 项目结构

```text
.
├── client/      # 核心桌面客户端，Electron + Vite + React + TypeScript
├── analytics/   # 独立 Cloudflare Workers 埋点服务和统计看板
├── tools/       # 独立文档解析与 MinerU 验证工具
├── docs/        # README 图片等项目文档资源
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

打包产物输出到 `client/release/`。本地构建后可按平台和版本归档为 `client/release/Windows/<version>/` 与 `client/release/macOS/<version>/`，该目录不会提交到 Git。

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

GitHub Actions 发布流程位于 `.github/workflows/release.yml`。推送 `v*` 或 `V*` tag 后，会在 `client/` 下安装依赖、同步版本号，并使用 `electron-builder` 构建 Windows/macOS 产物。

当前版本为 `V0.1.2`：

[https://github.com/liwg1995/YuduBid/releases/tag/V0.1.2](https://github.com/liwg1995/YuduBid/releases/tag/V0.1.2)

当前未接入正式代码签名，Windows/macOS 可能出现未签名应用提示。

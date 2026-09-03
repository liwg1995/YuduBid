# YuduAssistant 插件宿主设计

## 关联项目

- YuduBid：`/Users/liwugang/codes/OpenBidKit_Yibiao`
- YuduAssistant：`/Users/liwugang/codes/YuduAssistant`
- YuduAssistant 私有远程：`https://github.com/liwg1995/YuduAssistant.git`
- 插件侧详细约束：`/Users/liwugang/codes/YuduAssistant/docs/YUDUBID_INTEGRATION.md`

## 当前范围

第一阶段只提供本地 `.yudu-plugin` 导入、Manifest/路径校验、默认禁用、启用、禁用、卸载、独立进程握手、插件状态事件和全局 Assistant 悬浮入口。

Assistant 不占用左侧业务导航。插件启用后，宿主在主工作区右下角显示悬浮图标，点击后展开非模态小型对话面板；插件停用或卸载后入口立即隐藏。面板支持真实聊天、上下文快捷操作和安全页面导航。技术方案、标书查重和废标项检查页面可直接查询宿主提供的脱敏进度摘要，并获得不修改业务状态的确定性下一步建议。

助手正文使用宿主已有的安全 Markdown Renderer，禁用原始 HTML；结构化消息可携带受控的进度或项目选择数据，由宿主显示语义化进度条与项目按钮。文本正文始终保留为降级内容，展示数据随插件私有会话恢复，不进入业务 Store。

当前仅开放文档中列明的最小业务 Capability，不修改现有 Service、Store、任务锁或业务 IPC。插件未安装或被禁用时，现有产品行为保持不变。

## 首个对话 Capability

首个开放能力为 `ai.chat`，权限名同为 `ai.chat`。它只接收受限的文本消息数组，并通过现有 `aiService.chat()` 使用宿主已配置的文本模型。返回值只包含助手文本，不返回 Base URL、模型配置或 API Key，也不读写任何业务 Store。

Renderer 不能直接调用 Host Protocol。悬浮面板通过受控的 `plugins.request` bridge 向插件 Main 发送已注册 UI method，插件 Main 再通过 `capability.invoke` 调用 `ai.chat`。未注册 UI method、未声明权限和未注册 Capability 均由对应层拒绝。

## 当前页面上下文

宿主 Renderer 可以随 `chat` UI method 发送当前导航项的安全快照，只允许包含 `sectionId`、菜单标题和菜单说明。该快照由现有菜单配置生成，不进入 Electron Main 的业务 Store，也不包含项目正文、文件路径、任务状态或用户配置。页面切换后清空旧对话，避免跨模块上下文混用。

## 技术方案摘要 Capability

`bid.technical-plan.projects.list` 只返回指定工作流的项目 ID、名称和活动标记。插件没有已验证选择时必须显示项目选择器，不能默认活动项目或列表第一项。`bid.technical-plan.summary.read` 必须携带项目 ID，Host 验证项目属于对应工作流后才读取状态并裁剪为只读摘要。返回项目名称、当前步骤、文档是否导入、任务状态和章节完成计数；不返回分析正文、目录标题、章节正文、全局事实内容、文件路径或哈希。

`bid.technical-plan.project.create` 只响应技术方案或已有方案扩写页面中的明确创建命令，并复用既有 Store Router。宿主创建成功后发送 `workspace-changed`，Renderer 只重载目标工作流页面；插件随后选择新项目并使用独立会话。Host 成功前插件不得回复创建完成。

`bid.duplicate-check.summary.read` 与 `bid.rejection-check.summary.read` 分别读取既有查重和废标检查 Store，并只返回文件准备标志、任务状态、进度与完成/发现数量。两者均不返回文件名、路径、正文、命中内容、废标条款、检查发现详情、图片哈希、签名、错误或自定义检查内容；Capability 只读，不触发业务任务。

`bid.feasibility-report.summary.read` 读取当前可研项目并裁剪为资料数量、阶段状态、任务进度和叶子章节完成数。它不返回项目 ID、资料标识、文件名、路径、分析底稿、关键参数正文、目录内容、章节正文、日志、错误或哈希，也不触发项目切换和生成任务。

## 安全页面导航

`navigation.open` 允许首页、设置，以及招投标模块中的技术方案、已有方案扩写、可研报告、模板管理、知识库、标书查重、废标项检查和投标机会。Host Main 校验固定 allowlist 后发送 `navigation-requested` 插件事件，Renderer 再通过现有页面可见性规则切换页面。该能力不修改项目选择、技术方案步骤、Store 或任务状态。

## 插件私有存储

`storage.get`、`storage.set` 和 `storage.delete` 共用 `storage.local` 权限。Host 仅在 `userData/plugins-data/<plugin-id>/storage.json` 中保存可序列化 JSON，键不会参与路径拼接。单值限制 256KB、总文件限制 1MB，并使用临时文件原子替换。该能力不允许插件传入路径、读取其他插件数据、访问业务 Store 或用户配置。

## 目录与数据

```text
userData/plugins/<plugin-id>/<version>/
userData/plugins/registry.json
userData/plugins-data/<plugin-id>/
```

卸载使用系统废纸篓；默认保留插件数据，只有用户明确选择时才移除数据目录。

## 安全边界

- 插件不能加载进 Electron Main。
- 插件使用独立子进程和 JSON 消息协议。
- 子进程不接收宿主完整环境变量。
- Host API 采用 allowlist；未注册方法拒绝。
- 插件包限制文件数量和解压总大小，拒绝绝对路径、目录穿越、重复路径和符号链接。
- 第一阶段仅面向可信的私有 YuduAssistant 插件；独立子进程不等价于第三方恶意代码的 OS 安全沙箱。

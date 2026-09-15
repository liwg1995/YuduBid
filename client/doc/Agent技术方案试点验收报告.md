# Agent 技术方案试点验收报告

## 验收结论

技术方案 Agent 试点完成基础架构、只读影子运行、安全准入、不可执行草稿和内存审批包验证，现冻结为 `frozen-read-only`。

- 不替换现有技术方案页面、IPC、Store 或任务 Service。
- 不开放批准入口，不开放 Agent 业务执行入口。
- Main 继续强制 `experimentalWritesEnabled: false`。
- 默认配置关闭；只有开发者模式与隐藏 Agent 基础开关同时开启后，开发者测试页才可使用试点能力。
- 当前验收不代表允许上线 Agent 自动执行。

## 已验收范围

1. Tool Registry、Agent Registry、Runtime 和 Host 契约。
2. 技术方案项目、工作区、活动任务、知识库的结构化只读 Tool。
3. dry-run、真实项目影子运行、偏差分类和一致率统计。
4. 安全准入门：20 个有效样本、95% 一致率、2% 最大失败率、高风险偏差为 0。
5. 目录生成影响预览，但不启动目录任务。
6. 不可批准、不可执行的审批草稿及过期、撤销、漂移状态。
7. 草稿完整性校验、异常隔离和状态事件哈希链。
8. 策略快照、内存审批包和二次校验器。

## Renderer 可见 Agent IPC

当前共 12 个：

1. `agent:get-status`
2. `agent:run-dry`
3. `agent:run-shadow`
4. `agent:get-shadow-report`
5. `agent:preview-outline-generation`
6. `agent:create-approval-draft`
7. `agent:list-approval-drafts`
8. `agent:revoke-approval-draft`
9. `agent:get-approval-draft-integrity`
10. `agent:get-approval-draft-audit-log`
11. `agent:preview-approval-package`
12. `agent:validate-approval-package`

不存在 `agent:approve`、`agent:execute`、`agent:start` 或同等业务执行桥接。

## 数据隔离

Agent 数据位于 Electron `userData/workspace/agent-runs/`，不写入现有业务权威 Store：

- `runs.json`：dry-run 和影子运行记录。
- `approvals.json`：底层审批服务验证数据；生产 IPC 不开放。
- `approval-drafts.json`：不可执行草稿。
- `approval-drafts-quarantine.json`：完整性失败的最小隔离记录。
- `approval-draft-events.json`：草稿状态事件哈希链。

技术方案正文权威来源仍是原有 `outlineData.outline[*].content`，Agent 文件不参与正文展示、编辑或导出。

## 关闭与回滚

最小关闭方式：

1. 将 `user_config.json` 中 `agent_settings.enabled` 设为 `false`，或关闭开发者模式。
2. 重启客户端。
3. Host 将返回关闭状态，不注册 Agent Tool，不创建新的 Agent 数据。

已有 Agent 审计文件可原样保留，不会被业务流程读取。无需删除文件，也不要删除现有技术方案工作区。

如需代码级回滚，应按 Renderer bridge → Agent IPC → Main Host 初始化 → `electron/agents/` 的逆向顺序移除；`taskService.peekActiveTasks()` 和 `getAgentRunsDir()` 是加法接口，保留也不会改变旧流程。

## 已验证命令

- `node --check`：所有新增或修改的 Electron CJS 文件。
- `npm run verify:agent-foundation`
- `npm run verify:ipc-contract`
- `npm run verify:offline`
- `npm run build`
- `git diff --check`

## 冻结边界与后续复用

本试点到此停止增加安全外壳。后续领域 Agent 只复用 Registry、Runtime、只读 Tool、影子运行、准入和预览模式；每个领域必须单独定义权威 Store、恢复语义和回归样本。

任何真实写入必须作为新的明确阶段，经人工确认后才能开发；不得仅因为准入结果为 `eligible` 就启用现有实验写 Tool。

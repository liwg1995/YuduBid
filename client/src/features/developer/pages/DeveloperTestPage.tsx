import { useEffect, useState } from 'react';
import { aiClient } from '../../../shared/ai/aiClient';
import type { AgentActionPreview, AgentApprovalDraft, AgentApprovalDraftAuditLog, AgentApprovalDraftIntegrity, AgentApprovalPackagePreview, AgentApprovalPackageValidation, AgentHostStatus, AgentRunResult, AgentShadowReport } from '../../../shared/types/ipc';
import { useToast } from '../../../shared/ui/ToastProvider';
import { getBidAnalysisTasks } from '../../technical-plan/services/bidAnalysisWorkflow';
import { requestOutlineGeneration } from '../../technical-plan/services/outlineWorkflow';

type RunningMode = 'text' | 'json' | null;
type AgentWorkflowKind = 'technical-plan' | 'existing-plan-expansion' | 'presales' | 'official-document' | 'grant-application' | 'project-management' | 'thesis-tutor' | 'software-copyright' | 'patent-generation';
const projectlessAgentWorkflows = new Set<AgentWorkflowKind>(['official-document', 'grant-application', 'thesis-tutor', 'software-copyright']);

const sampleTenderContent = `# 禹都AI解决方案助手测试项目招标文件

项目名称：禹都AI解决方案助手测试项目。
项目编号：YB-TEST-001。
项目类型：软件服务。
项目预算：100 万元。
项目地址：北京市海淀区。

技术评分要求：
1. 技术方案完整性，满分 30 分，要求章节完整、实施路径清晰。
2. 项目实施计划，满分 20 分，要求进度安排合理、风险控制明确。
3. 运维服务能力，满分 15 分，要求说明响应时效和服务保障。`;

const sampleOutlineInput = {
  overview: '禹都AI解决方案助手测试项目，软件服务类采购，预算 100 万元，实施地点北京市海淀区。',
  requirements: '技术方案完整性 30 分；项目实施计划 20 分；运维服务能力 15 分。',
  mode: 'free' as const,
};

const textTask = getBidAnalysisTasks('full').find((task) => task.id === 'projectInfo');

const textSystemPrompt = `你是专业的招标文件分析助手。请严格基于用户提供的招标文件原文完成提取和总结。

通用要求：
1. 保持信息全面、准确，尽量使用原文内容，不要自行编造。
2. 如果原文没有提及，明确写“没有提及”或“原文未提及”。
3. 只输出最终结果，不输出过程、提示语或客套话。
4. 始终使用简体中文。`;

function DeveloperTestPage() {
  const { showToast } = useToast();
  const [runningMode, setRunningMode] = useState<RunningMode>(null);
  const [events, setEvents] = useState<string[]>([]);
  const [content, setContent] = useState('');
  const [result, setResult] = useState('');
  const [agentStatus, setAgentStatus] = useState<AgentHostStatus | null>(null);
  const [agentStatusLoading, setAgentStatusLoading] = useState(true);
  const [agentRunning, setAgentRunning] = useState(false);
  const [agentGoal, setAgentGoal] = useState('分析当前技术方案进度并建议下一步');
  const [agentProjectId, setAgentProjectId] = useState('');
  const [agentWorkflowKind, setAgentWorkflowKind] = useState<AgentWorkflowKind>('technical-plan');
  const [agentResult, setAgentResult] = useState<AgentRunResult | null>(null);
  const [shadowReport, setShadowReport] = useState<AgentShadowReport | null>(null);
  const [actionPreview, setActionPreview] = useState<AgentActionPreview | null>(null);
  const [approvalDrafts, setApprovalDrafts] = useState<AgentApprovalDraft[]>([]);
  const [draftIntegrity, setDraftIntegrity] = useState<AgentApprovalDraftIntegrity | null>(null);
  const [draftAuditLog, setDraftAuditLog] = useState<AgentApprovalDraftAuditLog | null>(null);
  const [approvalPackage, setApprovalPackage] = useState<AgentApprovalPackagePreview | null>(null);
  const [packageValidation, setPackageValidation] = useState<AgentApprovalPackageValidation | null>(null);

  const refreshAgentStatus = async () => {
    setAgentStatusLoading(true);
    try {
      const bridge = window.yibiao;
      if (!bridge) throw new Error('当前环境未连接 Electron 桥接');
      const nextStatus = await bridge.agent.getStatus();
      setAgentStatus(nextStatus);
      setShadowReport(nextStatus.enabled ? await bridge.agent.getShadowReport({ limit: 8 }) : null);
      setApprovalDrafts(nextStatus.enabled ? await bridge.agent.listApprovalDrafts({ limit: 8 }) : []);
      setDraftIntegrity(nextStatus.enabled ? await bridge.agent.getApprovalDraftIntegrity({ limit: 8 }) : null);
      setDraftAuditLog(nextStatus.enabled ? await bridge.agent.getApprovalDraftAuditLog({ limit: 8 }) : null);
    } catch (error) {
      setAgentStatus(null);
      showToast(error instanceof Error ? error.message : '读取 Agent 状态失败', 'error');
    } finally {
      setAgentStatusLoading(false);
    }
  };

  useEffect(() => {
    void refreshAgentStatus();
  }, []);

  const appendEvent = (message: string) => {
    setEvents((prev) => [...prev, `[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${message}`]);
  };

  const resetOutput = () => {
    setEvents([]);
    setContent('');
    setResult('');
  };

  const runTextTest = async () => {
    if (!textTask) {
      appendEvent('未找到项目中的 JSON 招标文件解析任务。');
      return;
    }

    resetOutput();
    setRunningMode('text');
    appendEvent(`调用通用 AI 文本请求：aiClient.chat(${textTask.label})。`);

    try {
      const nextContent = await aiClient.chat({
        messages: [
          { role: 'system', content: textSystemPrompt },
          { role: 'user', content: `以下是完整招标文件 Markdown 原文。后续任务必须仅基于这份原文完成：\n\n${sampleTenderContent}` },
          { role: 'user', content: textTask.buildTaskPrompt() },
        ],
        temperature: 0.1,
        response_format: textTask.output === 'json' ? { type: 'json_object' } : undefined,
        logTitle: `开发者测试-${textTask.label}`,
      });
      setContent(nextContent);
      appendEvent('文本请求完成。');
    } catch (error) {
      appendEvent(`文本请求错误：${error instanceof Error ? error.message : 'AI 文本请求失败'}`);
    } finally {
      setRunningMode(null);
    }
  };

  const runJsonTest = async () => {
    resetOutput();
    setRunningMode('json');
    appendEvent('调用项目真实 JSON 请求：requestOutlineGeneration。');

    try {
      const outline = await requestOutlineGeneration({
        ...sampleOutlineInput,
        onProgress: appendEvent,
      });
      setResult(JSON.stringify(outline, null, 2));
      appendEvent('JSON 请求完成。');
    } catch (error) {
      appendEvent(`JSON 请求错误：${error instanceof Error ? error.message : 'AI JSON 请求失败'}`);
    } finally {
      setRunningMode(null);
    }
  };

  const runAgentReadOnly = async (mode: 'dry-run' | 'shadow') => {
    const goal = agentGoal.trim();
    if (!goal) {
      showToast('请输入 Agent 诊断目标', 'info');
      return;
    }
    if (mode === 'shadow' && !projectlessAgentWorkflows.has(agentWorkflowKind) && !agentProjectId.trim()) {
      showToast('影子运行需要填写项目 ID', 'info');
      return;
    }
    setAgentRunning(true);
    setAgentResult(null);
    try {
      const bridge = window.yibiao;
      if (!bridge) throw new Error('当前环境未连接 Electron 桥接');
      const input = {
        goal,
        context: {
          workflowKind: agentWorkflowKind,
          ...(agentProjectId.trim() ? { projectId: agentProjectId.trim() } : {}),
        },
      };
      const nextResult = mode === 'shadow'
        ? await bridge.agent.runShadow(input)
        : await bridge.agent.runDry(input);
      setAgentResult(nextResult);
      if (mode === 'shadow') setShadowReport(await bridge.agent.getShadowReport({ limit: 8, workflowKind: agentWorkflowKind }));
      showToast(mode === 'shadow' ? 'Agent 影子运行完成' : 'Agent 只读诊断完成', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Agent 只读诊断失败', 'error');
    } finally {
      setAgentRunning(false);
    }
  };

  const previewAgentAction = async () => {
    if (!['technical-plan', 'existing-plan-expansion'].includes(agentWorkflowKind)) {
      showToast('当前工作流仅支持只读诊断和影子对照', 'info');
      return;
    }
    if (!agentProjectId.trim()) {
      showToast('执行预览需要填写项目 ID', 'info');
      return;
    }
    setAgentRunning(true);
    setActionPreview(null);
    try {
      const bridge = window.yibiao;
      if (!bridge) throw new Error('当前环境未连接 Electron 桥接');
      const preview = await bridge.agent.previewOutlineGeneration({
        workflowKind: agentWorkflowKind as 'technical-plan' | 'existing-plan-expansion',
        projectId: agentProjectId.trim(),
        mode: 'aligned',
      });
      setActionPreview(preview);
      setApprovalDrafts(await bridge.agent.listApprovalDrafts({ limit: 8 }));
      setDraftAuditLog(await bridge.agent.getApprovalDraftAuditLog({ limit: 8 }));
      showToast(preview.draftDrift?.staleCount ? `已生成预览，并标记 ${preview.draftDrift.staleCount} 条过时草稿` : '已生成只读执行预览，未创建审批或任务', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '生成执行预览失败', 'error');
    } finally {
      setAgentRunning(false);
    }
  };

  const createApprovalDraft = async () => {
    if (!['technical-plan', 'existing-plan-expansion'].includes(agentWorkflowKind)) {
      showToast('当前工作流不创建审批草稿', 'info');
      return;
    }
    if (!agentProjectId.trim()) return;
    setAgentRunning(true);
    try {
      const bridge = window.yibiao;
      if (!bridge) throw new Error('当前环境未连接 Electron 桥接');
      await bridge.agent.createOutlineApprovalDraft({
        args: { workflowKind: agentWorkflowKind as 'technical-plan' | 'existing-plan-expansion', projectId: agentProjectId.trim(), mode: 'aligned' },
      });
      setApprovalDrafts(await bridge.agent.listApprovalDrafts({ limit: 8 }));
      setDraftIntegrity(await bridge.agent.getApprovalDraftIntegrity({ limit: 8 }));
      setDraftAuditLog(await bridge.agent.getApprovalDraftAuditLog({ limit: 8 }));
      showToast('审批草稿已保存，但不可批准或执行', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '创建审批草稿失败', 'error');
    } finally {
      setAgentRunning(false);
    }
  };

  const revokeApprovalDraft = async (draftId: string) => {
    try {
      const bridge = window.yibiao;
      if (!bridge) throw new Error('当前环境未连接 Electron 桥接');
      await bridge.agent.revokeApprovalDraft(draftId);
      setApprovalDrafts(await bridge.agent.listApprovalDrafts({ limit: 8 }));
      setDraftIntegrity(await bridge.agent.getApprovalDraftIntegrity({ limit: 8 }));
      setDraftAuditLog(await bridge.agent.getApprovalDraftAuditLog({ limit: 8 }));
      showToast('审批草稿已撤销', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '撤销审批草稿失败', 'error');
    }
  };

  const previewApprovalPackage = async (draftId: string) => {
    try {
      const bridge = window.yibiao;
      if (!bridge) throw new Error('当前环境未连接 Electron 桥接');
      setApprovalPackage(await bridge.agent.previewApprovalPackage(draftId));
      setPackageValidation(null);
      showToast('审批包仅在内存中生成，未创建文件', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '生成审批包预览失败', 'error');
    }
  };

  const validateApprovalPackage = async () => {
    if (!approvalPackage) return;
    try {
      const bridge = window.yibiao;
      if (!bridge) throw new Error('当前环境未连接 Electron 桥接');
      const validation = await bridge.agent.validateApprovalPackage(approvalPackage);
      setPackageValidation(validation);
      showToast(validation.valid ? '审批包二次校验通过' : '审批包校验未通过', validation.valid ? 'success' : 'error');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '审批包校验失败', 'error');
    }
  };

  const running = runningMode !== null;

  return (
    <div className="page-stack developer-test-page">
      <section className="panel developer-test-hero">
        <div className="hero-copy">
          <span className="eyebrow">Developer Reproduction</span>
          <h2>测试页</h2>
          <p>
            这里复用项目真实业务请求来复现 response_format 兼容问题：文本按钮使用招标文件解析任务，JSON 按钮使用目录生成任务。
          </p>
          <div className="developer-test-actions">
            <button type="button" className="primary-action" onClick={runTextTest} disabled={running || !textTask}>
              {runningMode === 'text' ? '文本请求中...' : '测试文本请求'}
            </button>
            <button type="button" className="primary-action" onClick={runJsonTest} disabled={running}>
              {runningMode === 'json' ? 'JSON 请求中...' : '测试 JSON 请求'}
            </button>
          </div>
        </div>
      </section>

      <div className="developer-test-grid">
        <section className="panel developer-test-panel is-wide developer-agent-diagnostic">
          <div className="settings-section-title">
            <span />
            <strong>Agent 只读诊断</strong>
          </div>
          <div className="developer-agent-status">
            <span className={`developer-agent-status-pill ${agentStatus?.enabled ? 'is-enabled' : ''}`}>
              {agentStatusLoading ? '正在读取状态' : agentStatus?.enabled ? '只读 Agent 已启用' : 'Agent 未启用'}
            </span>
            <small>仅执行摘要读取，不提供审批或写操作。</small>
            <button type="button" className="secondary-action" onClick={() => void refreshAgentStatus()} disabled={agentStatusLoading || agentRunning}>刷新状态</button>
          </div>
          <div className="developer-agent-form">
            <label>
              <span>工作流</span>
              <select value={agentWorkflowKind} onChange={(event) => setAgentWorkflowKind(event.target.value as typeof agentWorkflowKind)} disabled={agentRunning}>
                <option value="technical-plan">技术方案</option>
                <option value="existing-plan-expansion">已有方案扩写</option>
                <option value="presales">售前工作台</option>
                <option value="official-document">公文写作</option>
                <option value="grant-application">课题申报</option>
                <option value="project-management">项目协作</option>
                <option value="thesis-tutor">论文导师</option>
                <option value="software-copyright">软件著作</option>
                <option value="patent-generation">专利生成</option>
              </select>
            </label>
            <label>
              <span>项目 ID（可选）</span>
              <input value={agentProjectId} onChange={(event) => setAgentProjectId(event.target.value)} placeholder="留空时仅检查项目列表" disabled={agentRunning} />
            </label>
            <label className="is-wide">
              <span>诊断目标</span>
              <textarea value={agentGoal} onChange={(event) => setAgentGoal(event.target.value)} rows={3} maxLength={4000} disabled={agentRunning} />
            </label>
          </div>
          <div className="developer-test-actions">
            <button type="button" className="primary-action" onClick={() => void runAgentReadOnly('dry-run')} disabled={!agentStatus?.enabled || agentRunning || agentStatusLoading}>
              {agentRunning ? '诊断中...' : '运行只读诊断'}
            </button>
            <button type="button" className="secondary-action" onClick={() => void runAgentReadOnly('shadow')} disabled={!agentStatus?.enabled || agentRunning || agentStatusLoading || (!projectlessAgentWorkflows.has(agentWorkflowKind) && !agentProjectId.trim())}>
              运行影子对照
            </button>
            <button type="button" className="secondary-action" onClick={() => void previewAgentAction()} disabled={!agentStatus?.enabled || agentRunning || agentStatusLoading || !agentProjectId.trim() || !['technical-plan', 'existing-plan-expansion'].includes(agentWorkflowKind)}>
              预览目录生成影响
            </button>
            <button type="button" className="secondary-action" onClick={() => void createApprovalDraft()} disabled={!agentStatus?.enabled || agentRunning || agentStatusLoading || !agentProjectId.trim() || !['technical-plan', 'existing-plan-expansion'].includes(agentWorkflowKind)}>
              保存不可执行草稿
            </button>
          </div>
          <pre>{agentResult ? JSON.stringify(agentResult, null, 2) : agentStatus?.enabled ? '尚未运行诊断。' : '需要同时启用开发者模式和隐藏 Agent 基础开关，并重启客户端。'}</pre>
          {actionPreview && <pre>{JSON.stringify(actionPreview, null, 2)}</pre>}
          {approvalDrafts.length > 0 && (
            <div className="developer-agent-history">
              {approvalDrafts.map((draft) => (
                <div className="developer-agent-history-row" key={draft.draftId}>
                  <span className={`developer-agent-history-state ${draft.status === 'active' ? '' : 'is-mismatch'}`}>{draft.status}</span>
                  <span>{draft.parameters.projectId}</span>
                  <span>{draft.summary}{draft.policySnapshot ? ` · ${draft.policySnapshot.version} · Tool ${draft.policySnapshot.toolContract.version}` : ' · 历史草稿无策略快照'}</span>
                  <div className="developer-agent-draft-actions">
                    <button type="button" className="secondary-action" onClick={() => void previewApprovalPackage(draft.draftId)}>查看审批包</button>
                    {['active', 'blocked'].includes(draft.status)
                      ? <button type="button" className="secondary-action" onClick={() => void revokeApprovalDraft(draft.draftId)}>撤销草稿</button>
                      : <time>{new Date(draft.expiresAt).toLocaleString('zh-CN', { hour12: false })}</time>}
                  </div>
                </div>
              ))}
            </div>
          )}
          {approvalPackage && (
            <>
              <div className="developer-test-actions">
                <button type="button" className="secondary-action" onClick={() => void validateApprovalPackage()}>二次校验审批包</button>
              </div>
              <pre>{JSON.stringify(approvalPackage, null, 2)}</pre>
            </>
          )}
          {packageValidation && <pre>{JSON.stringify(packageValidation, null, 2)}</pre>}
          {draftIntegrity && (
            <small className={draftIntegrity.quarantinedCount ? 'developer-agent-integrity is-warning' : 'developer-agent-integrity'}>
              草稿完整性 v{draftIntegrity.integrityVersion} · 已隔离 {draftIntegrity.quarantinedCount} 条异常记录
            </small>
          )}
          {draftAuditLog && (
            <div className="developer-agent-audit">
              <small className={draftAuditLog.chainValid ? '' : 'is-warning'}>
                草稿事件 {draftAuditLog.total} 条 · 哈希链{draftAuditLog.chainValid ? '完整' : '异常'}
              </small>
              {draftAuditLog.recent.slice(0, 5).map((event) => (
                <span key={event.eventId}>{event.type} · {event.draftId.slice(0, 8)} · {event.fromStatus || '—'} → {event.toStatus || '—'}</span>
              ))}
            </div>
          )}
          {shadowReport && (
            <div className="developer-agent-report">
              <div className="developer-agent-metrics">
                <span><strong>{shadowReport.total}</strong>影子运行</span>
                <span><strong>{shadowReport.alignmentRate === null ? '—' : `${shadowReport.alignmentRate}%`}</strong>决策一致率</span>
                <span><strong>{shadowReport.mismatched}</strong>待复核偏差</span>
                <span><strong>{shadowReport.failed}</strong>失败</span>
              </div>
              {shadowReport.mismatchReasons.length > 0 && (
                <div className="developer-agent-reasons">
                  <strong>偏差原因</strong>
                  {shadowReport.mismatchReasons.map((reason) => (
                    <span key={reason.code}>{reason.label} · {reason.count}</span>
                  ))}
                </div>
              )}
              <div className={`developer-agent-admission is-${shadowReport.admission.status}`}>
                <div>
                  <strong>
                    {shadowReport.admission.status === 'eligible'
                      ? '达到人工确认试点门槛'
                      : shadowReport.admission.status === 'blocked'
                        ? '安全准入未通过'
                        : '安全准入样本不足'}
                  </strong>
                  <small>{shadowReport.admission.note}</small>
                </div>
                <div className="developer-agent-admission-checks">
                  {shadowReport.admission.checks.map((check) => (
                    <span className={check.passed ? 'is-passed' : ''} key={check.id}>
                      {check.label}：{check.actual === null ? '—' : `${check.actual}${check.unit || ''}`}（要求 {check.required}）
                    </span>
                  ))}
                </div>
              </div>
              <div className="developer-agent-history">
                {shadowReport.recent.length ? shadowReport.recent.map((item) => (
                  <div className="developer-agent-history-row" key={item.runId}>
                    <span className={`developer-agent-history-state ${item.aligned === false ? 'is-mismatch' : item.status === 'error' ? 'is-error' : ''}`}>
                      {item.status === 'error' ? '失败' : item.aligned ? '一致' : '偏差'}
                    </span>
                    <span>{item.projectId || '未知项目'}</span>
                    <span title={item.note}>{item.legacyAction || '—'} → {item.agentAction || '—'}{item.reasonLabel ? ` · ${item.reasonLabel}` : ''}</span>
                    <time>{item.startedAt ? new Date(item.startedAt).toLocaleString('zh-CN', { hour12: false }) : '—'}</time>
                  </div>
                )) : <small>暂无影子运行记录。</small>}
              </div>
            </div>
          )}
        </section>

        <section className="panel developer-test-panel">
          <div className="settings-section-title">
            <span />
            <strong>文本复用入口</strong>
          </div>
          <pre>{JSON.stringify({ service: 'aiClient.chat', task: textTask?.id, sample: sampleTenderContent }, null, 2)}</pre>
        </section>

        <section className="panel developer-test-panel">
          <div className="settings-section-title">
            <span />
            <strong>JSON 复用入口</strong>
          </div>
          <pre>{JSON.stringify({ service: 'requestOutlineGeneration', input: sampleOutlineInput }, null, 2)}</pre>
        </section>

        <section className="panel developer-test-panel is-wide">
          <div className="settings-section-title">
            <span />
            <strong>事件日志</strong>
          </div>
          <pre>{events.length ? events.join('\n') : '尚未开始请求。'}</pre>
        </section>

        <section className="panel developer-test-panel is-wide">
          <div className="settings-section-title">
            <span />
            <strong>返回内容</strong>
          </div>
          <pre>{content || result || '暂无内容。'}</pre>
        </section>
      </div>
    </div>
  );
}

export default DeveloperTestPage;

import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useMemo, useState } from 'react';
import type { SectionId } from '../../../shared/types/navigation';
import { MarkdownRenderer } from '../../../shared/ui';
import { useToast } from '../../../shared/ui/ToastProvider';
import type { ProjectManagementProjectRecord, ProjectManagementState } from '../types';
import '../projectManagement.css';

interface ProjectHistoryPageProps {
  onNavigate: (section: SectionId) => void;
}

const projectManagementOpenWorkbenchKey = 'project-management-open-workbench';

interface StageMeta {
  id: string;
  label: string;
  title: string;
  resultKey: keyof Pick<
    ProjectManagementState,
    'planningResult'
    | 'discoveryResult'
    | 'executionResult'
    | 'riskResult'
    | 'stakeholderResult'
    | 'deliveryResult'
    | 'reportingResult'
    | 'commercialResult'
    | 'retrospectiveResult'
    | 'complianceResult'
  >;
}

const stageMetas: StageMeta[] = [
  { id: 'planning', label: '启动与规划', title: '项目启动与规划方案', resultKey: 'planningResult' },
  { id: 'discovery', label: '需求与 PRD', title: '需求分析与 PRD 框架', resultKey: 'discoveryResult' },
  { id: 'execution', label: '排期与推进', title: '排期与推进计划', resultKey: 'executionResult' },
  { id: 'risk', label: '风险问题', title: '风险与问题应对方案', resultKey: 'riskResult' },
  { id: 'stakeholder', label: '沟通变更', title: '沟通与变更管理方案', resultKey: 'stakeholderResult' },
  { id: 'delivery', label: '交付上线', title: '交付上线与验收方案', resultKey: 'deliveryResult' },
  { id: 'reporting', label: '汇报周月报', title: '项目汇报材料', resultKey: 'reportingResult' },
  { id: 'commercial', label: '商务回款', title: '商务回款与续约跟进方案', resultKey: 'commercialResult' },
  { id: 'retrospective', label: '复盘沉淀', title: '项目复盘与沉淀报告', resultKey: 'retrospectiveResult' },
  { id: 'compliance', label: '合规本土化', title: '合规本土化与上线准入方案', resultKey: 'complianceResult' },
];

function compactText(value: string, maxLength = 120) {
  const text = String(value || '').replace(/[#*_`>|-]/g, '').replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function formatTime(value?: string) {
  if (!value) return '待记录';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
}

function ProjectHistoryPage({ onNavigate }: ProjectHistoryPageProps) {
  const { showToast } = useToast();
  const [projects, setProjects] = useState<ProjectManagementProjectRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedProjectId, setExpandedProjectId] = useState<string>('');
  const [preview, setPreview] = useState<{ project: ProjectManagementProjectRecord; stage: StageMeta } | null>(null);

  useEffect(() => {
    let alive = true;
    window.yibiao?.projectManagement.listProjects()
      .then((result) => {
        if (!alive) return;
        const nextProjects = result?.projects || [];
        setProjects(nextProjects);
        setExpandedProjectId(nextProjects[0]?.id || '');
      })
      .catch((error) => showToast(error instanceof Error ? error.message : '读取项目历史失败', 'error'))
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [showToast]);

  const visibleProjects = useMemo(
    () => projects.filter((project) => project.name !== '未命名项目' || project.completedCount > 0 || project.clientName || project.vendorName),
    [projects],
  );
  const previewContent = preview ? String(preview.project.state[preview.stage.resultKey] || '').trim() : '';

  async function enterProject(projectId: string) {
    try {
      await window.yibiao?.projectManagement.switchProject(projectId);
      window.sessionStorage.setItem(projectManagementOpenWorkbenchKey, '1');
      onNavigate('project-management');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '进入项目失败', 'error');
    }
  }

  if (loading) {
    return <div className="project-history-page"><section className="project-history-empty">正在读取项目历史...</section></div>;
  }

  return (
    <div className="project-history-page">
      <section className="project-history-hero">
        <div>
          <span className="section-kicker">项目历史</span>
          <h2>把已管理项目、10 个阶段产出和预览入口集中起来</h2>
        <p>这里只展示项目列表、阶段产出和预览入口。新建、删除和继续推进项目，请回到项目管理工作台操作。</p>
        </div>
        <button type="button" className="primary-action" onClick={() => onNavigate('project-management')}>进入项目管理</button>
      </section>

      {!visibleProjects.length ? (
        <section className="project-history-empty">
          <strong>暂无项目历史</strong>
          <p>先进入项目管理创建项目并生成阶段产出，这里会自动汇总展示。</p>
          <button type="button" className="secondary-action" onClick={() => onNavigate('project-management')}>去项目管理</button>
        </section>
      ) : (
        <section className="project-history-list">
          {visibleProjects.map((project) => {
            const expanded = expandedProjectId === project.id;
            return (
              <article key={project.id} className="project-history-card">
                <button type="button" className="project-history-card-head" onClick={() => setExpandedProjectId((current) => (current === project.id ? '' : project.id))}>
                  <div>
                    <span className="section-kicker">{project.isActive ? '当前项目' : '本地工作区项目'}</span>
                    <h3>{project.name}</h3>
                    <p>{project.clientName || '客户待确认'} · {project.projectType || '项目类型待确认'}</p>
                  </div>
                  <div className="project-history-card-meta">
                    <strong>{project.completedCount}/{stageMetas.length}</strong>
                    <span>{expanded ? '收起阶段 ↑' : '展开阶段 ↓'}</span>
                  </div>
                </button>

                <div className="project-history-summary">
                  <span>当前阶段：{project.currentStage || '待确认'}</span>
                  <span>交付方：{project.vendorName || '待确认'}</span>
                  <span>更新时间：{formatTime(project.updated_at)}</span>
                  <button type="button" className="secondary-action" onClick={() => void enterProject(project.id)}>进入项目管理</button>
                </div>

                {expanded && (
                  <div className="project-history-stage-grid">
                    {stageMetas.map((stage, index) => {
                      const content = String(project.state[stage.resultKey] || '').trim();
                      const done = Boolean(content);
                      return (
                        <article key={stage.id} className={done ? 'is-done' : ''}>
                          <div>
                            <span>{index + 1}. {stage.label}</span>
                            <strong>{done ? '已生成' : '待生成'}</strong>
                          </div>
                          <p>{done ? compactText(content) : '该阶段暂无产出，可回到项目管理继续生成。'}</p>
                          <button type="button" className="secondary-action" onClick={() => setPreview({ project, stage })} disabled={!done}>预览</button>
                        </article>
                      );
                    })}
                  </div>
                )}
              </article>
            );
          })}
        </section>
      )}

      <Dialog.Root open={Boolean(preview)} onOpenChange={(open) => !open && setPreview(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="content-regenerate-modal" />
          <Dialog.Content className="project-history-preview-card">
            <div className="project-management-help-head">
              <div>
                <Dialog.Title>{preview?.stage.title || '阶段产出预览'}</Dialog.Title>
                <Dialog.Description>查看该阶段已保存的生成结果。</Dialog.Description>
              </div>
              <Dialog.Close className="detail-help-close" type="button" aria-label="关闭阶段产出预览">×</Dialog.Close>
            </div>
            <div className="project-history-preview-body">
              {previewContent ? <MarkdownRenderer allowRawHtml={false}>{previewContent}</MarkdownRenderer> : <p>暂无可预览内容。</p>}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

export default ProjectHistoryPage;

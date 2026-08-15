import { useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import '../codeGeneration.css';
import { useToast } from '../../../shared/ui/ToastProvider';
import type { SectionId } from '../../../shared/types/navigation';
import type { SoftwareCopyrightCase } from '../../software-copyright/types';
import type { CodeGenerationState } from '../types';
import { SourceFileWorkspace } from '../components/SourceFileWorkspace';

interface CodeGenerationPageProps {
  onNavigate: (section: SectionId) => void;
}

interface AiCopyrightNoticeBlock {
  heading?: string;
  paragraphs?: string[];
  list?: string[];
}

interface AiCopyrightNoticeSection {
  title: string;
  blocks: AiCopyrightNoticeBlock[];
}

const aiCopyrightNoticeSections: AiCopyrightNoticeSection[] = [
  {
    title: '一、法律底层判定依据',
    blocks: [
      {
        heading: '《著作权法》保护前提：人类智力独创性成果',
        paragraphs: [
          '只有以人类为主导创作、AI 仅作为辅助工具的代码，才具备著作权保护资格；完全无人工干预、AI 自主生成的代码，不属于著作权法保护客体，无法登记软著。',
        ],
      },
      {
        heading: '2026 年 3 月 15 日版权中心硬性诚信承诺制度（核心红线）',
        paragraphs: ['新版申请表签章页强制要求手抄承诺原文：'],
        list: [
          '本软件确系人的独立开发，未使用 AI 开发编写代码、撰写文档或生成登记申请材料。如有失实或欺骗，自愿列入版权登记失信名单、关联个人征信并承担全部法律责任。',
          '必须经办人手写抄写、签字、填写身份证号，企业额外加盖公章；代理机构不能代签、代抄。',
          '隐瞒 AI 生成代码属于虚假申报，查实后果：撤销已下发软著证书、公示失信记录、限制后续知识产权申报、追究民事 / 行政责任，批量造假会从严惩戒。',
        ],
      },
    ],
  },
  {
    title: '二、两类场景区分审核标准',
    blocks: [
      {
        heading: '场景 1：纯 AI 生成（无实质人工改造）→ 禁止申请软著',
        paragraphs: ['满足以下任意一条直接驳回，申报属于违规：'],
        list: [
          '全程仅输入需求提示词，AI 输出代码后仅简单复制粘贴，无架构重构、逻辑改写、调试优化；',
          '人工修改比例极低（行业实操阈值一般低于 30%），核心业务逻辑、整体框架完全由 AI 产出；',
          '无完整人工开发链路、无需求文档、调试日志、迭代记录等人类创作证据。',
        ],
      },
      {
        heading: '场景 2：AI 辅助编程（人类主导，AI 仅工具）→ 可合规申请，但严禁虚假承诺',
        paragraphs: ['1. 人工必须占据创作主导地位（独创性核心）'],
        list: [
          '人类负责：整体架构设计、业务需求定义、模块划分、算法选型、安全校验、整体集成；',
          'AI 仅负责：片段代码补全、语法纠错、简单函数模板、注释辅助，不能产出软件核心逻辑。',
          '实操安全比例：人工原创改造、自主编写内容占整体代码 ≥60%-70%，AI 片段仅作为填充辅助。',
        ],
      },
      {
        heading: '2. 不能直接签署“无 AI 参与”承诺书的处理方案',
        paragraphs: ['官方没有设置“AI 参与勾选栏”，承诺书为统一固定文本，分两种合规操作：'],
        list: [
          '稳妥主流方案（推荐）：对 AI 生成片段进行大规模重构、重写、逻辑改造，最终交付登记的源代码、说明书全部由人工深度改写，整体视为人类独立开发，如实签署标准承诺书；同时内部永久留存 AI 交互记录、prompt、修改日志备查（应对事后抽查）。',
          '高披露方案（AI 占比偏高时）：额外单独提交《AI 辅助开发情况说明》附件，写明使用的 AI 工具名称 / 版本、每部分 AI 生成范围、人工修改迭代记录、prompt 截图、调试记录，同步留存全部开发证据链；此方式审查周期更长，实质核查更严格。',
        ],
      },
    ],
  },
  {
    title: '三、AI 代码提交源代码材料硬性规范',
    blocks: [
      {
        heading: '1. 代码注释必须人工完善（审核重点）',
        paragraphs: ['AI 原生代码普遍缺少版权声明、业务逻辑解释，需人工逐条补全：'],
        list: [
          '每个文件头部添加人工版权、模块用途、开发人、开发日期注释；',
          '核心函数、复杂算法块补充业务设计思路（而非简单参数说明）；',
          '统一注释风格，消除 AI 生成的杂乱格式痕迹。',
        ],
      },
      {
        heading: '2. 源码格式统一标准（和普通软著一致）',
        list: [
          '提交前 30 页 + 后 30 页源码 PDF，每页去除空行后 ≥50 有效代码行；页眉标注软件全称 + 版本号；剔除第三方开源库、AI 模板冗余代码，只提交自主改造后的核心业务代码。',
        ],
      },
      {
        heading: '3. 禁止行为',
        list: [
          '直接上传 AI 一键生成未修改的源码、说明书；',
          '用 AI 生成申报材料（申请表文字、功能描述、操作手册）；',
          '掩盖开源依赖、AI 生成片段、抄袭痕迹；',
          '拆分同一个 AI 项目批量注册多份软著（非正常登记打击范围）。',
        ],
      },
    ],
  },
  {
    title: '四、失信与抽查风险',
    blocks: [
      {
        list: [
          '审查采用有限实质审查，遇到代码风格高度模板化、逻辑同质化、批量申报的项目，会启动人工溯源核查；',
          '后期可接受第三方投诉、行业抽检，一经查实隐瞒 AI 大量生成，已发证项目可能被撤销登记、证书作废、官网公示失信主体；',
          '经办人记入版权诚信档案，影响企业高新、招投标、知识产权补贴资质；',
          '情节严重涉及批量造假的，移交市场监管追责。',
        ],
      },
    ],
  },
  {
    title: '五、企业 / 个人实操合规步骤',
    blocks: [
      {
        list: [
          '开发阶段留存全证据：需求文档、架构图、AI 对话 prompt 截图、Git 迭代日志、调试记录、人工修改对比文件；',
          '对 AI 产出代码做结构性重写、逻辑优化、注释重构，拉高人工原创占比；',
          '撰写 500 至 1300 字详细软件功能说明（新版强制加长篇幅，杜绝 AI 模板套话），全部人工撰写；',
          '评估 AI 占比：人工主导改写充足→正常签署标准承诺书；AI 占比较高→附加 AI 开发说明材料；',
          '源代码、说明书全部人工校验排版、页眉页脚、命名规范，清除 AI 生成水印、冗余注释。',
        ],
      },
    ],
  },
  {
    title: '补充边界：AI 训练框架 / 模型本身',
    blocks: [
      {
        list: [
          '自研训练、人工调参、架构设计的 AI 模型软件（如大模型微调平台、推理部署程序），只要人类主导开发，完全可以正常申请软著；',
          '单纯调用第三方现成大模型 API、仅做简单页面封装，独创性弱，通过率低，不建议盲目申报。',
        ],
      },
    ],
  },
];

function CodeGenerationPage({ onNavigate }: CodeGenerationPageProps) {
  const { showToast } = useToast();
  const [state, setState] = useState<CodeGenerationState | null>(null);
  const [loading, setLoading] = useState(true);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [rescanOpen, setRescanOpen] = useState(false);
  const [savingSelection, setSavingSelection] = useState(false);
  const [activeProject, setActiveProject] = useState<SoftwareCopyrightCase | null>(null);
  const selectedComposition = useMemo(() => {
    const files = state?.summary.selectedFiles || [];
    return Array.from(new Set(files.map((file) => file.extension.replace('.', '').toUpperCase()).filter(Boolean))).slice(0, 6).join('、');
  }, [state?.summary.selectedFiles]);
  const canConfirm = Boolean(state?.project && state.selectedPaths.length && !savingSelection);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      window.yibiao?.codeGeneration.loadState(),
      window.yibiao?.softwareCopyright.listCases(true),
    ])
      .then(([nextState, projects]) => {
        if (!mounted) return;
        if (nextState) setState(nextState);
        setActiveProject(projects?.cases.find((project) => project.id === projects.activeCaseId) || null);
      })
      .catch((error) => showToast(error.message || '读取源码准备状态失败', 'error'))
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [showToast]);

  async function handleSelectProject() {
    try {
      const result = await window.yibiao?.codeGeneration.selectProject();
      if (!result?.success) {
        if (result?.message) showToast(result.message, 'info');
        return;
      }
      setState(result.state);
      showToast('源码扫描完成，已自动选择一批候选文件', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '选择源码目录失败', 'error');
    }
  }

  async function saveSelection(nextPaths: string[], sortMode?: CodeGenerationState['sortMode']) {
    setSavingSelection(true);
    try {
      const nextState = await window.yibiao?.codeGeneration.updateSelection({ selectedPaths: nextPaths, sortMode });
      if (nextState) setState(nextState);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存选择失败', 'error');
    } finally {
      setSavingSelection(false);
    }
  }

  async function handleRescan() {
    setRescanOpen(false);
    setSavingSelection(true);
    try {
      const nextState = await window.yibiao?.codeGeneration.rescan();
      if (nextState) setState(nextState);
      showToast('源码重新扫描完成，旧确认状态已失效', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '重新扫描失败', 'error');
    } finally {
      setSavingSelection(false);
    }
  }

  async function handleConfirm() {
    try {
      const nextState = await window.yibiao?.codeGeneration.confirmSelection();
      if (nextState) setState(nextState);
      showToast('源码素材已确认，可以继续生成软著材料', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '确认失败', 'error');
    }
  }

  function handleContinueToMaterials() {
    window.localStorage.setItem('software-copyright-open-workbench', 'true');
    onNavigate('software-copyright');
  }

  async function handleClear() {
    try {
      const result = await window.yibiao?.codeGeneration.clear();
      if (result) setState(result.state);
      showToast('当前项目的源码准备工作区已清空', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '清空失败', 'error');
    }
  }

  if (loading) {
    return <div className="code-generation-page"><div className="software-copyright-empty">正在读取代码素材状态...</div></div>;
  }

  return (
    <div className="code-generation-page">
      <section className="code-generation-header">
        <div>
          <span className="section-kicker">源码准备</span>
          <h2>为当前软著项目确认源码材料</h2>
          <p>源码扫描、文件范围和确认状态跟随当前软著项目独立保存，切换软著项目后不会互相覆盖。</p>
          <div className="code-generation-project-context">
            <span>当前软著项目</span>
            <strong>{activeProject?.name || '未命名软著项目'}</strong>
            <small>{activeProject?.softwareName || '尚未填写软件全称'} / {activeProject?.version || 'V1.0'}</small>
          </div>
          <button type="button" className="code-generation-notice-link" onClick={() => setNoticeOpen(true)}>
            关于AI生成软著的必看事项
          </button>
        </div>
        <div className="software-copyright-header-actions">
          <button type="button" className="secondary-action" onClick={() => onNavigate('software-copyright')} disabled={savingSelection}>切换软著项目</button>
          <button type="button" className="secondary-action" onClick={handleSelectProject} disabled={savingSelection}>{state?.project ? '更换源码目录' : '选择源码目录'}</button>
          <button type="button" className="secondary-action" onClick={() => setRescanOpen(true)} disabled={!state?.project || savingSelection}>{savingSelection ? '处理中' : '重新扫描'}</button>
          <button type="button" className="primary-action" onClick={handleContinueToMaterials} disabled={!state?.confirmed || savingSelection}>进入材料生成</button>
          <button type="button" className="danger-action" onClick={handleClear} disabled={savingSelection}>清空</button>
        </div>
      </section>

      <div className="code-generation-layout">
        <main className="code-generation-main">
          <section className="software-copyright-panel">
            <div className="software-copyright-panel-head">
              <div>
                <span className="section-kicker">源码来源</span>
                <h3>{state?.project?.name || '尚未选择项目'}</h3>
              </div>
              {state?.confirmed && <span className="code-generation-confirmed">已确认</span>}
            </div>
            {state?.analysis ? (
              <div className="software-copyright-stats">
                <article><span>源码文件</span><strong>{state.analysis.fileCount}</strong></article>
                <article><span>源码行数</span><strong>{state.analysis.lineCount}</strong></article>
                <article><span>已选文件</span><strong>{state.summary.selectedCount}</strong></article>
                <article><span>预计页数</span><strong>{state.summary.estimatedPages}</strong></article>
              </div>
            ) : (
              <div className="software-copyright-empty">请为“{activeProject?.name || '当前软著项目'}”选择源码目录。</div>
            )}
          </section>

          <section className="software-copyright-panel code-generation-files-panel">
            <div className="software-copyright-panel-head">
              <div>
                <span className="section-kicker">源码素材</span>
                <h3>确认代码文件范围</h3>
              </div>
              <button type="button" className="primary-action" onClick={handleConfirm} disabled={!canConfirm}>确认素材</button>
            </div>
            {state?.analysis ? (
              <SourceFileWorkspace
                analysis={state.analysis}
                selectedPaths={state.selectedPaths}
                sortMode={state.sortMode || 'smart'}
                disabled={savingSelection}
                onChange={(paths, sortMode) => void saveSelection(paths, sortMode)}
              />
            ) : (
              <div className="software-copyright-empty">暂无可选源码文件。</div>
            )}
          </section>
        </main>

        <aside className="code-generation-side">
          <section className="software-copyright-panel">
            <div className="software-copyright-panel-head">
              <div>
                <span className="section-kicker">下一步</span>
                <h3>生成软著材料</h3>
              </div>
            </div>
            <div className="code-generation-flow">
              <span>选择当前项目的源码目录</span>
              <span>确认代码素材范围</span>
              <span>材料生成选择源码准备结果</span>
              <span>导出代码鉴别材料</span>
            </div>
            {state?.analysis && (
              <div className="code-generation-selection-summary">
                <span>当前排序</span><strong>{state.sortMode === 'path' ? '路径排序' : state.sortMode === 'manual' ? '手动排序' : '入口优先'}</strong>
                <span>已选语言</span><strong>{selectedComposition || '未选择'}</strong>
                <span>最后扫描</span><strong>{state.scannedAt ? new Date(state.scannedAt).toLocaleString() : '历史数据'}</strong>
              </div>
            )}
            <p>确认后，进入当前项目的材料生成工作台，选择“使用源码准备结果”即可继续。</p>
            <button type="button" className="primary-action code-generation-next-action" onClick={handleContinueToMaterials} disabled={!state?.confirmed || savingSelection}>进入材料生成</button>
          </section>
        </aside>
      </div>

      <Dialog.Root open={noticeOpen} onOpenChange={setNoticeOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="content-regenerate-modal" />
          <Dialog.Content className="code-generation-ai-notice-card">
            <div className="code-generation-ai-notice-head">
              <div>
                <Dialog.Title>关于AI生成软著的必看事项</Dialog.Title>
                <Dialog.Description>
                  申请前请先确认代码创作链路、人工改造比例和证据留存情况。具体登记要求请以官方最新受理口径为准。
                </Dialog.Description>
              </div>
              <Dialog.Close className="detail-help-close" type="button" aria-label="关闭必看事项">×</Dialog.Close>
            </div>

            <div className="code-generation-ai-notice-body">
              {aiCopyrightNoticeSections.map((section) => (
                <section key={section.title}>
                  <h3>{section.title}</h3>
                  {section.blocks.map((block, index) => (
                    <div className="code-generation-ai-notice-block" key={`${section.title}-${index}`}>
                      {block.heading && <h4>{block.heading}</h4>}
                      {block.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                      {block.list && (
                        <ul>
                          {block.list.map((item) => <li key={item}>{item}</li>)}
                        </ul>
                      )}
                    </div>
                  ))}
                </section>
              ))}
            </div>

            <div className="code-generation-ai-notice-actions">
              <Dialog.Close className="primary-action" type="button">我已知晓</Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={rescanOpen} onOpenChange={setRescanOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="content-regenerate-modal" />
          <Dialog.Content className="code-generation-rescan-card">
            <Dialog.Title>重新扫描当前项目</Dialog.Title>
            <Dialog.Description>
              将重新读取磁盘源码，保留仍然存在的文件选择和排序。已删除文件会自动移除，新文件不会自动纳入，旧确认状态会立即失效。
            </Dialog.Description>
            <div className="code-generation-rescan-actions">
              <Dialog.Close className="secondary-action" type="button">取消</Dialog.Close>
              <button className="primary-action" type="button" onClick={() => void handleRescan()}>开始扫描</button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

export default CodeGenerationPage;

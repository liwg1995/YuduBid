import { useEffect, useState, useRef } from 'react';
import { useAppDialog } from '../../../shared/ui';
import { useToast } from '../../../shared/ui/ToastProvider';
import './businessTemplateFields.css';
import type { BusinessAttachmentSlots, BusinessCredentialSelection, CredentialCompany, CredentialLibraryProfile, CredentialLibrarySnapshot } from '../../../shared/types/contracts/credentialLibrary';

interface BusinessTemplate {
  name: string;
  fields: string[];
  profileBindings: Partial<Record<string, keyof CredentialLibraryProfile>>;
  attachmentSlots: BusinessAttachmentSlots;
}

type AttachmentIds = Omit<BusinessCredentialSelection, 'companyId'>;
const emptyAttachments: AttachmentIds = { employeeIds: [], projectIds: [], certificateIds: [], imageIds: [] };
const slotLabels = { append: '追加到文末', positioned: '填入模板所有对应位置', invalid: '标记须单独占一段' };
const displayName = (value: string) => value.replace(/易标|yibiao/gi, '投标工具');

export default function BusinessTemplateFields({ prepareKey, preparedRevision, projectKey, onDirtyChange, onRegisterSave }: { onDirtyChange?: (dirty: boolean) => void; onRegisterSave?: (save: (() => Promise<boolean>) | null) => void; prepareKey?: string; preparedRevision?: number; projectKey?: string }) {
  const { showToast } = useToast();
  const { confirm } = useAppDialog();
  const [sessionReload, setSessionReload] = useState(0);
  const [template, setTemplate] = useState<BusinessTemplate | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [companies, setCompanies] = useState<CredentialCompany[] | null>(null);
  const [companyId, setCompanyId] = useState('');
  const [credentials, setCredentials] = useState<CredentialLibrarySnapshot | null>(null);
  const [attachmentIds, setAttachmentIds] = useState<AttachmentIds>(emptyAttachments);
  const [formSource, setFormSource] = useState<{ name: string; sourceKind?: 'original-word' | 'reconstructed'; candidates: Array<{ id: string; title: string; tableCount: number; preview: string }> } | null>(null);
  const [formDraft, setFormDraft] = useState<string | null>(null);
  const [selectedForms, setSelectedForms] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [prepared, setPrepared] = useState(false);
  const [sessionReady, setSessionReady] = useState(!projectKey);
  const [sessionSaving, setSessionSaving] = useState(false);
  const [sessionError, setSessionError] = useState('');
  const [revision, setRevision] = useState(0);
  const savedSignature = useRef('');
  const sessionPromise = useRef<Promise<boolean> | null>(null);
  const signature = JSON.stringify([template, values, companyId, attachmentIds, formSource, selectedForms, formDraft, revision]);
  const sessionDirty = sessionReady && !!projectKey && signature !== savedSignature.current;
  useEffect(() => { onDirtyChange?.(sessionDirty || sessionSaving); }, [sessionDirty, sessionSaving, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  useEffect(() => {
    let active = true;
    if (!projectKey) return;
    setSessionReady(false);
    void window.yibiao?.export.loadBusinessSession(projectKey).then(async (saved) => {
      if (!active) return;
      const nextTemplate = saved?.template ?? null;
      const nextValues = saved?.values ?? {};
      const nextCompany = saved?.companyId ?? '';
      const nextAttachments = saved?.attachmentIds ?? emptyAttachments;
      const nextSource = saved?.formSource ?? null;
      const nextSelected = saved?.selectedForms ?? [];
      const nextDraft = saved?.formDraft ?? null;
      setTemplate(nextTemplate); setValues(nextValues); setCompanyId(nextCompany); setAttachmentIds(nextAttachments);
      setFormSource(nextSource); setSelectedForms(nextSelected); setFormDraft(nextDraft); setRevision(0);
      savedSignature.current = JSON.stringify([nextTemplate, nextValues, nextCompany, nextAttachments, nextSource, nextSelected, nextDraft, 0]);
      if (nextCompany && window.yibiao?.credentialLibrary) {
        try {
          const [records, snapshot] = await Promise.all([window.yibiao.credentialLibrary.listCompanies(), window.yibiao.credentialLibrary.load(nextCompany)]);
          if (active) { setCompanies(records); setCredentials(snapshot); }
        } catch { if (active) showToast('已恢复商务草稿，关联企业或附件可能已变更，请重新核对资信库', 'info'); }
      }
      if (active) { setSessionError(''); setSessionReady(true); }
    }).catch((error) => { if (active) setSessionError(error instanceof Error ? error.message : '恢复商务草稿失败'); });
    return () => { active = false; };
  }, [projectKey, sessionReload]);
  async function saveSession() {
    if (!projectKey || signature === savedSignature.current) return true;
    if (!sessionReady) return false;
    if (sessionPromise.current) { if (!await sessionPromise.current) return false; return saveSession(); }
    setSessionSaving(true);
    const pending = (async () => {
      try {
        if (!window.yibiao?.export) throw new Error('商务工作草稿保存服务不可用');
        await window.yibiao.export.saveBusinessSession(projectKey, { values, companyId, attachmentIds, selectedForms, formDraft, formSourceActive: !!formSource });
        savedSignature.current = signature; setSessionError(''); setPrepared(false);
        return true;
      } catch (error) { setSessionError(error instanceof Error ? error.message : '保存失败'); return false; }
      finally { setSessionSaving(false); sessionPromise.current = null; }
    })();
    sessionPromise.current = pending;
    return pending;
  }
  const flushSession = useRef(saveSession);
  flushSession.current = saveSession;
  useEffect(() => () => { void flushSession.current(); }, []);
  useEffect(() => { onRegisterSave?.(saveSession); return () => onRegisterSave?.(null); });
  useEffect(() => {
    if (!sessionDirty || busy || sessionSaving || sessionError) return;
    const timer = window.setTimeout(() => { void saveSession(); }, 700);
    return () => window.clearTimeout(timer);
  }, [signature, sessionDirty, busy, sessionSaving, sessionError]);
  useEffect(() => {
    let active = true;
    setPrepared(false);
    if (prepareKey) void window.yibiao?.export.getPreparedBusinessStatus(prepareKey)
      .then((saved) => { if (active) setPrepared(saved); })
      .catch(() => { if (active) showToast('无法读取已保存的商务部分', 'error'); });
    return () => { active = false; };
  }, [prepareKey, preparedRevision, showToast]);
  const selectedSlotHasError = (Object.keys(attachmentIds) as (keyof AttachmentIds)[]).some((key) => {
    const status = template?.attachmentSlots[key];
    return attachmentIds[key].length > 0 && status === 'invalid';
  });
  const remaining = template?.fields.filter((field) => !values[field]?.trim()).length ?? 0;

  function applyTemplate(selected: BusinessTemplate) {
    setRevision((value) => value + 1);
    setTemplate(selected);
    setCompanies(null);
    setCompanyId('');
    setCredentials(null);
    setAttachmentIds(emptyAttachments);
    setValues(Object.fromEntries(selected.fields.map((field) => [field, ''])));
    setFormSource(null);
    setFormDraft(null);
    setSelectedForms([]);
  }

  async function inspectForms(useProject = false) {
    setBusy(true);
    try {
      if (!window.yibiao?.export) throw new Error('请在桌面客户端中读取招标文件');
      const source = await window.yibiao.export.inspectTenderForms(useProject ? projectKey : undefined);
      if (source) {
        setRevision((value) => value + 1);
        setFormSource(source);
        setFormDraft(null);
        setSelectedForms([]);
        if (!source.candidates.length) showToast('未识别到表单章节或表格，请检查解析内容，或使用单独的 Word 模板', 'info');
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : '读取招标表单失败', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function readFormDraft() {
    setBusy(true);
    try {
      const draft = await window.yibiao?.export.readTenderFormDraft(selectedForms);
      if (draft !== undefined) setFormDraft(draft);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '读取整理稿失败', 'error');
    } finally { setBusy(false); }
  }

  async function useForms() {
    setBusy(true);
    try {
      const selected = await window.yibiao?.export.useTenderForms(selectedForms, formDraft ?? undefined);
      if (selected) {
        applyTemplate(selected);
        showToast('已提取所选章节，可继续填写字段和添加资信附件', 'success');
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : '提取表单失败', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function selectTemplate() {
    setBusy(true);
    try {
      const exporter = window.yibiao?.export;
      if (!exporter) throw new Error('请在桌面客户端中选择商务标模板');
      const selected = await exporter.selectBusinessTemplate();
      if (selected) {
        applyTemplate(selected);
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : '读取商务标模板失败', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function loadCompanies() {
    const library = window.yibiao?.credentialLibrary;
    if (!library) return;
    setBusy(true);
    try {
      const records = await library.listCompanies();
      setCompanies(records);
      setCredentials(null);
      setAttachmentIds(emptyAttachments);
      setCompanyId(records.length === 1 ? records[0].companyId : '');
      if (!records.length) showToast('资信库暂无企业资料', 'info');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '读取资信库失败', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function fillFromCredentials() {
    const library = window.yibiao?.credentialLibrary;
    if (!library || !template || !companyId) return;
    setBusy(true);
    try {
      const { profile } = await library.load(companyId);
      const additions = Object.entries(template.profileBindings).flatMap(([field, key]) => {
        const value = key ? profile[key] : undefined;
        return !values[field]?.trim() && typeof value === 'string' && value.trim()
          ? [[field, value.trim().replace(/[\r\n]+/g, ' ')] as const] : [];
      });
      if (additions.length) setValues((current) => ({ ...current, ...Object.fromEntries(additions) }));
      showToast(additions.length ? `已填入 ${additions.length} 项企业资料，请复核` : '没有可填入的空白企业字段', 'info');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '填入企业资料失败', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function loadAttachments() {
    const library = window.yibiao?.credentialLibrary;
    if (!library || !companyId) return;
    setBusy(true);
    try {
      const snapshot = await library.load(companyId);
      setCredentials(snapshot);
      const allowed = { employeeIds: new Set(snapshot.employees.map((item) => item.employeeId)), projectIds: new Set(snapshot.projects.map((item) => item.projectId)), certificateIds: new Set(snapshot.certificates.map((item) => item.certificateId)), imageIds: new Set(snapshot.images.map((item) => item.imageId)) };
      setAttachmentIds((current) => Object.fromEntries(Object.entries(current).map(([key, ids]) => [key, ids.filter((id) => allowed[key as keyof AttachmentIds].has(id))])) as AttachmentIds);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '读取资信附件失败', 'error');
    } finally {
      setBusy(false);
    }
  }

  function toggleAttachment(key: keyof AttachmentIds, id: string) {
    setAttachmentIds((current) => ({
      ...current,
      [key]: current[key].includes(id) ? current[key].filter((value) => value !== id) : [...current[key], id],
    }));
  }

  async function exportTemplate() {
    if (Object.values(attachmentIds).some((ids) => ids.length) && (!credentials || !companyId)) {
      showToast('关联资信资料尚未恢复，请重新选择企业并核对附件后导出', 'error'); return;
    }
    if (!await saveSession()) { showToast('商务工作草稿未保存，请重试后再导出', 'error'); return; }
    setBusy(true);
    try {
      const exporter = window.yibiao?.export;
      if (!exporter) throw new Error('请在桌面客户端中导出商务标');
      const saved = await exporter.fillBusinessTemplate(values, credentials ? { companyId, ...attachmentIds } : undefined, prepareKey);
      if (saved && prepareKey) setPrepared(true);
      if (saved) showToast(prepareKey ? '商务部分已保存，可继续生成技术文件' : '商务标已导出', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '导出商务标失败', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="business-bid-page">
      {projectKey && <div className="business-bid-session-status" role="status">
        <span>{sessionError || (!sessionReady ? '正在恢复商务工作草稿…' : sessionSaving ? '正在保存商务工作草稿…' : sessionDirty ? '商务修改待保存' : '商务工作草稿已保存到当前项目')}</span>
        {(sessionDirty || sessionError) && sessionReady && <button type="button" className="secondary-action" disabled={sessionSaving} onClick={() => void saveSession()}>立即保存</button>}
        {sessionError && <button type="button" className="secondary-action" onClick={() => { void (async () => {
          if (sessionDirty && !await confirm({ title: '重新读取已保存草稿', description: '本次未保存修改将被已保存版本替换。可以先点立即保存，再重新读取。', confirmLabel: '放弃本次修改并读取' })) return;
          setSessionReload((value) => value + 1);
        })(); }}>重新读取</button>}
        {sessionError && !sessionReady && <button type="button" className="secondary-action" onClick={() => { void (async () => {
          if (!projectKey || !await confirm({ title: '重建商务工作草稿', description: '将清除当前项目保存的模板、字段和附件选择。招标文件、商务正文草稿及资信库资料会保留。', confirmLabel: '清除并重建' })) return;
          try { await window.yibiao?.export.resetBusinessSession(projectKey); setSessionReload((value) => value + 1); }
          catch (error) { showToast(error instanceof Error ? error.message : '重建失败', 'error'); }
        })(); }}>清除损坏草稿并重建</button>}
      </div>}
      <fieldset className="business-bid-session-content" disabled={!sessionReady}>

      <header className="business-bid-heading">
        <div>
          <h2>商务标模板</h2>
          <p>{template ? template.name : '导入 Word 模板，填写字段并添加资信附件。'}</p>
          {prepared && <p>当前项目已有商务部分，完整投标文件导出时会自动合并。</p>}
        </div>
        <div className="business-bid-template-actions">
        {projectKey && <button type="button" className="secondary-action" disabled={busy} onClick={() => void inspectForms(true)}>从当前项目提取原表</button>}
        <button type="button" className="secondary-action" disabled={busy} onClick={() => void inspectForms()}>选择其他招标 Word</button>
        <button type="button" className={template ? 'secondary-action' : 'primary-action'} disabled={busy} onClick={selectTemplate}>
          {template ? '更换模板' : '选择 Word 模板'}
        </button>
        </div>
      </header>
      <div className="business-bid-scroll">
        {formSource && (
          <section className="business-bid-panel business-bid-form-selection">
            <h3>选择表单章节 · {formSource.name}</h3>
            {formSource.sourceKind === 'reconstructed' && <p role="status">当前使用项目已解析的文本与表格重建 Word 整理稿。PDF 原页面、合并单元格、签章与扫描图片可能无法还原，请对照原文件补齐。独立表格也可能属于技术或报价内容，请核对用途后再选择。</p>}
            <p>根据章节标题识别候选范围。请核对预览；选择上级章节会包含下属表单，重叠范围只提取一次。签章、手写及未识别字段需在 Word 中补充。</p>
            {!formSource.candidates.length && <p>未识别到可提取的表单章节，可改用单独的 Word 模板。</p>}
            {formSource.candidates.map((form) => (
              <div className="business-bid-form-option" key={form.id}>
                <label>
                  <input type="checkbox" disabled={busy} checked={selectedForms.includes(form.id)} onChange={() => { setFormDraft(null); setSelectedForms((current) => current.includes(form.id) ? current.filter((id) => id !== form.id) : [...current, form.id]); }} />
                  <span>{form.title} · {form.tableCount} 个表格</span>
                </label>
                <details><summary>预览章节文字</summary><pre>{form.preview || '本章节没有可预览文字'}</pre></details>
              </div>
            ))}
            <div className="business-bid-template-actions">
              {formSource.sourceKind === 'reconstructed' && <button type="button" className="secondary-action" disabled={busy || !selectedForms.length} onClick={readFormDraft}>核对与修订整理稿</button>}
              <button type="button" className="primary-action" disabled={busy || !selectedForms.length || formDraft === ''} onClick={useForms}>{formSource.sourceKind === 'reconstructed' ? '生成所选表单整理稿' : '提取所选章节作为模板'}</button>
              <button type="button" className="secondary-action" disabled={busy} onClick={() => setFormSource(null)}>取消</button>
            </div>
            {formDraft !== null && <label className="business-bid-draft-editor">整理稿内容（Markdown）
              <span>可修正解析遗漏和表格；切换所选章节或重新读取整理稿会重置修订。生成模板后继续填写企业字段。</span>
              <textarea value={formDraft} maxLength={300000} disabled={busy} onChange={(event) => setFormDraft(event.target.value)} />
            </label>}
          </section>
        )}
        {template && (
          <section className="business-bid-panel">
            <h3>填写字段</h3>
            <div className="business-bid-credentials">
              <button type="button" className="secondary-action" disabled={busy} onClick={loadCompanies}>
                {companies ? '刷新资信库企业' : '从资信库选择企业'}
              </button>
              {!!companies?.length && (
                <>
                  <select aria-label="资信库企业" value={companyId} disabled={busy}
                    onChange={(event) => {
                      setCompanyId(event.target.value);
                      setCredentials(null);
                      setAttachmentIds(emptyAttachments);
                    }}>
                    <option value="">请选择企业</option>
                    {companies.map((company) => <option key={company.companyId} value={company.companyId}>{displayName(company.companyName)}</option>)}
                  </select>
                  {Object.keys(template.profileBindings).length > 0 && <button type="button" className="secondary-action" disabled={busy || !companyId} onClick={fillFromCredentials}>填入空白字段</button>}
                  <button type="button" className="secondary-action" disabled={busy || !companyId} onClick={loadAttachments}>选择资信附件</button>
                </>
              )}
            </div>
            {!template.fields.length && <p>未识别到可填写字段。可直接添加资信附件，也可以在 Word 中添加字段标记后重新导入。</p>}
            <div className="business-bid-fields">
              {template.fields.map((field) => (
                <label className="business-bid-field" key={field}>
                  <strong>{displayName(field)}</strong>
                  <input type="text" maxLength={5000} value={values[field] ?? ''} disabled={busy}
                    onChange={(event) => setValues((current) => ({ ...current, [field]: event.target.value }))} />
                </label>
              ))}
            </div>
          </section>
        )}
        {template && credentials && (
          <section className="business-bid-panel">
              <fieldset className="business-bid-attachments" disabled={busy}>
                <legend>资信附件</legend>
                <p>模板有附件位置标记时，选中的同类资料填入所有对应位置。没有标记的资料追加到文末。人员资料只导出姓名、岗位、职称、专业和学历等投标信息。</p>
                {([
                  ['certificateIds', '企业证书', credentials.certificates.map((item) => [item.certificateId, item.name])],
                  ['employeeIds', '人员资料', credentials.employees.map((item) => [item.employeeId, item.name])],
                  ['projectIds', '项目业绩', credentials.projects.map((item) => [item.projectId, item.projectName])],
                  ['imageIds', '证明图片', credentials.images.map((item) => [item.imageId, item.customName || item.originalName, item.assetUrl])],
                ] as const).map(([key, title, items]) => (
                  <details key={key} open={items.length > 0}>
                    <summary>{title}（已选 {attachmentIds[key].length} / {items.length}） · {slotLabels[template.attachmentSlots[key] ?? 'append']}</summary>
                    {items.length ? items.map(([id, label, imageUrl]) => (
                      <label key={id}>
                        <input type="checkbox" checked={attachmentIds[key].includes(id)} onChange={() => toggleAttachment(key, id)} />
                        <span>{displayName(label || '未命名资料')}
                          {imageUrl && attachmentIds.imageIds.includes(id) && (
                            <img className="business-bid-attachment-preview" src={imageUrl} alt="所选证明材料预览" loading="lazy" />
                          )}
                        </span>
                      </label>
                    )) : <p>暂无资料</p>}
                  </details>
                ))}
              </fieldset>
          </section>
        )}
        <details className="business-bid-help">
          <summary>模板填写与附件标记说明</summary>
          <p>空白格可自动识别，也可以在 Word 中使用 <code>{'{{字段名}}'}</code> 指定填写位置。</p>
          <p>同类附件可设置多个位置标记，每个位置填入相同的所选资料；标记须在正文或表格单元格中单独占一段。</p>
          <ul>
            {['企业证书', '人员资料', '项目业绩', '证明图片'].map((name) => (
              <li key={name}><code>{`{{附件:${name}}}`}</code></li>
            ))}
          </ul>
        </details>
      </div>
      {template && (
        <footer className="business-bid-footer">
          <div aria-live="polite">
            <p>{remaining} 项字段待填写 · 已选 {Object.values(attachmentIds).reduce((total, ids) => total + ids.length, 0)} 项附件</p>
            {selectedSlotHasError && <p role="alert">请修正附件标记并重新导入模板，或取消勾选对应附件。</p>}
          </div>
          <button type="button" className="primary-action" disabled={busy || selectedSlotHasError} onClick={exportTemplate}>{prepareKey ? '准备商务部分' : '导出商务标 Word'}</button>
        </footer>
      )}
      </fieldset>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useAppDialog, useToast } from '../../../shared/ui';
import type { CredentialImage, CredentialImageFieldKey, CredentialLibrarySnapshot, CredentialLibraryProfile, CredentialRecordSavePayload, CredentialCertificate, CredentialEmployee, CredentialProject, CredentialOtherMaterial } from '../types';
import { emptyCredentialProfile } from '../types';
import './credentialLibrary.css';

type Kind = 'certificate' | 'employee' | 'project' | 'other';
type Tab = 'profile' | Kind;
type Field = { key: string; label: string; multiline?: boolean; options?: Array<{ value: string; label: string }> };
const profileFields: Field[] = [
  { key: 'companyName', label: '企业名称' }, { key: 'unifiedSocialCreditCode', label: '统一社会信用代码' },
  { key: 'legalRepresentative', label: '法定代表人' }, { key: 'phone', label: '电话' },
  { key: 'email', label: '邮箱' }, { key: 'address', label: '地址' },
  { key: 'registeredCapital', label: '注册资本' }, { key: 'businessScope', label: '经营范围', multiline: true },
  { key: 'industry', label: '所属行业' }, { key: 'companyType', label: '企业类型' },
  { key: 'operatingPeriodStart', label: '经营期限开始' }, { key: 'operatingPeriodEnd', label: '经营期限结束' },
  { key: 'insuredEmployeeCount', label: '参保人数' }, { key: 'companyIntro', label: '企业介绍', multiline: true },
  { key: 'bankAccountName', label: '开户名称' }, { key: 'bankAccountNumber', label: '银行账号' },
  { key: 'bankName', label: '开户银行' }, { key: 'bankRoutingNumber', label: '联行号' },
  { key: 'taxCertificateDate', label: '纳税证明日期' }, { key: 'taxCertificateNote', label: '纳税证明备注' },
  { key: 'auditReportDate', label: '审计报告日期' }, { key: 'auditReportNote', label: '审计报告备注' },
  { key: 'socialSecurityCertificateDate', label: '社保证明日期' }, { key: 'socialSecurityCertificateNote', label: '社保证明备注' },
];
const recordFields: Record<Kind, Field[]> = {
  certificate: [{ key: 'name', label: '证书名称' }, { key: 'number', label: '证书编号' }, { key: 'validityMode', label: '有效期模式', options: [{ value: '', label: '未设置' }, { value: 'range', label: '日期范围' }, { value: 'long-term', label: '长期有效' }] }, { key: 'validFrom', label: '有效期开始' }, { key: 'validTo', label: '有效期结束' }],
  employee: [{ key: 'name', label: '姓名' }, { key: 'idNumber', label: '身份证号' }, { key: 'position', label: '岗位' }, { key: 'professionalTitle', label: '职称' }, { key: 'gender', label: '性别' }, { key: 'phone', label: '电话' }, { key: 'education', label: '学历' }, { key: 'school', label: '毕业院校' }, { key: 'major', label: '专业' }, { key: 'introduction', label: '人员简介', multiline: true }],
  project: [{ key: 'projectName', label: '项目名称' }, { key: 'projectNumber', label: '项目编号' }, { key: 'customerName', label: '客户名称' }, { key: 'projectType', label: '项目类型', options: [{ value: '', label: '未设置' }, { value: 'service', label: '服务' }, { value: 'goods', label: '货物' }, { value: 'construction', label: '工程' }] }, { key: 'projectManager', label: '项目经理' }, { key: 'contractAmount', label: '合同金额' }, { key: 'startDate', label: '开始日期' }, { key: 'endDate', label: '结束日期' }, { key: 'projectStatus', label: '项目状态' }, { key: 'introduction', label: '业绩说明', multiline: true }],
  other: [{ key: 'name', label: '资料名称' }, { key: 'note', label: '备注', multiline: true }],
};
const labels: Record<Tab, string> = { profile: '企业资料', certificate: '资质证书', employee: '人员', project: '项目业绩', other: '其他资料' };
const idKeys: Record<Kind, string> = { certificate: 'certificateId', employee: 'employeeId', project: 'projectId', other: 'materialId' };
const imageFields: Record<Tab, CredentialImageFieldKey> = { profile: 'businessLicense', certificate: 'certificateImages', employee: 'employeeSocialSecurity', project: 'projectContract', other: 'otherMaterialImages' };
const imageFieldOptions: Record<Tab, Array<{ value: CredentialImageFieldKey; label: string }>> = {
  profile: [
    { value: 'businessLicense', label: '营业执照' }, { value: 'officeEnvironment', label: '办公环境' },
    { value: 'legalRepresentativeIdEmblem', label: '法人身份证国徽面' }, { value: 'legalRepresentativeIdPortrait', label: '法人身份证人像面' },
    { value: 'legalRepresentativeAuthorization', label: '法人授权书' }, { value: 'basicDepositAccountInfo', label: '基本账户资料' },
    { value: 'creditChinaReport', label: '信用中国报告' }, { value: 'enterpriseCreditReport', label: '企业信用报告' },
    { value: 'taxCertificate', label: '纳税证明' }, { value: 'auditReport', label: '审计报告' },
    { value: 'socialSecurityCertificate', label: '社保证明' }, { value: 'bankAccountLicense', label: '开户许可证' },
  ],
  certificate: [{ value: 'certificateImages', label: '证书原图' }],
  employee: [
    { value: 'employeeSocialSecurity', label: '社保证明' }, { value: 'employeeIdEmblem', label: '身份证国徽面' },
    { value: 'employeeIdPortrait', label: '身份证人像面' }, { value: 'laborContract', label: '劳动合同' },
    { value: 'educationCertificate', label: '学历证书' }, { value: 'driverLicense', label: '驾驶证' }, { value: 'skillCertificate', label: '技能证书' },
  ],
  project: [
    { value: 'projectContract', label: '项目合同' }, { value: 'bidWinningNotice', label: '中标通知书' },
    { value: 'projectAcceptanceCertificate', label: '验收证明' }, { value: 'paymentInvoice', label: '付款发票' },
  ],
  other: [{ value: 'otherMaterialImages', label: '资料原图' }],
};

type Draft = Record<string, string>;
const credentialLibrary = window.yibiao!.credentialLibrary;

function CredentialLibraryPage() {
  const { showToast } = useToast();
  const { confirm } = useAppDialog();
  const [snapshot, setSnapshot] = useState<CredentialLibrarySnapshot | null>(null);
  const [profile, setProfile] = useState<CredentialLibraryProfile>(emptyCredentialProfile);
  const [tab, setTab] = useState<Tab>('profile');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [newImages, setNewImages] = useState<string[]>([]);
  const [selectedImageField, setSelectedImageField] = useState<CredentialImageFieldKey>(imageFields.profile);
  const [removedImages, setRemovedImages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void credentialLibrary.load().then((data) => {
      if (active) { setSnapshot(data); setProfile(data.profile); }
    }).catch((error) => showToast(String(error), 'error'));
    return () => { active = false; };
  }, [showToast]);

  const records = tab === 'profile' || !snapshot ? [] : tab === 'certificate' ? snapshot.certificates : tab === 'employee' ? snapshot.employees : tab === 'project' ? snapshot.projects : snapshot.otherMaterials;
  const currentId = draft && tab !== 'profile' ? draft[idKeys[tab]] || '' : '';
  const currentImages = (snapshot?.images || []).filter((image) => image.ownerType === tab && image.ownerId === (tab === 'profile' ? '1' : currentId) && !removedImages.includes(image.imageId));

  const run = async (action: () => Promise<CredentialLibrarySnapshot | { snapshot: CredentialLibrarySnapshot; fileDeleteFailures: string[] }>) => {
    setBusy(true);
    try {
      const result = await action();
      const next = 'snapshot' in result ? result.snapshot : result;
      setSnapshot(next);
      setProfile(next.profile);
      if ('fileDeleteFailures' in result && result.fileDeleteFailures.length) showToast('资料已保存，但部分原图删除失败', 'info');
      else showToast('已保存', 'success');
      setDraft(null); setNewImages([]); setRemovedImages([]);
    } catch (error) { showToast(String(error), 'error'); }
    finally { setBusy(false); }
  };

  const selectImages = async () => {
    try { const selected = await credentialLibrary.selectImages(); setNewImages((previous) => [...previous, ...selected]); }
    catch (error) { showToast(String(error), 'error'); }
  };

  const saveRecord = async () => {
    if (!draft || tab === 'profile') return;
    const payload = { record: draft, newImages: newImages.map((filePath) => ({ fieldKey: selectedImageField, filePath })), removedImageIds: removedImages };
    await run(() => tab === 'certificate' ? credentialLibrary.saveCertificate(payload as unknown as CredentialRecordSavePayload<CredentialCertificate>)
      : tab === 'employee' ? credentialLibrary.saveEmployee(payload as unknown as CredentialRecordSavePayload<CredentialEmployee>)
        : tab === 'project' ? credentialLibrary.saveProject(payload as unknown as CredentialRecordSavePayload<CredentialProject>)
          : credentialLibrary.saveOtherMaterial(payload as unknown as CredentialRecordSavePayload<CredentialOtherMaterial>));
  };

  const deleteRecord = async (record: Draft) => {
    if (tab === 'profile') return;
    if (!await confirm({ title: `删除${labels[tab]}`, description: '该记录和关联原图将永久删除。', danger: true })) return;
    const id = record[idKeys[tab]];
    await run(() => tab === 'certificate' ? credentialLibrary.deleteCertificate(id)
      : tab === 'employee' ? credentialLibrary.deleteEmployee(id)
        : tab === 'project' ? credentialLibrary.deleteProject(id)
          : credentialLibrary.deleteOtherMaterial(id));
  };

  const removeImage = async (image: CredentialImage) => {
    if (image.ownerType !== 'profile') {
      setRemovedImages((list) => [...list, image.imageId]);
      return;
    }
    if (!await confirm({ title: '删除原图', description: `确定删除“${image.originalName}”？`, danger: true })) return;
    await run(() => credentialLibrary.deleteImage(image.imageId));
  };

  const renderImages = (images: CredentialImage[], editable: boolean) => <div className="credential-images">
    {images.map((image) => <div className="credential-image" key={image.imageId}>
      <img src={image.assetUrl} alt={image.customName || image.originalName} />
      <span title={image.originalName}>{imageFieldOptions[tab].find((field) => field.value === image.fieldKey)?.label || '原图'} · {image.customName || image.originalName}</span>
      {editable && <button type="button" disabled={busy} onClick={() => void removeImage(image)}>删除</button>}
    </div>)}
    {newImages.map((filePath, index) => <div className="credential-image" key={`${filePath}-${index}`}><span>{filePath.split(/[\\/]/).at(-1)}</span><button type="button" onClick={() => setNewImages((list) => list.filter((_, item) => item !== index))}>移除</button></div>)}
  </div>;

  return <div className="credential-page">
    <header className="credential-header"><div><h2>资信库</h2><p>集中维护企业、证书、人员和项目业绩，资料保存在本机工作区。</p></div><strong>{profile.companyName || '未填写企业名称'}</strong></header>
    <nav className="credential-tabs" aria-label="资信库分类">{(Object.keys(labels) as Tab[]).map((item) => <button type="button" key={item} className={tab === item ? 'is-active' : ''} onClick={() => { setTab(item); setDraft(null); setNewImages([]); setRemovedImages([]); setSelectedImageField(imageFields[item]); }}>{labels[item]}</button>)}</nav>
    <div className="credential-content">
      {tab === 'profile' ? <section className="credential-card">
        <h3>企业资料</h3><div className="credential-form">{profileFields.map((field) => <label key={field.key}><span>{field.label}</span>{field.multiline ? <textarea value={String(profile[field.key as keyof CredentialLibraryProfile] || '')} onChange={(event) => setProfile((value) => ({ ...value, [field.key]: event.target.value }))} /> : <input value={String(profile[field.key as keyof CredentialLibraryProfile] || '')} onChange={(event) => setProfile((value) => ({ ...value, [field.key]: event.target.value }))} />}</label>)}</div>
        <div className="credential-actions"><button type="button" className="primary-action" disabled={busy} onClick={() => void run(() => credentialLibrary.saveProfile(profile))}>保存企业资料</button><select aria-label="资料图片分类" value={selectedImageField} disabled={newImages.length > 0} onChange={(event) => setSelectedImageField(event.target.value as CredentialImageFieldKey)}>{imageFieldOptions.profile.map((field) => <option key={field.value} value={field.value}>{field.label}</option>)}</select><button type="button" className="secondary-action" disabled={busy} onClick={() => void selectImages()}>选择图片</button><button type="button" className="secondary-action" disabled={busy || newImages.length === 0} onClick={() => void run(() => credentialLibrary.addProfileImages(selectedImageField, newImages))}>上传所选图片</button></div>
        {renderImages((snapshot?.images || []).filter((image) => image.ownerType === 'profile'), true)}
      </section> : <section className="credential-card">
        <div className="credential-list-head"><h3>{labels[tab]}</h3><button type="button" className="primary-action" onClick={() => { setDraft({}); setNewImages([]); setRemovedImages([]); }}>新增{labels[tab]}</button></div>
        {draft ? <div className="credential-editor"><h4>{currentId ? '编辑' : '新增'}{labels[tab]}</h4><div className="credential-form">{recordFields[tab].map((field) => <label key={field.key}><span>{field.label}</span>{field.options ? <select value={draft[field.key] || ''} onChange={(event) => setDraft((value) => ({ ...value, [field.key]: event.target.value }))}>{field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : field.multiline ? <textarea value={draft[field.key] || ''} onChange={(event) => setDraft((value) => ({ ...value, [field.key]: event.target.value }))} /> : <input value={draft[field.key] || ''} onChange={(event) => setDraft((value) => ({ ...value, [field.key]: event.target.value }))} />}</label>)}</div><div className="credential-actions"><select aria-label="原图分类" value={selectedImageField} disabled={newImages.length > 0} onChange={(event) => setSelectedImageField(event.target.value as CredentialImageFieldKey)}>{imageFieldOptions[tab].map((field) => <option key={field.value} value={field.value}>{field.label}</option>)}</select><button type="button" className="secondary-action" onClick={() => void selectImages()}>添加原图</button><button type="button" className="primary-action" disabled={busy} onClick={() => void saveRecord()}>保存</button><button type="button" className="secondary-action" onClick={() => { setDraft(null); setNewImages([]); setRemovedImages([]); }}>取消</button></div>{renderImages(currentImages, true)}</div> : null}
        <div className="credential-list">{records.length === 0 ? <p>暂无资料</p> : records.map((record) => { const data = record as unknown as Draft; return <div className="credential-row" key={data[idKeys[tab]]}><div><strong>{data.name || data.projectName || '未命名'}</strong><small>{data.number || data.position || data.customerName || data.note || ''}</small></div><div><button type="button" onClick={() => { setDraft({ ...data }); setNewImages([]); setRemovedImages([]); }}>编辑</button><button type="button" onClick={() => void deleteRecord(data)}>删除</button></div></div>; })}</div>
      </section>}
    </div>
  </div>;
}
export default CredentialLibraryPage;

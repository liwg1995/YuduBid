import useListTableViewport from '../../../shared/ui/useListTableViewport';
import EnterpriseSearchInput from '../../../shared/ui/EnterpriseSearchInput';
import { Table } from 'antd';
import { useLayoutEffect, type RefObject } from 'react';
import type { ColumnsType } from 'antd/es/table';
import EnterpriseUiProvider from '../../../shared/ui/EnterpriseUiProvider';
import type { CredentialCompany } from '../types';

interface Props {
  companies: CredentialCompany[];
  query: string;
  page: number;
  sortOrder: 'ascend' | 'descend' | null;
  scrollPosition: RefObject<number>;
  returnCompanyId: RefObject<string>;
  disabled: boolean;
  onQueryChange: (value: string) => void;
  onPageChange: (value: number) => void;
  onSortChange: (value: 'ascend' | 'descend' | null) => void;
  onEnter: (id: string) => void;
  onDelete: (company: CredentialCompany) => void;
}

const dateFormatter = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '时间未知' : dateFormatter.format(date);
}

export default function CredentialCompanyList({ companies, query, page, sortOrder, scrollPosition, returnCompanyId, disabled, onQueryChange, onPageChange, onSortChange, onEnter, onDelete }: Props) {
  const filtered = companies.filter((company) => company.companyName.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const { scrollRef, currentPage } = useListTableViewport({ page, total: filtered.length, resetKey: JSON.stringify([query, sortOrder]), onPageChange, scrollPosition });
  useLayoutEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollPosition.current;
    const previousButton = Array.from(scrollRef.current.querySelectorAll<HTMLButtonElement>('[data-company-id]')).find((button) => button.dataset.companyId === returnCompanyId.current);
    previousButton?.focus({ preventScroll: true });
    returnCompanyId.current = '';
  }, [scrollPosition, returnCompanyId]);
  const columns: ColumnsType<CredentialCompany> = [
    { title: '企业名称', dataIndex: 'companyName', render: (name: string, company) => <button type="button" data-company-id={company.companyId} className="credential-company-title" disabled={disabled} onClick={() => onEnter(company.companyId)}>{name}</button> },
    { title: '最近更新', dataIndex: 'updatedAt', width: 180, sorter: (a, b) => a.updatedAt.localeCompare(b.updatedAt), sortOrder, render: formatDate },
    { title: '创建时间', dataIndex: 'createdAt', width: 180, render: formatDate },
    { title: '操作', key: 'actions', width: 90, fixed: 'right', render: (_, company) => <button type="button" className="credential-company-delete" disabled={disabled} onClick={() => onDelete(company)}>删除</button> },
  ];
  return <EnterpriseUiProvider><div className="credential-company-table">
    <div className="credential-company-filters"><EnterpriseSearchInput aria-label="搜索企业名称" placeholder="搜索企业名称" value={query} allowClear onChange={(event) => { onQueryChange(event.target.value); onPageChange(1); }} /><span aria-live="polite">{filtered.length} / {companies.length} 家企业</span></div>
    <div ref={scrollRef} tabIndex={-1} role="region" aria-label="企业列表" className="credential-company-table-scroll" onScroll={(event) => { scrollPosition.current = event.currentTarget.scrollTop; }}><Table rowKey="companyId" columns={columns} dataSource={filtered} size="middle" scroll={{ x: 680 }} onChange={(_, __, sorter, extra) => { if (extra.action === 'sort' && !Array.isArray(sorter)) { onSortChange(sorter.order || null); onPageChange(1); } }} pagination={{ current: currentPage, pageSize: 20, onChange: onPageChange, showSizeChanger: false, hideOnSinglePage: true }} locale={{ emptyText: <div className="modern-credential-companies-empty"><strong>没有符合条件的企业</strong><p>调整企业名称后重试。</p><button className="secondary-action" type="button" onClick={() => { onQueryChange(''); onPageChange(1); }}>清除搜索</button></div> }} /></div>
  </div></EnterpriseUiProvider>;
}

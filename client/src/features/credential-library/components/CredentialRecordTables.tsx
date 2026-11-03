import { useEffect, useState } from 'react';
import { Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import EnterpriseUiProvider from '../../../shared/ui/EnterpriseUiProvider';
import type { CredentialEmployee, CredentialProject } from '../types';

interface BaseProps<T> {
  records: T[];
  query: string;
  total: number;
  disabled: boolean;
  onClearSearch: () => void;
  onEdit: (record: T) => void;
  onDelete: (record: T) => void;
}

function RecordTable<T extends object>({ records, query, total, onClearSearch, columns, rowKey, name }: Pick<BaseProps<T>, 'records' | 'query' | 'total' | 'onClearSearch'> & { columns: ColumnsType<T>; rowKey: string; name: string }) {
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [query]);
  return <EnterpriseUiProvider><div className="credential-record-table">
    <p className="credential-record-count" aria-live="polite">{records.length} / {total} 条{name}</p>
    <Table rowKey={rowKey} columns={columns} dataSource={records} size="middle" scroll={{ x: 800 }} pagination={{ current: Math.min(page, Math.max(1, Math.ceil(records.length / 20))), pageSize: 20, onChange: setPage, showSizeChanger: false, hideOnSinglePage: true }} locale={{ emptyText: <div className="credential-record-empty"><strong>{query.trim() ? `没有匹配的${name}` : `暂无${name}`}</strong><p>{query.trim() ? '调整搜索条件后重试。' : `使用上方新增按钮录入${name}和证明材料。`}</p>{query.trim() && <button type="button" onClick={onClearSearch}>清除搜索</button>}</div> }} />
  </div></EnterpriseUiProvider>;
}

export function EmployeeRecordsTable(props: BaseProps<CredentialEmployee> & { imageCount: (id: string) => number }) {
  const columns: ColumnsType<CredentialEmployee> = [
    { title: '姓名', key: 'name', sorter: (a, b) => a.name.localeCompare(b.name, 'zh-CN'), render: (_, item) => <div className="credential-record-title"><button type="button" disabled={props.disabled} onClick={() => props.onEdit(item)}>{item.name || '未命名人员'}</button><small>{item.idNumber || '未填写身份证号'}</small></div> },
    { title: '职务 / 职称', key: 'position', width: 160, render: (_, item) => [item.position, item.professionalTitle].filter(Boolean).join(' / ') || '—' },
    { title: '联系电话', dataIndex: 'phone', width: 140, render: (value: string) => value || '—' },
    { title: '学历 / 专业', key: 'education', width: 160, render: (_, item) => [item.education, item.major].filter(Boolean).join(' / ') || '—' },
    { title: '资料图片', key: 'images', width: 100, align: 'right', render: (_, item) => `${props.imageCount(item.employeeId)} 张` },
    { title: '操作', key: 'actions', width: 80, fixed: 'right', render: (_, item) => <button type="button" className="credential-record-delete" disabled={props.disabled} onClick={() => props.onDelete(item)} aria-label={`删除员工 ${item.name || '未命名人员'}`}>删除</button> },
  ];
  return <RecordTable {...props} columns={columns} rowKey="employeeId" name="员工档案" />;
}

const projectTypes: Record<string, string> = { service: '服务', goods: '货物', construction: '工程' };
export function ProjectRecordsTable(props: BaseProps<CredentialProject>) {
  const columns: ColumnsType<CredentialProject> = [
    { title: '项目名称', key: 'name', sorter: (a, b) => a.projectName.localeCompare(b.projectName, 'zh-CN'), render: (_, item) => <div className="credential-record-title"><button type="button" disabled={props.disabled} onClick={() => props.onEdit(item)}>{item.projectName || '未命名项目'}</button><small>{item.projectNumber || '未填写项目编号'}</small></div> },
    { title: '客户 / 类型', key: 'customer', width: 200, render: (_, item) => [item.customerName, projectTypes[item.projectType]].filter(Boolean).join(' / ') || '—' },
    { title: '负责人', dataIndex: 'projectManager', width: 120, render: (value: string) => value || '—' },
    { title: '合同金额', dataIndex: 'contractAmount', width: 120, render: (value: string) => value || '—' },
    { title: '状态', dataIndex: 'projectStatus', width: 100, render: (value: string) => value || '—' },
    { title: '操作', key: 'actions', width: 80, fixed: 'right', render: (_, item) => <button type="button" className="credential-record-delete" disabled={props.disabled} onClick={() => props.onDelete(item)} aria-label={`删除业绩 ${item.projectName || '未命名项目'}`}>删除</button> },
  ];
  return <RecordTable {...props} columns={columns} rowKey="projectId" name="项目业绩" />;
}

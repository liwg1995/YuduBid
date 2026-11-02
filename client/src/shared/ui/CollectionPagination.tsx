import { Pagination } from 'antd';
import EnterpriseUiProvider from './EnterpriseUiProvider';
import { getStoredUiAppearance } from '../uiAppearance';
import './collectionPagination.css';

export default function CollectionPagination({ page, total, onChange, pageSize = 20 }: { page: number; total: number; onChange: (page: number) => void; pageSize?: number }) {
  if (total <= pageSize) return null;
  const pages = Math.ceil(total / pageSize);
  const current = Math.max(1, Math.min(pages, page));
  return <nav className="yb-collection-pagination" aria-label="项目列表分页"><span>共 {total} 项，每页 {pageSize} 项</span>{getStoredUiAppearance() === 'modern' ? <EnterpriseUiProvider><Pagination current={current} total={total} pageSize={pageSize} showSizeChanger={false} onChange={onChange} /></EnterpriseUiProvider> : <div><button type="button" className="secondary-action" disabled={current === 1} onClick={() => onChange(current - 1)}>上一页</button><span>{current} / {pages}</span><button type="button" className="secondary-action" disabled={current === pages} onClick={() => onChange(current + 1)}>下一页</button></div>}</nav>;
}

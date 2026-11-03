import { Alert, Button, Descriptions, Drawer } from 'antd';
import type { ReactNode } from 'react';
import EnterpriseUiProvider from './EnterpriseUiProvider';
import './projectDetailsDrawer.css';

/** 只预览项目索引中已有资料，不切换或写入当前工作区。 */
export default function ProjectDetailsDrawer({ open, onClose, items, onEnter, enterDisabled = false, entering = false, error = '' }: {
  open: boolean; onClose: () => void;
  items: { key: string; label: string; children: ReactNode }[];
  onEnter?: () => void; enterDisabled?: boolean; entering?: boolean; error?: string;
}) {
  return <EnterpriseUiProvider><Drawer rootClassName="yb-project-details-drawer" title="项目详情" open={open} onClose={onClose} size={480}
    extra={onEnter && <Button type="primary" onClick={onEnter} loading={entering} disabled={enterDisabled}>{entering ? '正在进入' : '进入项目'}</Button>}>
    <>{error && <Alert type="error" showIcon title="进入项目失败" description={error} style={{ marginBottom: 16 }} />}<Descriptions column={1} items={items} styles={{ content: { overflowWrap: 'anywhere' } }} /></>
  </Drawer></EnterpriseUiProvider>;
}

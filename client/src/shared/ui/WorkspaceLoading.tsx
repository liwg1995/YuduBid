/** 页面与模块共用读取状态；不展示估算百分比或可编辑的空表单。 */
export default function WorkspaceLoading({ title = '正在读取工作区', description = '正在恢复当前模块的本地数据…' }: { title?: string; description?: string }) {
  return <div className="section-loading-state" role="status" aria-live="polite" aria-busy="true">
    <span className="section-loading-indicator" aria-hidden="true" />
    <strong>{title}</strong><small>{description}</small>
  </div>;
}

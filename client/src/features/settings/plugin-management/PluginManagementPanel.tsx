import { useCallback, useEffect, useState } from 'react';
import type { InstalledPluginRecord } from '../../../shared/types';
import { useAppDialog, useToast } from '../../../shared/ui';

function statusLabel(plugin: InstalledPluginRecord) {
  if (plugin.status === 'error') return '运行异常';
  if (plugin.status === 'running') return '运行中';
  return '已停止';
}

export default function PluginManagementPanel() {
  const [plugins, setPlugins] = useState<InstalledPluginRecord[]>([]);
  const [busyAction, setBusyAction] = useState('');
  const { showToast } = useToast();
  const appDialog = useAppDialog();

  const loadPlugins = useCallback(async () => {
    try {
      setPlugins(await window.yibiao?.plugins.list() || []);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '读取插件列表失败', 'error');
    }
  }, [showToast]);

  useEffect(() => {
    void loadPlugins();
    const unsubscribe = window.yibiao?.plugins.onEvent(() => void loadPlugins());
    return () => unsubscribe?.();
  }, [loadPlugins]);

  const importPlugin = async () => {
    try {
      setBusyAction('import');
      const result = await window.yibiao?.plugins.importPackage();
      if (result?.canceled) return;
      setPlugins(result?.plugins || []);
      showToast(result?.plugin ? `${result.plugin.name} 已导入，当前为停止状态` : '插件已导入', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '导入插件失败', 'error');
    } finally {
      setBusyAction('');
    }
  };

  const togglePlugin = async (plugin: InstalledPluginRecord) => {
    try {
      setBusyAction(`toggle:${plugin.id}`);
      const result = plugin.enabled
        ? await window.yibiao?.plugins.disable(plugin.id)
        : await window.yibiao?.plugins.enable(plugin.id);
      setPlugins(result?.plugins || []);
      showToast(`${plugin.name} 已${plugin.enabled ? '停用' : '启用'}`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '更新插件状态失败', 'error');
      await loadPlugins();
    } finally {
      setBusyAction('');
    }
  };

  const deletePlugin = async (plugin: InstalledPluginRecord) => {
    const confirmed = await appDialog.confirm({
      title: '删除插件',
      description: `确定删除“${plugin.name}”吗？插件数据将被保留，重新导入后可继续使用。`,
      confirmLabel: '删除',
      danger: true,
    });
    if (!confirmed) return;
    try {
      setBusyAction(`delete:${plugin.id}`);
      const result = await window.yibiao?.plugins.uninstall(plugin.id, { removeData: false });
      setPlugins(result?.plugins || []);
      showToast(`${plugin.name} 已删除`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '删除插件失败', 'error');
    } finally {
      setBusyAction('');
    }
  };

  return (
    <section className="settings-page-section plugin-management-section">
      <div className="settings-section-title plugin-management-title">
        <span />
        <div>
          <strong>插件管理</strong>
          <small>连接更多能力，让禹都标书工具持续进化。</small>
        </div>
        <button type="button" className="inline-action" onClick={() => void importPlugin()} disabled={Boolean(busyAction)}>
          {busyAction === 'import' ? '正在导入…' : '导入插件'}
        </button>
      </div>

      {plugins.length === 0 ? (
        <div className="plugin-promotion">
          <strong>一个工具，更多可能</strong>
          <p>按需导入插件，为工作台带来持续扩展的智能体验。</p>
        </div>
      ) : (
        <div className="plugin-list">
          {plugins.map((plugin) => {
            const itemBusy = busyAction.endsWith(plugin.id);
            return (
              <article className={`plugin-list-item is-${plugin.status}`} key={plugin.id}>
                <div className="plugin-list-main">
                  <div className="plugin-list-heading">
                    <strong>{plugin.name}</strong>
                    <em>{statusLabel(plugin)}</em>
                  </div>
                  <p>版本 {plugin.version}</p>
                  {plugin.lastError ? <div className="plugin-error-message" role="alert">{plugin.lastError}</div> : null}
                </div>
                <div className="plugin-list-actions">
                  <button type="button" className="inline-action" disabled={Boolean(busyAction)} onClick={() => void togglePlugin(plugin)}>
                    {itemBusy ? '处理中…' : plugin.enabled ? '停用' : '启用'}
                  </button>
                  <button type="button" className="secondary-action is-danger" disabled={Boolean(busyAction)} onClick={() => void deletePlugin(plugin)}>
                    删除
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

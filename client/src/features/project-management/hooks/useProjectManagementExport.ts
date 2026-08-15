import { useState } from 'react';
import type { ToastType } from '../../../shared/ui/ToastProvider';
import type { ProjectManagementProfile } from '../types';
import {
  moduleDocumentTitles,
  modules,
  type ProjectManagementExportProgress,
} from '../model/projectManagementPageModel';
import {
  demoteMarkdownHeadings,
  normalizeProjectManagementExportContent,
} from '../model/projectManagementExportModel';

interface UseProjectManagementExportParams {
  profile: ProjectManagementProfile;
  moduleResults: Record<string, string>;
  showToast: (message: string, type?: ToastType) => number;
}
interface ProjectManagementWordOutlineItem {
  id: string;
  title: string;
  description: string;
  hideTitle: boolean;
  content: string;
}

export function useProjectManagementExport({
  profile,
  moduleResults,
  showToast,
}: UseProjectManagementExportParams) {
  const [exportProgress, setExportProgress] = useState<ProjectManagementExportProgress | null>(null);
  const exporting = exportProgress?.phase === 'running';

  async function exportProjectManagementWord(params: {
    title: string;
    documentTitle: string;
    moduleId: string;
    outline: ProjectManagementWordOutlineItem[];
    emptyMessage?: string;
  }) {
    const exportableOutline = params.outline.filter((item) => item.content.trim());
    if (!exportableOutline.length) {
      showToast(params.emptyMessage || '请先生成或填写可导出的内容', 'info');
      return;
    }
    if (!window.yibiao?.export) {
      showToast('当前环境未注入导出服务', 'error');
      return;
    }

    const requestId = `project-management-${Date.now()}`;
    let unsubscribe: (() => void) | undefined;
    try {
      setExportProgress({
        requestId,
        moduleId: params.moduleId,
        phase: 'running',
        progress: 1,
        message: '正在准备导出 Word',
      });
      unsubscribe = window.yibiao.export.onWordExportProgress((event) => {
        if (event.requestId && event.requestId !== requestId) return;
        setExportProgress({ ...event, moduleId: params.moduleId });
      });
      const result = await window.yibiao.export.exportWord({
        requestId,
        project_name: params.title,
        document_title: params.documentTitle,
        document_profile: 'project-management',
        project_profile: profile,
        outline: exportableOutline,
      });
      if (result.canceled) {
        setExportProgress({
          requestId,
          moduleId: params.moduleId,
          phase: 'canceled',
          progress: 0,
          message: '已取消导出',
        });
        showToast('已取消导出', 'info');
        return;
      }
      if (result.success) {
        setExportProgress({
          requestId,
          moduleId: params.moduleId,
          phase: 'success',
          progress: 100,
          message: result.message || 'Word 已导出，请打开文档核对图片、表格和版式。',
        });
        showToast(result.message || '项目管理文档已导出 Word', 'success');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '导出 Word 失败';
      setExportProgress({
        requestId,
        moduleId: params.moduleId,
        phase: 'error',
        progress: 100,
        message,
      });
      showToast(message, 'error');
    } finally {
      unsubscribe?.();
    }
  }

  async function exportModuleWord(moduleId: string) {
    const module = modules.find((item) => item.id === moduleId);
    if (!module) {
      showToast('未找到需要导出的项目管理模块', 'error');
      return;
    }
    const documentTitle = moduleDocumentTitles[moduleId] || module.title;
    const content = normalizeProjectManagementExportContent(moduleResults[moduleId] || '', documentTitle);
    if (!content) {
      showToast('请先生成或填写可导出的内容', 'info');
      return;
    }
    const title = profile.projectName ? `${profile.projectName}-${documentTitle}` : documentTitle;
    return exportProjectManagementWord({
      title,
      documentTitle,
      moduleId,
      outline: [{
        id: `project-management-${moduleId}`,
        title: documentTitle,
        description: '',
        hideTitle: false,
        content: demoteMarkdownHeadings(content),
      }],
    });
  }

  async function exportAllProjectManagementWord() {
    const outline = modules
      .map((module) => {
        const documentTitle = moduleDocumentTitles[module.id] || module.title;
        const content = normalizeProjectManagementExportContent(moduleResults[module.id] || '', documentTitle);
        return {
          id: `project-management-${module.id}`,
          title: documentTitle,
          description: '',
          hideTitle: false,
          content: demoteMarkdownHeadings(content),
        };
      })
      .filter((item) => item.content.trim());

    const skippedCount = modules.length - outline.length;
    if (skippedCount > 0 && outline.length > 0) {
      showToast(`将导出 ${outline.length} 个已生成模块，跳过 ${skippedCount} 个空模块。`, 'info');
    }

    const documentTitle = '项目管理全套文档';
    const title = profile.projectName ? `${profile.projectName}-${documentTitle}` : documentTitle;
    return exportProjectManagementWord({
      title,
      documentTitle,
      moduleId: 'all',
      outline,
      emptyMessage: '请先至少生成一个项目管理模块，再导出全套 Word',
    });
  }

  return {
    exportProgress,
    exporting,
    exportModuleWord,
    exportAllProjectManagementWord,
  };
}

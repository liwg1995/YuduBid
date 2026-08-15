import { useEffect, useMemo, useRef, useState } from 'react';
import type { ToastType } from '../../../shared/ui/ToastProvider';
import type {
  ProjectManagementDictionaries,
  ProjectManagementProfile,
  ProjectManagementProjectRecord,
  ProjectManagementState,
} from '../types';
import {
  builtInProjectTypes,
  projectManagementOpenWorkbenchKey,
  projectSearchText,
} from '../model/projectManagementPageModel';

type ShowToast = (message: string, type?: ToastType) => void;

interface UseProjectManagementLifecycleOptions {
  currentProjectId?: string;
  applyState: (state: ProjectManagementState) => void;
  resetActiveModule: () => void;
  showToast: ShowToast;
}

const emptyProjectProfile: Partial<ProjectManagementProfile> = {
  projectName: '',
  clientName: '',
  vendorName: '',
  projectType: 'IT服务项目',
  projectGroup: '',
};

export function useProjectManagementLifecycle({
  currentProjectId,
  applyState,
  resetActiveModule,
  showToast,
}: UseProjectManagementLifecycleOptions) {
  const applyStateRef = useRef(applyState);
  const [viewMode, setViewMode] = useState<'list' | 'workbench'>('list');
  const [projectSearchKeyword, setProjectSearchKeyword] = useState('');
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [dictionaries, setDictionaries] = useState<ProjectManagementDictionaries>({ projectTypes: [], projectGroups: [] });
  const [loading, setLoading] = useState(true);
  const [projectList, setProjectList] = useState<ProjectManagementProjectRecord[]>([]);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [deleteProjectOpen, setDeleteProjectOpen] = useState(false);
  const [newProjectProfile, setNewProjectProfile] = useState<Partial<ProjectManagementProfile>>(emptyProjectProfile);

  applyStateRef.current = applyState;

  const projectTypeOptions = useMemo(
    () => Array.from(new Set([...builtInProjectTypes, ...dictionaries.projectTypes])),
    [dictionaries.projectTypes],
  );
  const projectGroupOptions = useMemo(
    () => Array.from(new Set(dictionaries.projectGroups)),
    [dictionaries.projectGroups],
  );
  const filteredProjectList = useMemo(() => {
    const keyword = projectSearchKeyword.trim().toLowerCase();
    const visibleProjects = projectList.filter((project) => (
      project.name !== '未命名项目'
      || project.completedCount > 0
      || project.clientName
      || project.vendorName
      || project.isActive
    ));
    if (!keyword) return visibleProjects;
    return visibleProjects.filter((project) => projectSearchText(project).includes(keyword));
  }, [projectList, projectSearchKeyword]);

  useEffect(() => {
    let alive = true;
    const unsubscribe = window.yibiao?.projectManagement.onEvent((nextState) => {
      if (alive) applyStateRef.current(nextState);
    });

    Promise.all([
      window.yibiao?.projectManagement.loadState(),
      window.yibiao?.projectManagement.listProjects(),
      window.yibiao?.projectManagement.readDictionaries(),
    ])
      .then(([nextState, projects, nextDictionaries]) => {
        if (alive && nextState) applyStateRef.current(nextState);
        if (alive && projects?.projects) setProjectList(projects.projects);
        if (alive && nextDictionaries) setDictionaries(nextDictionaries);
        if (alive && window.sessionStorage.getItem(projectManagementOpenWorkbenchKey) === '1') {
          window.sessionStorage.removeItem(projectManagementOpenWorkbenchKey);
          setViewMode('workbench');
        }
      })
      .catch((error) => showToast(error instanceof Error ? error.message : '读取项目管理工作区失败', 'error'))
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
      unsubscribe?.();
    };
  }, [showToast]);

  useEffect(() => {
    const visibleIds = new Set(filteredProjectList.map((project) => project.id));
    setSelectedProjectIds((current) => current.filter((id) => visibleIds.has(id)));
  }, [filteredProjectList]);

  async function refreshProjectList() {
    const projects = await window.yibiao?.projectManagement.listProjects();
    if (projects?.projects) setProjectList(projects.projects);
  }

  async function refreshDictionaries() {
    const nextDictionaries = await window.yibiao?.projectManagement.readDictionaries();
    if (nextDictionaries) setDictionaries(nextDictionaries);
  }

  async function switchProject(projectId: string) {
    if (!projectId || projectId === currentProjectId) return;
    try {
      const nextState = await window.yibiao?.projectManagement.switchProject(projectId);
      if (nextState) applyStateRef.current(nextState);
      await refreshProjectList();
      resetActiveModule();
      showToast('已进入所选项目', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '切换项目失败', 'error');
    }
  }

  async function enterProject(projectId: string) {
    if (!projectId) return;
    if (projectId !== currentProjectId) await switchProject(projectId);
    setViewMode('workbench');
  }

  async function createProject() {
    const profileDraft = {
      ...newProjectProfile,
      projectName: String(newProjectProfile.projectName || '').trim(),
      clientName: String(newProjectProfile.clientName || '').trim(),
      vendorName: String(newProjectProfile.vendorName || '').trim(),
      projectType: String(newProjectProfile.projectType || 'IT服务项目').trim() || 'IT服务项目',
      projectGroup: String(newProjectProfile.projectGroup || '').trim(),
      currentStage: '项目启动',
    };
    if (!profileDraft.projectName) {
      showToast('请先填写项目名称', 'error');
      return;
    }
    try {
      const result = await window.yibiao?.projectManagement.createProject({ profile: profileDraft });
      if (result?.state) applyStateRef.current(result.state);
      if (result?.projects?.projects) setProjectList(result.projects.projects);
      setCreateProjectOpen(false);
      await refreshDictionaries();
      setNewProjectProfile(emptyProjectProfile);
      resetActiveModule();
      setViewMode('workbench');
      showToast('新项目已创建，可以开始填写项目档案', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '新建项目失败', 'error');
    }
  }

  async function deleteCurrentProject() {
    if (!currentProjectId) return;
    try {
      const result = await window.yibiao?.projectManagement.deleteProject(currentProjectId);
      if (result?.state) applyStateRef.current(result.state);
      if (result?.projects?.projects) setProjectList(result.projects.projects);
      setDeleteProjectOpen(false);
      resetActiveModule();
      showToast('项目已删除', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '删除项目失败', 'error');
    }
  }

  function toggleProjectSelection(projectId: string) {
    setSelectedProjectIds((current) => current.includes(projectId)
      ? current.filter((id) => id !== projectId)
      : [...current, projectId]);
  }

  function toggleAllVisibleProjects(checked: boolean) {
    setSelectedProjectIds(checked ? filteredProjectList.map((project) => project.id) : []);
  }

  async function deleteSelectedProjects() {
    if (!selectedProjectIds.length) {
      showToast('请先选择要删除的项目', 'info');
      return;
    }
    try {
      const result = await window.yibiao?.projectManagement.deleteProjects(selectedProjectIds);
      if (result?.state) applyStateRef.current(result.state);
      if (result?.projects?.projects) setProjectList(result.projects.projects);
      setSelectedProjectIds([]);
      setViewMode('list');
      showToast('已删除所选项目', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '批量删除项目失败', 'error');
    }
  }

  async function deleteProjectFromList(projectId: string) {
    try {
      const result = await window.yibiao?.projectManagement.deleteProjects([projectId]);
      if (result?.state) applyStateRef.current(result.state);
      if (result?.projects?.projects) setProjectList(result.projects.projects);
      setSelectedProjectIds((current) => current.filter((id) => id !== projectId));
      showToast('项目已删除', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '删除项目失败', 'error');
    }
  }

  return {
    createProject,
    createProjectOpen,
    deleteCurrentProject,
    deleteProjectFromList,
    deleteProjectOpen,
    deleteSelectedProjects,
    dictionaries,
    enterProject,
    filteredProjectList,
    loading,
    newProjectProfile,
    projectGroupOptions,
    projectList,
    projectSearchKeyword,
    projectTypeOptions,
    refreshDictionaries,
    refreshProjectList,
    selectedProjectIds,
    setCreateProjectOpen,
    setDeleteProjectOpen,
    setNewProjectProfile,
    setProjectSearchKeyword,
    setViewMode,
    toggleAllVisibleProjects,
    toggleProjectSelection,
    viewMode,
  };
}

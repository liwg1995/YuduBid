const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createPresalesWorkbenchService } = require('../electron/services/presalesWorkbenchService.cjs');
const { createProjectManagementService } = require('../electron/services/projectManagementService.cjs');

function assertRecovered(label, state) {
  if (state.task?.status !== 'error' || state.task?.message !== '上次任务未完成，请重新执行。') {
    throw new Error(`${label} interrupted task recovery failed: ${JSON.stringify(state.task)}`);
  }
}

function writeInterruptedTask(filePath, state, task) {
  fs.writeFileSync(filePath, JSON.stringify({ ...state, task }, null, 2), 'utf-8');
}

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yibiao-task-recovery-'));
const app = { getPath: () => testRoot };

try {
  const presales = createPresalesWorkbenchService({ app, fileService: {}, aiService: {} });
  const presalesState = presales.loadState();
  const presalesPath = path.join(
    testRoot,
    'workspace',
    'presales-workbench',
    'projects',
    `${presalesState.projectId}.json`,
  );
  writeInterruptedTask(presalesPath, presalesState, {
    id: 'stale-presales',
    type: 'analysis',
    status: 'running',
    progress: 25,
    message: 'running',
  });
  const restartedPresales = createPresalesWorkbenchService({ app, fileService: {}, aiService: {} });
  assertRecovered('presales-workbench', restartedPresales.loadState());

  const configStore = { load: () => ({}) };
  const projectManagement = createProjectManagementService({ app, aiService: {}, configStore });
  const projectState = projectManagement.loadState();
  const projectPath = path.join(
    testRoot,
    'workspace',
    'project-management',
    'projects',
    `${projectState.projectId}.json`,
  );
  writeInterruptedTask(projectPath, projectState, {
    id: 'stale-project-management',
    type: 'planning',
    status: 'running',
    progress: 35,
    message: 'running',
  });
  const restartedProjectManagement = createProjectManagementService({ app, aiService: {}, configStore });
  assertRecovered('project-management', restartedProjectManagement.loadState());

  console.log('interrupted task recovery verification passed');
} finally {
  fs.rmSync(testRoot, { recursive: true, force: true });
}

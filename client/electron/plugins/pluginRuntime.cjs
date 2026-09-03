'use strict';

const path = require('node:path');
const { fork } = require('node:child_process');
const { HOST_API_VERSION, HOST_ID } = require('./pluginManifest.cjs');

const START_TIMEOUT_MS = 8000;
const UI_REQUEST_TIMEOUT_MS = 310000;

function createChildEnvironment() {
  const allowedNames = ['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR', 'LANG', 'LC_ALL'];
  const environment = { ELECTRON_RUN_AS_NODE: '1', NODE_ENV: 'production' };
  for (const name of allowedNames) {
    if (process.env[name]) environment[name] = process.env[name];
  }
  return environment;
}

function createPluginRuntime({ app, capabilityRegistry, onStatusChange }) {
  const processes = new Map();
  const pendingUiRequests = new Map();

  function isRunning(pluginId) {
    return processes.has(pluginId);
  }

  function rejectPendingUiRequests(pluginId, error) {
    for (const [id, pending] of pendingUiRequests) {
      if (pending.pluginId !== pluginId) continue;
      clearTimeout(pending.timer);
      pendingUiRequests.delete(id);
      pending.reject(error);
    }
  }

  function request(pluginId, method, params = {}) {
    const child = processes.get(pluginId);
    if (!child?.connected) return Promise.reject(new Error('插件未运行'));
    const id = `ui-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingUiRequests.delete(id);
        reject(new Error(`插件请求超时：${method}`));
      }, UI_REQUEST_TIMEOUT_MS);
      pendingUiRequests.set(id, { pluginId, resolve, reject, timer });
      child.send({ id, type: 'ui-request', method, params }, (error) => {
        if (!error) return;
        clearTimeout(timer);
        pendingUiRequests.delete(id);
        reject(error);
      });
    });
  }

  async function handleHostRequest(plugin, child, message) {
    const response = { id: message.id, type: 'host-response' };
    try {
      if (message.method === 'host.getInfo') {
        child.send({ ...response, ok: true, result: { id: HOST_ID, version: app.getVersion(), apiVersion: HOST_API_VERSION } });
        return;
      }
      if (message.method === 'capability.list') {
        child.send({ ...response, ok: true, result: capabilityRegistry.list() });
        return;
      }
      if (message.method === 'capability.invoke') {
        const result = await capabilityRegistry.invoke(plugin, message.params?.capabilityId, message.params?.args);
        child.send({ ...response, ok: true, result });
        return;
      }
      throw new Error(`宿主方法未开放：${message.method || 'unknown'}`);
    } catch (error) {
      child.send({ ...response, ok: false, error: { code: 'HOST_REQUEST_FAILED', message: error.message || String(error) } });
    }
  }

  function start(plugin) {
    if (processes.has(plugin.manifest.id)) return Promise.resolve({ running: true });
    const mainEntry = path.join(plugin.installDir, plugin.manifest.entry.main);

    return new Promise((resolve, reject) => {
      const child = fork(mainEntry, [], {
        cwd: plugin.installDir,
        env: createChildEnvironment(),
        execPath: process.execPath,
        execArgv: [],
        silent: true,
      });
      let settled = false;
      let stderr = '';

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill();
        reject(new Error('插件启动超时，未完成 Host Protocol 握手'));
      }, START_TIMEOUT_MS);

      child.stderr?.on('data', (chunk) => {
        stderr = `${stderr}${String(chunk)}`.slice(-4000);
      });

      child.on('message', (message) => {
        if (message?.type === 'ui-response' && typeof message.id === 'string') {
          const pending = pendingUiRequests.get(message.id);
          if (!pending || pending.pluginId !== plugin.manifest.id) return;
          clearTimeout(pending.timer);
          pendingUiRequests.delete(message.id);
          if (message.ok) pending.resolve(message.result);
          else pending.reject(Object.assign(new Error(message.error?.message || '插件请求失败'), { code: message.error?.code || 'PLUGIN_REQUEST_FAILED' }));
          return;
        }
        if (message?.type === 'plugin-ready' && !settled) {
          if (message.pluginId !== plugin.manifest.id || message.apiVersion !== HOST_API_VERSION) {
            settled = true;
            clearTimeout(timer);
            child.kill();
            reject(new Error('插件握手信息与 Manifest 不一致'));
            return;
          }
          settled = true;
          clearTimeout(timer);
          processes.set(plugin.manifest.id, child);
          onStatusChange?.(plugin.manifest.id, { status: 'running', lastError: '' });
          resolve({ running: true });
          return;
        }
        if (message?.type === 'host-request' && typeof message.id === 'string') {
          void handleHostRequest(plugin, child, message);
        }
      });

      child.once('error', (error) => {
        clearTimeout(timer);
        const isCurrentProcess = processes.get(plugin.manifest.id) === child;
        if (isCurrentProcess) {
          processes.delete(plugin.manifest.id);
          rejectPendingUiRequests(plugin.manifest.id, error);
          onStatusChange?.(plugin.manifest.id, { status: 'error', lastError: error.message || String(error) });
        }
        if (!settled) {
          settled = true;
          reject(error);
        }
      });

      child.once('exit', (code, signal) => {
        clearTimeout(timer);
        const isCurrentProcess = processes.get(plugin.manifest.id) === child;
        if (isCurrentProcess) processes.delete(plugin.manifest.id);
        const errorMessage = code === 0 || signal === 'SIGTERM'
          ? ''
          : `插件进程异常退出（code=${code ?? 'null'}, signal=${signal || 'none'}）${stderr ? `：${stderr.trim()}` : ''}`;
        if (isCurrentProcess) {
          rejectPendingUiRequests(plugin.manifest.id, new Error(errorMessage || '插件已停止'));
          onStatusChange?.(plugin.manifest.id, { status: errorMessage ? 'error' : 'stopped', lastError: errorMessage });
        }
        if (!settled) {
          settled = true;
          reject(new Error(errorMessage || '插件在完成握手前退出'));
        }
      });

      child.send({
        type: 'host-init',
        host: { id: HOST_ID, version: app.getVersion(), apiVersion: HOST_API_VERSION },
        plugin: { id: plugin.manifest.id, version: plugin.manifest.version },
      });
    });
  }

  function stop(pluginId) {
    const child = processes.get(pluginId);
    if (!child) return { running: false };
    processes.delete(pluginId);
    rejectPendingUiRequests(pluginId, new Error('插件已停止'));
    child.kill('SIGTERM');
    return { running: false };
  }

  function stopAll() {
    for (const pluginId of [...processes.keys()]) stop(pluginId);
  }

  return { isRunning, start, stop, stopAll, request };
}

module.exports = { createPluginRuntime };

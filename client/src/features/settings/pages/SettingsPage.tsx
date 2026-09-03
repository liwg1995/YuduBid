import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useState } from 'react';
import brandProducerLogo from '../../../assets/brand-producer-logo.svg';
import { configurableFeatureModules } from '../../../app/menuConfig';
import { FloatingToolbar, InputWithAction, MarkdownRenderer, useToast } from '../../../shared/ui';
import type { FloatingToolbarGroup } from '../../../shared/ui';
import type { ClientConfig, FeatureModuleId, FeatureModuleSettings, FileParserProvider, ImageModelConfig, ImageModelProfiles, ImageModelProvider, ImageModelStatus, LatestReleaseInfo, ModelCapabilityInfo, SkillSettings, TextModelConfig, TextModelProfiles, TextModelProvider, UpdateProgressEvent, UsageStatsSummary, UsageTrendRange } from '../../../shared/types';
import type { SettingsPageState } from '../types';
import PluginManagementPanel from '../plugin-management/PluginManagementPanel';

type SettingsTab = 'general' | 'features' | 'text-model' | 'image-model' | 'file-parser' | 'skills' | 'plugins' | 'usage' | 'about';
type ReleaseDownloadStatus = 'idle' | 'downloading' | 'downloaded' | 'installing' | 'error';

interface ReleaseDownloadState {
  status: ReleaseDownloadStatus;
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
  fileName: string;
  filePath: string;
  version: string;
  message: string;
}

const SETTINGS_ACTIVE_TAB_KEY = 'yibiao-settings-active-tab';
const DEFAULT_SETTINGS_TAB: SettingsTab = 'text-model';
const githubReleaseDownloadPattern = /^https:\/\/github\.com\/[^/]+\/[^/]+\/releases\/download\/[^/]+\/.+/i;

const settingsTabs: Array<{ id: SettingsTab; label: string }> = [
  { id: 'text-model', label: '文本模型' },
  { id: 'image-model', label: '生图模型' },
  { id: 'file-parser', label: '文件解析' },
  { id: 'features', label: '功能管理' },
  { id: 'skills', label: '技能管理' },
  { id: 'plugins', label: '插件管理' },
  { id: 'usage', label: '用量统计' },
  { id: 'about', label: '关于' },
];

const textModelProviders: Array<{ value: TextModelProvider; label: string }> = [
  { value: 'agnes-ai-cn', label: 'agnes-ai【中国大陆】' },
  { value: 'agnes-ai-global', label: 'agnes-ai【国际站】' },
  { value: 'volcengine', label: '火山方舟' },
  { value: 'xiaomi', label: '小米 token plan' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'longcat', label: '龙猫' },
  { value: 'custom', label: '自定义' },
];

const oldXiaomiBaseUrl = 'https://api.xiaomimimo.com/v1';
const agnesAiCnRegisterUrl = 'https://platform.agnes-ai.cn';
const agnesAiGlobalRegisterUrl = 'https://platform.agnes-ai.com';
const agnesAiCnBaseUrl = 'https://api.agnes-ai.cn/v1';
const agnesAiGlobalBaseUrl = 'https://apihub.agnes-ai.com/v1';
const agnesAiNotice = `🔔 Agnes AI 国内站与国际站使用公告

⚠️【重要说明】

原国际站注册用户无需前往国内站重新注册，也无需更换原有 API Key。

中国大陆用户如需继续使用原国际站账户及原有 API Key，只需将原接口 Endpoint 修改为以下地址：

https://api.agnes-ai.cn/v1

修改完成后，即可继续使用国际站原有的 API Key。

【国际站】

官网：https://agnes-ai.com
API 平台：https://platform.agnes-ai.com
国际 Base URL：
https://apihub.agnes-ai.com/v1

【国内站】

官网：https://agnes-ai.cn
API 平台：https://platform.agnes-ai.cn
Base URL：https://api.agnes-ai.cn/v1

【账户说明】

1. 原国际站注册用户无需在国内站重新注册，可通过修改 Endpoint，继续使用原有 API Key。
2. 国际站与国内站的账号、API Key 及账户数据不互通。
3. 如需使用国内站的新账户体系，可自行前往国内站注册。
4. 国内站新注册的 API Key 请使用国内站 Base URL，不能与国际站 Endpoint 混用。

【注意事项】

1. 修改 Endpoint 后，请重启应用或服务并重新发起请求。
2. 国内站与国际站的接口文档可能存在差异，请以对应站点的最新文档为准。
3. 如遇连接超时、401、403 或 Load failed 等问题，请首先检查 API Key 与 Endpoint 是否正确对应。`;

const textProviderDefaults: TextModelProfiles = {
  'agnes-ai-cn': { api_key: '', base_url: agnesAiCnBaseUrl, model_name: 'agnes-2.5-flash' },
  'agnes-ai-global': { api_key: '', base_url: agnesAiGlobalBaseUrl, model_name: 'agnes-2.5-flash' },
  volcengine: { api_key: '', base_url: 'https://ark.cn-beijing.volces.com/api/v3', model_name: '' },
  xiaomi: { api_key: '', base_url: 'https://token-plan-cn.xiaomimimo.com/v1', model_name: '' },
  deepseek: { api_key: '', base_url: 'https://api.deepseek.com', model_name: 'deepseek-v4-flash' },
  longcat: { api_key: '', base_url: 'https://api.longcat.chat/openai/v1', model_name: 'LongCat-2.0' },
  custom: { api_key: '', base_url: '', model_name: '' },
};

const agnesTextModelNames = ['agnes-2.5-flash', 'agnes-2.0-flash', 'agnes-2.5-pro', 'agnes-2.5-pro-alpha'];
const agnesImageModelNames = ['agnes-image-2.1-flash', 'agnes-image-2.0-flash'];
const deepseekTextModelNames = ['deepseek-v4-flash', 'deepseek-v4-pro'];
const longcatTextModelNames = ['LongCat-2.0'];

const textProviderApiKeyUrls: Partial<Record<TextModelProvider, string>> = {
  'agnes-ai-cn': agnesAiCnRegisterUrl,
  'agnes-ai-global': agnesAiGlobalRegisterUrl,
  volcengine: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey',
  xiaomi: 'https://platform.xiaomimimo.com/console/api-keys',
  deepseek: 'https://platform.deepseek.com/api_keys',
  longcat: 'https://longcat.chat/platform/api_keys',
};

function createDefaultTextModelProfiles(): TextModelProfiles {
  return textModelProviders.reduce((profiles, provider) => ({
    ...profiles,
    [provider.value]: { ...textProviderDefaults[provider.value] },
  }), {} as TextModelProfiles);
}

function getAgnesTextModels(provider: TextModelProvider): string[] {
  return provider === 'agnes-ai-cn' || provider === 'agnes-ai-global' ? [...agnesTextModelNames] : [];
}

function getBuiltInTextModels(provider: TextModelProvider): string[] {
  if (provider === 'deepseek') return [...deepseekTextModelNames];
  if (provider === 'longcat') return [...longcatTextModelNames];
  return getAgnesTextModels(provider);
}

function supportsThinkingSettings(provider: TextModelProvider): boolean {
  return provider === 'agnes-ai-cn' || provider === 'agnes-ai-global' || provider === 'deepseek' || provider === 'longcat';
}

function getAgnesImageModels(provider: ImageModelProvider): string[] {
  return provider === 'agnes-ai-cn' || provider === 'agnes-ai-global' ? [...agnesImageModelNames] : [];
}

function normalizeTextModelProfile(provider: TextModelProvider, profile?: Partial<TextModelConfig>): TextModelConfig {
  const defaults = textProviderDefaults[provider];
  const baseUrl = provider === 'custom' ? profile?.base_url ?? defaults.base_url : defaults.base_url;
  return {
    api_key: profile?.api_key ?? defaults.api_key,
    base_url: provider === 'xiaomi' && baseUrl === oldXiaomiBaseUrl ? defaults.base_url : baseUrl,
    model_name: profile?.model_name || defaults.model_name,
  };
}

function isDirectReleaseDownloadUrl(url?: string): boolean {
  return githubReleaseDownloadPattern.test(String(url || ''));
}

function createInitialReleaseDownloadState(partial: Partial<ReleaseDownloadState> = {}): ReleaseDownloadState {
  return {
    status: 'idle',
    percent: 0,
    transferred: 0,
    total: 0,
    bytesPerSecond: 0,
    fileName: '',
    filePath: '',
    version: '',
    message: '',
    ...partial,
  };
}

function formatBytes(value?: number): string {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size >= 10 || unitIndex === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unitIndex]}`;
}

function findReleaseAssetSize(release: LatestReleaseInfo | null): number {
  if (!release?.assets?.length) return 0;
  const downloadUrl = String(release.download_url || '');
  const downloadName = String(release.download_name || '');
  const asset = release.assets.find((item) => (
    item.browser_download_url === downloadUrl || item.name === downloadName
  ));
  return Number(asset?.size || 0);
}

function normalizeTextModelProfiles(profiles?: Partial<TextModelProfiles>): TextModelProfiles {
  return textModelProviders.reduce((nextProfiles, provider) => ({
    ...nextProfiles,
    [provider.value]: normalizeTextModelProfile(provider.value, profiles?.[provider.value]),
  }), {} as TextModelProfiles);
}

function textProfileFromState(textModel: SettingsPageState['textModel']): TextModelConfig {
  return {
    api_key: textModel.api_key,
    base_url: textModel.provider === 'custom' ? textModel.base_url : textProviderDefaults[textModel.provider].base_url,
    model_name: textModel.model_name,
  };
}

const imageProviders: Array<{ value: ImageModelProvider; label: string }> = [
  { value: 'agnes-ai-cn', label: 'agnes-ai【中国大陆】' },
  { value: 'agnes-ai-global', label: 'agnes-ai【国际站】' },
  { value: 'volcengine', label: '火山方舟' },
  { value: 'google-ai-studio', label: 'Google AI Studio' },
  { value: 'custom', label: '自定义 OpenAI-like' },
];

const imageProviderDefaults: ImageModelProfiles = {
  'agnes-ai-cn': {
    provider: 'agnes-ai-cn',
    base_url: agnesAiCnBaseUrl,
    api_key: '',
    model_name: 'agnes-image-2.1-flash',
    size: '2K',
    ratio: '1:1',
    status: 'untested',
    tested_at: '',
    last_error: '',
  },
  'agnes-ai-global': {
    provider: 'agnes-ai-global',
    base_url: agnesAiGlobalBaseUrl,
    api_key: '',
    model_name: 'agnes-image-2.1-flash',
    size: '2K',
    ratio: '1:1',
    status: 'untested',
    tested_at: '',
    last_error: '',
  },
  volcengine: {
    provider: 'volcengine',
    base_url: 'https://ark.cn-beijing.volces.com/api/v3',
    api_key: '',
    model_name: '',
    status: 'untested',
    tested_at: '',
    last_error: '',
  },
  'google-ai-studio': {
    provider: 'google-ai-studio',
    base_url: 'https://generativelanguage.googleapis.com/v1beta',
    api_key: '',
    model_name: 'gemini-3.1-flash-image-preview',
    status: 'untested',
    tested_at: '',
    last_error: '',
  },
  custom: {
    provider: 'custom',
    base_url: '',
    api_key: '',
    model_name: '',
    status: 'untested',
    tested_at: '',
    last_error: '',
  },
};

const imageProviderApiKeyUrls: Record<ImageModelProvider, string> = {
  'agnes-ai-cn': agnesAiCnRegisterUrl,
  'agnes-ai-global': agnesAiGlobalRegisterUrl,
  volcengine: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey',
  'google-ai-studio': 'https://aistudio.google.com/api-keys',
  custom: '',
};

const imageProviderLabels: Record<ImageModelProvider, string> = {
  'agnes-ai-cn': 'agnes-ai【中国大陆】',
  'agnes-ai-global': 'agnes-ai【国际站】',
  volcengine: '火山方舟',
  'google-ai-studio': 'Google AI Studio',
  custom: '自定义生图服务',
};

function getImageBaseUrlDescription(provider: ImageModelProvider) {
  if (provider === 'agnes-ai-cn' || provider === 'agnes-ai-global') return 'agnes-ai OpenAI 兼容接口地址';
  if (provider === 'volcengine') return '火山方舟 OpenAI 兼容接口地址';
  if (provider === 'custom') return '填写兼容 OpenAI /images/generations 的接口地址';
  return 'Google Gemini API REST 地址';
}

function getImageApiKeyDescription(provider: ImageModelProvider) {
  if (provider === 'agnes-ai-cn' || provider === 'agnes-ai-global') return '用于调用 agnes-ai 图片生成 API';
  if (provider === 'volcengine') return '用于调用火山方舟图片生成 API';
  if (provider === 'custom') return '用于调用自定义 OpenAI-like 生图接口';
  return '用于调用 Google AI Studio Gemini API';
}

function getImageModelDescription(provider: ImageModelProvider) {
  if (provider === 'agnes-ai-cn' || provider === 'agnes-ai-global') return '填写 agnes-ai 已开通的生图模型名称';
  if (provider === 'volcengine') return '填写火山方舟控制台中已开通的模型或推理接入点 ID';
  if (provider === 'custom') return '填写自定义接口支持的生图模型名称';
  return '选择或填写支持图片生成的 Gemini 模型';
}

function getImageModelPlaceholder(provider: ImageModelProvider) {
  if (provider === 'agnes-ai-cn' || provider === 'agnes-ai-global') return '请输入已开通的生图模型名称';
  if (provider === 'volcengine') return '请输入已开通的模型或推理接入点 ID';
  if (provider === 'custom') return '请输入 OpenAI-like 生图模型名称';
  return 'gemini-3.1-flash-image-preview';
}

function normalizeVersionText(version: string) {
  return String(version || '').trim().replace(/^v/i, '');
}

function parseVersionText(version: string) {
  const normalized = normalizeVersionText(version);
  const [core = '', prerelease = ''] = normalized.split('-', 2);
  return {
    numbers: core.split('.').map((part) => Number.parseInt(part, 10) || 0),
    prerelease,
  };
}

function compareVersions(left: string, right: string) {
  const leftVersion = parseVersionText(left);
  const rightVersion = parseVersionText(right);
  const length = Math.max(leftVersion.numbers.length, rightVersion.numbers.length);

  for (let index = 0; index < length; index += 1) {
    const delta = (leftVersion.numbers[index] || 0) - (rightVersion.numbers[index] || 0);
    if (delta !== 0) return delta;
  }

  if (leftVersion.prerelease && !rightVersion.prerelease) return -1;
  if (!leftVersion.prerelease && rightVersion.prerelease) return 1;
  if (leftVersion.prerelease !== rightVersion.prerelease) {
    return leftVersion.prerelease.localeCompare(rightVersion.prerelease);
  }

  return 0;
}

function createDefaultImageModelProfiles(): ImageModelProfiles {
  return imageProviders.reduce((profiles, provider) => ({
    ...profiles,
    [provider.value]: { ...imageProviderDefaults[provider.value] },
  }), {} as ImageModelProfiles);
}

function normalizeImageModelProfile(provider: ImageModelProvider, profile?: Partial<ImageModelConfig>): ImageModelConfig {
  const defaults = imageProviderDefaults[provider];
  return {
    provider,
    base_url: provider === 'custom' ? profile?.base_url ?? defaults.base_url : defaults.base_url,
    api_key: profile?.api_key ?? defaults.api_key,
    model_name: provider.startsWith('agnes-ai-') && !profile?.model_name ? defaults.model_name : profile?.model_name ?? defaults.model_name,
    size: profile?.size ?? defaults.size,
    ratio: profile?.ratio ?? defaults.ratio,
    status: profile?.status ?? defaults.status,
    tested_at: profile?.tested_at ?? defaults.tested_at,
    last_error: profile?.last_error ?? defaults.last_error,
  };
}

function normalizeImageModelProfiles(profiles?: Partial<ImageModelProfiles>): ImageModelProfiles {
  return imageProviders.reduce((nextProfiles, provider) => ({
    ...nextProfiles,
    [provider.value]: normalizeImageModelProfile(provider.value, profiles?.[provider.value]),
  }), {} as ImageModelProfiles);
}

function imageProfileFromState(imageModel: ImageModelConfig): ImageModelConfig {
  return {
    provider: imageModel.provider,
    base_url: imageModel.provider === 'custom' ? imageModel.base_url || '' : imageProviderDefaults[imageModel.provider].base_url,
    api_key: imageModel.api_key,
    model_name: imageModel.model_name,
    size: imageModel.size,
    ratio: imageModel.ratio,
    status: imageModel.status || 'untested',
    tested_at: imageModel.tested_at || '',
    last_error: imageModel.last_error || '',
  };
}

const imageStatusMeta: Record<ImageModelStatus, { label: string; description: string }> = {
  untested: {
    label: '未测试',
    description: '请点击测试确认当前生图模型可用，正文生成时只有可用状态才会自动配图。',
  },
  available: {
    label: '可用',
    description: '当前生图模型已通过测试，正文生成时会按内容需要自动配图。',
  },
  unavailable: {
    label: '不可用',
    description: '当前生图模型测试失败，正文生成会跳过配图。',
  },
};

function resetImageModelStatus(imageModel: ImageModelConfig): ImageModelConfig {
  return {
    ...imageModel,
    status: 'untested',
    tested_at: '',
    last_error: '',
  };
}

function formatImageTestTime(value?: string) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleString('zh-CN', { hour12: false });
}

const fileParserProviders: Array<{ value: FileParserProvider; label: string }> = [
  { value: 'local', label: '本地解析' },
  { value: 'mineru-accurate-api', label: 'MinerU-精准解析 API' },
  { value: 'mineru-agent-api', label: 'MinerU-Agent 轻量解析 API' },
];

const parserOptions = [
  {
    title: '本地解析',
    badge: '推荐默认',
    tone: 'primary',
    summary: '覆盖大多数 Word 和带文字层 PDF，速度快、无调用限制。',
    items: [
      ['Token', '无需'],
      ['解析速度', '快'],
      ['支持格式', 'pdf、jpeg、png、docx、doc、wps、ofd'],
      ['大小/页数', '无限制'],
      ['解析质量', '高'],
      ['扫描件', '不支持'],
    ],
  },
  {
    title: 'MinerU 精准解析 API',
    badge: '扫描件兜底',
    tone: 'accent',
    summary: '解析质量高，适合本地解析失败或扫描件质量要求高的文档。',
    items: [
      ['Token', '需要'],
      ['解析速度', '慢'],
      ['支持格式', 'pdf、jpeg、png、docx'],
      ['大小/页数', '≤ 200MB / ≤ 200 页'],
      ['解析质量', '高'],
      ['扫描件', '支持'],
    ],
  },
  {
    title: 'MinerU-Agent 轻量解析 API',
    badge: '轻量备用',
    tone: 'muted',
    summary: '无需 Token 但存在 IP 限频，适合轻量文档的备用解析。',
    items: [
      ['Token', '无需（IP 限频）'],
      ['解析速度', '中等'],
      ['支持格式', 'pdf、jpeg、png、docx'],
      ['大小/页数', '≤ 10MB / ≤ 20 页'],
      ['解析质量', '中'],
      ['扫描件', '质量差'],
    ],
  },
];

const initialState: SettingsPageState = {
  textModel: {
    provider: 'agnes-ai-cn',
    ...textProviderDefaults['agnes-ai-cn'],
  },
  textModelProfiles: createDefaultTextModelProfiles(),
  textModelOptions: {
    thinking_enabled: false,
    thinking_budget_tokens: 2048,
    thinking_effort: 'high',
  },
  imageModel: {
    ...imageProviderDefaults['agnes-ai-cn'],
  },
  imageModelProfiles: createDefaultImageModelProfiles(),
  fileParser: {
    provider: 'local',
    mineru_token: '',
  },
  skillSettings: {
    skills: {
      'word-optimization': {
        id: 'word-optimization',
        enabled: true,
      },
      'technical-diagram': {
        id: 'technical-diagram',
        enabled: false,
      },
    },
  },
  featureModuleSettings: createDefaultFeatureModuleSettings(),
  general: {
    developer_mode: false,
  },
};

function createDefaultFeatureModuleSettings(): FeatureModuleSettings {
  return {
    modules: configurableFeatureModules.reduce((modules, module) => ({
      ...modules,
      [module.id]: { id: module.id, enabled: true },
    }), {} as Record<FeatureModuleId, { id: FeatureModuleId; enabled: boolean }>),
  };
}

function normalizeSkillSettings(settings?: Partial<SkillSettings>): SkillSettings {
  return {
    skills: {
      'word-optimization': {
        id: 'word-optimization',
        enabled: settings?.skills?.['word-optimization']?.enabled !== false,
      },
      'technical-diagram': {
        id: 'technical-diagram',
        enabled: Boolean(settings?.skills?.['technical-diagram']?.enabled),
      },
    },
  };
}

function normalizeFeatureModuleSettings(settings?: Partial<FeatureModuleSettings>): FeatureModuleSettings {
  return {
    modules: configurableFeatureModules.reduce((modules, module) => ({
      ...modules,
      [module.id]: {
        id: module.id,
        enabled: settings?.modules?.[module.id]?.enabled !== false,
      },
    }), {} as Record<FeatureModuleId, { id: FeatureModuleId; enabled: boolean }>),
  };
}

interface SettingsPageProps {
  onDeveloperModeChange?: (developerMode: boolean) => void;
  onFeatureModuleSettingsChange?: (settings: FeatureModuleSettings) => void;
}

function UsageTrendChart({ trend, range }: { trend: UsageStatsSummary['trend']; range: UsageTrendRange }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const points = trend.length ? trend : Array.from({ length: 7 }, (_, index) => ({ date: `--${String(index + 1).padStart(2, '0')}`, requests: 0, prompt_tokens: 0, completion_tokens: 0, reasoning_tokens: 0, total_tokens: 0 }));
  const width = 760;
  const height = 230;
  const padding = { top: 18, right: 24, bottom: 34, left: 42 };
  const maxValue = Math.max(1, ...points.map((item) => Number(item.total_tokens || 0)));
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const coordinate = (value: number, index: number) => ({
    x: padding.left + (points.length === 1 ? chartWidth / 2 : (index / (points.length - 1)) * chartWidth),
    y: padding.top + chartHeight - (value / maxValue) * chartHeight,
  });
  const line = points.map((item, index) => coordinate(Number(item.total_tokens || 0), index)).map((point, index) => `${index ? 'L' : 'M'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
  const hoveredItem = hoveredIndex === null ? null : points[hoveredIndex];
  const hoveredPoint = hoveredItem ? coordinate(Number(hoveredItem.total_tokens || 0), hoveredIndex as number) : null;
  const tooltipWidth = 162;
  const tooltipX = hoveredPoint ? Math.min(width - tooltipWidth - 4, Math.max(4, hoveredPoint.x - tooltipWidth / 2)) : 0;
  const tooltipY = hoveredPoint ? (hoveredPoint.y > 72 ? hoveredPoint.y - 58 : hoveredPoint.y + 14) : 0;
  return (
    <div className="usage-trend-card">
      <div className="usage-trend-head"><div><strong>{({ '1h': '近 1 小时', '6h': '近 6 小时', '1d': '近 1 天', '7d': '近 7 天', '14d': '近 14 天' } as Record<UsageTrendRange, string>)[range]} Token 趋势</strong><span>{range === '1h' ? '按 5 分钟聚合' : range === '6h' || range === '1d' ? '按小时聚合' : '按每日聚合'}</span></div><em>峰值 {maxValue.toLocaleString()}</em></div>
      <svg className="usage-trend-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="近十四天 Token 使用趋势">
        {[0, 0.5, 1].map((ratio) => { const y = padding.top + chartHeight * ratio; return <line key={ratio} x1={padding.left} x2={width - padding.right} y1={y} y2={y} className="usage-trend-grid" />; })}
        <path d={line} className="usage-trend-line" />
        {points.map((item, index) => {
          const point = coordinate(Number(item.total_tokens || 0), index);
          const total = Number(item.total_tokens || 0);
          return (
            <g
              key={item.date}
              className="usage-trend-point-group"
              tabIndex={0}
              role="img"
              aria-label={`${item.date}，消耗 ${total.toLocaleString()} Token`}
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
              onFocus={() => setHoveredIndex(index)}
              onBlur={() => setHoveredIndex(null)}
            >
              <title>{item.date} · {total.toLocaleString()} Token</title>
              <circle cx={point.x} cy={point.y} r="13" className="usage-trend-hit" />
              <circle cx={point.x} cy={point.y} r={hoveredIndex === index ? 6 : 4} className="usage-trend-point" />
              <text x={point.x} y={height - 10} textAnchor="middle" className="usage-trend-label">{item.date.slice(5)}</text>
            </g>
          );
        })}
        {hoveredItem && hoveredPoint ? (
          <g className="usage-trend-tooltip" aria-hidden="true">
            <rect x={tooltipX} y={tooltipY} width={tooltipWidth} height="48" rx="9" />
            <text x={tooltipX + 12} y={tooltipY + 19}>{hoveredItem.date}</text>
            <text x={tooltipX + 12} y={tooltipY + 37} className="usage-trend-tooltip-value">消耗 {Number(hoveredItem.total_tokens || 0).toLocaleString()} Token</text>
          </g>
        ) : null}
      </svg>
    </div>
  );
}

function getInitialSettingsTab(): SettingsTab {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS_TAB;
  const storedTab = window.localStorage.getItem(SETTINGS_ACTIVE_TAB_KEY) as SettingsTab | null;
  if (storedTab && settingsTabs.some((tab) => tab.id === storedTab)) return storedTab;
  return DEFAULT_SETTINGS_TAB;
}

function SettingsPage({ onDeveloperModeChange, onFeatureModuleSettingsChange }: SettingsPageProps) {
  const [state, setState] = useState<SettingsPageState>(initialState);
  const [activeTab, setActiveTab] = useState<SettingsTab>(getInitialSettingsTab);
  const [savedConfig, setSavedConfig] = useState<ClientConfig | null>(null);
  const [textModels, setTextModels] = useState<string[]>([]);
  const [textModelCapabilities, setTextModelCapabilities] = useState<ModelCapabilityInfo | null>(null);
  const [imageModels, setImageModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState<'text' | 'image' | null>(null);
  const [testingTextModel, setTestingTextModel] = useState(false);
  const [testingImageModel, setTestingImageModel] = useState(false);
  const [imageTestPreview, setImageTestPreview] = useState<{ src: string; title: string } | null>(null);
  const [appVersion, setAppVersion] = useState('');
  const [checkingLatestRelease, setCheckingLatestRelease] = useState(false);
  const [latestRelease, setLatestRelease] = useState<LatestReleaseInfo | null>(null);
  const [releaseDialogOpen, setReleaseDialogOpen] = useState(false);
  const [agnesNoticeOpen, setAgnesNoticeOpen] = useState(false);
  const [releaseDownloadState, setReleaseDownloadState] = useState<ReleaseDownloadState>(() => createInitialReleaseDownloadState());
  const [usageStats, setUsageStats] = useState<UsageStatsSummary | null>(null);
  const [usageRange, setUsageRange] = useState<UsageTrendRange>('14d');
  const { showToast } = useToast();

  useEffect(() => {
    void loadTextConfig();
    void window.yibiao?.getVersion().then(setAppVersion);
  }, []);

  useEffect(() => {
    void window.yibiao?.usageStats?.getSummary(usageRange).then(setUsageStats).catch(() => undefined);
  }, [usageRange]);

  const clearUsageStats = async () => {
    try {
      await window.yibiao?.usageStats?.clear();
      setUsageStats(await window.yibiao?.usageStats?.getSummary(usageRange) || null);
      showToast('本地用量统计已清空', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '清空用量统计失败', 'error');
    }
  };

  useEffect(() => {
    const unsubscribe = window.yibiao?.onUpdateProgress?.((event: UpdateProgressEvent) => {
      setReleaseDownloadState((prev) => {
        if (prev.status !== 'downloading' && prev.status !== 'downloaded') {
          return prev;
        }
        const percent = Math.max(0, Math.min(100, Number(event.percent || 0)));
        return {
          ...prev,
          status: percent >= 100 ? 'downloaded' : 'downloading',
          percent,
          transferred: Number(event.transferred || prev.transferred || 0),
          total: Number(event.total || prev.total || 0),
          bytesPerSecond: Number(event.bytesPerSecond || 0),
          fileName: event.fileName || prev.fileName,
          version: event.version || prev.version,
          message: percent >= 100 ? '安装包已下载完成' : '正在下载安装包',
        };
      });
    });
    return () => {
      unsubscribe?.();
    };
  }, []);

  const loadTextConfig = async () => {
    try {
      const config = await window.yibiao?.config.load();
      if (!config) {
        return;
      }

      const textModelProfiles = normalizeTextModelProfiles(config.text_model_profiles);
      const activeTextProfile = normalizeTextModelProfile(config.text_model_provider, textModelProfiles[config.text_model_provider]);
      const imageModelProfiles = normalizeImageModelProfiles(config.image_model_profiles);
      const activeImageProfile = normalizeImageModelProfile(config.image_model.provider, config.image_model);
      imageModelProfiles[activeImageProfile.provider] = activeImageProfile;

      const featureModuleSettings = normalizeFeatureModuleSettings(config.feature_module_settings);

      setState((prev) => ({
        ...prev,
        textModel: {
          provider: config.text_model_provider,
          ...activeTextProfile,
        },
        textModelProfiles,
        textModelOptions: {
          thinking_enabled: Boolean(config.text_model_options?.thinking_enabled),
          thinking_budget_tokens: Number(config.text_model_options?.thinking_budget_tokens || 2048),
          thinking_effort: config.text_model_options?.thinking_effort === 'max' ? 'max' : 'high',
        },
        imageModel: activeImageProfile,
        imageModelProfiles,
        fileParser: {
          provider: config.file_parser.provider,
          mineru_token: config.file_parser.mineru_token || '',
        },
        skillSettings: normalizeSkillSettings(config.skill_settings),
        featureModuleSettings,
        general: {
          developer_mode: Boolean(config.developer_mode),
        },
      }));
      setSavedConfig(config);
      setTextModels(getBuiltInTextModels(config.text_model_provider));
      setImageModels(getAgnesImageModels(activeImageProfile.provider));
      onDeveloperModeChange?.(Boolean(config.developer_mode));
      onFeatureModuleSettingsChange?.(featureModuleSettings);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '加载客户端配置失败';
      showToast(errorMessage, 'error');
    }
  };

  const getCurrentTextModelProfiles = (): TextModelProfiles => ({
    ...state.textModelProfiles,
    [state.textModel.provider]: textProfileFromState(state.textModel),
  });

  const getCurrentImageModelProfiles = (): ImageModelProfiles => ({
    ...state.imageModelProfiles,
    [state.imageModel.provider]: imageProfileFromState(state.imageModel),
  });

  const createClientConfig = (): ClientConfig => {
    const textModelProfiles = getCurrentTextModelProfiles();
    const activeTextProfile = textModelProfiles[state.textModel.provider];
    const imageModelProfiles = getCurrentImageModelProfiles();
    const activeImageProfile = imageModelProfiles[state.imageModel.provider];

    return {
      text_model_provider: state.textModel.provider,
      text_model_profiles: textModelProfiles,
      text_model_options: state.textModelOptions,
      api_key: activeTextProfile.api_key,
      base_url: activeTextProfile.base_url,
      model_name: activeTextProfile.model_name,
      image_model: activeImageProfile,
      image_model_profiles: imageModelProfiles,
      file_parser: {
        provider: state.fileParser.provider,
        mineru_token: state.fileParser.mineru_token || '',
      },
      skill_settings: normalizeSkillSettings(state.skillSettings),
      feature_module_settings: normalizeFeatureModuleSettings(state.featureModuleSettings),
      developer_mode: state.general.developer_mode,
    };
  };

  const checkLatestRelease = async () => {
    if (checkingLatestRelease) {
      return;
    }

    try {
      setCheckingLatestRelease(true);
      const release = await window.yibiao?.getLatestVersion();
      if (!release?.version) {
        showToast('未获取到最新版本号', 'error');
        return;
      }

      setLatestRelease(release);
      setReleaseDownloadState((prev) => {
        const sameDownloadedPackage = prev.status === 'downloaded'
          && prev.version === release.version
          && Boolean(prev.filePath || prev.fileName);
        return createInitialReleaseDownloadState({
          status: sameDownloadedPackage ? 'downloaded' : 'idle',
          percent: sameDownloadedPackage ? 100 : 0,
          fileName: release.download_name || prev.fileName || '',
          filePath: sameDownloadedPackage ? prev.filePath : '',
          version: release.version,
          total: findReleaseAssetSize(release),
          transferred: sameDownloadedPackage ? prev.transferred : 0,
          message: sameDownloadedPackage ? prev.message || '安装包已下载完成' : '',
        });
      });
      if (compareVersions(release.version, appVersion) > 0) {
        if (!isDirectReleaseDownloadUrl(release.download_url)) {
          showToast(`发现新版本 ${release.version}，安装包仍在构建或上传，请稍后重新检测`, 'info');
          return;
        }
        showToast(`发现新版本 ${release.version}`, 'info');
        return;
      }

      showToast('当前已是最新版本', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '检测版本失败', 'error');
    } finally {
      setCheckingLatestRelease(false);
    }
  };

  const openLatestDownload = async (options: { accelerated?: boolean } = {}) => {
    const downloadUrl = isDirectReleaseDownloadUrl(latestRelease?.download_url) ? latestRelease?.download_url : '';
    if (!downloadUrl) {
      showToast('当前系统安装包仍在构建或上传，请稍后重新检测版本。', 'info');
      return;
    }

    const targetUrl = options.accelerated
      ? `https://gh-proxy.com/${downloadUrl}`
      : downloadUrl;

    try {
      const result = await window.yibiao?.openExternal(targetUrl);
      if (result && !result.success) {
        showToast(result.message || '打开最新版下载链接失败', 'error');
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : '打开最新版下载链接失败', 'error');
    }
  };

  const downloadLatestRelease = async () => {
    const downloadUrl = isDirectReleaseDownloadUrl(latestRelease?.download_url) ? latestRelease?.download_url : '';
    if (!latestRelease?.version || !downloadUrl) {
      showToast('当前系统安装包仍在构建或上传，请稍后重新检测版本。', 'info');
      return;
    }

    const size = findReleaseAssetSize(latestRelease);
    setReleaseDownloadState(createInitialReleaseDownloadState({
      status: 'downloading',
      fileName: latestRelease.download_name || '',
      version: latestRelease.version,
      total: size,
      message: '正在下载安装包',
    }));

    try {
      const result = await window.yibiao?.downloadReleaseInstaller({
        version: latestRelease.version,
        download_url: downloadUrl,
        download_name: latestRelease.download_name,
        size,
      });
      if (result?.canceled) {
        setReleaseDownloadState(createInitialReleaseDownloadState({
          fileName: latestRelease.download_name || '',
          version: latestRelease.version,
          total: size,
        }));
        return;
      }
      if (!result?.success) {
        const message = result?.message || '下载安装包失败';
        setReleaseDownloadState((prev) => ({ ...prev, status: 'error', message }));
        showToast(message, 'error');
        return;
      }

      setReleaseDownloadState((prev) => ({
        ...prev,
        status: 'downloaded',
        percent: 100,
        version: result.version || latestRelease.version,
        fileName: result.fileName || latestRelease.download_name || prev.fileName,
        filePath: result.path || prev.filePath,
        message: result.message || '安装包已下载完成',
      }));
      showToast('安装包已下载完成，可立即安装', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '下载安装包失败';
      setReleaseDownloadState((prev) => ({ ...prev, status: 'error', message }));
      showToast(message, 'error');
    }
  };

  const cancelReleaseDownload = async () => {
    if (releaseDownloadState.status !== 'downloading') {
      return;
    }

    try {
      const result = await window.yibiao?.cancelReleaseInstallerDownload();
      if (result && !result.success) {
        showToast(result.message || '取消更新下载失败', 'error');
        return;
      }
      setReleaseDownloadState(createInitialReleaseDownloadState({
        fileName: latestRelease?.download_name || releaseDownloadState.fileName,
        version: latestRelease?.version || releaseDownloadState.version,
        total: findReleaseAssetSize(latestRelease),
      }));
      showToast(result?.message || '已取消更新下载', 'info');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '取消更新下载失败', 'error');
    }
  };

  const installDownloadedRelease = async () => {
    setReleaseDownloadState((prev) => ({ ...prev, status: 'installing', message: '正在启动安装程序' }));
    try {
      const result = await window.yibiao?.installDownloadedRelease();
      if (!result?.success) {
        const message = result?.message || '启动安装程序失败';
        setReleaseDownloadState((prev) => ({ ...prev, status: 'downloaded', message }));
        showToast(message, 'error');
        return;
      }
      showToast(result.message || '安装程序已启动', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '启动安装程序失败';
      setReleaseDownloadState((prev) => ({ ...prev, status: 'downloaded', message }));
      showToast(message, 'error');
    }
  };

  const showDownloadedRelease = async () => {
    try {
      const result = await window.yibiao?.showDownloadedRelease();
      if (!result?.success) {
        showToast(result?.message || '打开安装包所在文件夹失败', 'error');
        return;
      }
      showToast(result.message || '已打开安装包所在文件夹', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '打开安装包所在文件夹失败', 'error');
    }
  };

  const updateImageModelConfig = (partial: Partial<Omit<ImageModelConfig, 'provider'>>, options: { clearModels?: boolean } = {}) => {
    if (options.clearModels) {
      setImageModels([]);
    }

    setState((prev) => ({
      ...prev,
      ...(() => {
        const imageModel = resetImageModelStatus({ ...prev.imageModel, ...partial });
        return {
          imageModel,
          imageModelProfiles: {
            ...prev.imageModelProfiles,
            [prev.imageModel.provider]: imageProfileFromState(imageModel),
          },
        };
      })(),
    }));
  };

  const updateImageModelProvider = (provider: ImageModelProvider) => {
    setImageModels(getAgnesImageModels(provider));
    setImageTestPreview(null);
    setState((prev) => ({
      ...prev,
      imageModelProfiles: {
        ...prev.imageModelProfiles,
        [prev.imageModel.provider]: imageProfileFromState(prev.imageModel),
      },
      imageModel: normalizeImageModelProfile(provider, prev.imageModelProfiles[provider]),
    }));
  };

  const saveClientConfig = async (config: ClientConfig) => {
    try {
      const result = await window.yibiao?.config.save(config);
      showToast(result?.success ? '配置已保存' : result?.message || '配置保存失败', result?.success ? 'success' : 'error');
      if (result?.success) {
        setSavedConfig(config);
        onDeveloperModeChange?.(Boolean(config.developer_mode));
        onFeatureModuleSettingsChange?.(normalizeFeatureModuleSettings(config.feature_module_settings));
      }
      return Boolean(result?.success);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '配置保存失败';
      showToast(errorMessage, 'error');
      return false;
    }
  };

  const saveTextConfig = async () => {
    await saveClientConfig(createClientConfig());
  };

  const updateDeveloperMode = (developerMode: boolean) => {
    setState((prev) => ({
      ...prev,
      general: { ...prev.general, developer_mode: developerMode },
    }));
    onDeveloperModeChange?.(developerMode);
  };

  const updateTextModelProvider = (provider: TextModelProvider) => {
    setTextModels(getBuiltInTextModels(provider));
    setTextModelCapabilities(null);
    setState((prev) => ({
      ...prev,
      textModelProfiles: {
        ...prev.textModelProfiles,
        [prev.textModel.provider]: textProfileFromState(prev.textModel),
      },
      textModel: {
        provider,
        ...normalizeTextModelProfile(provider, prev.textModelProfiles[provider]),
      },
    }));
  };

  const updateTextModelConfig = (partial: Partial<TextModelConfig>, options: { clearModels?: boolean } = {}) => {
    if (options.clearModels) {
      setTextModels([]);
    }
    if (partial.base_url !== undefined || partial.api_key !== undefined || partial.model_name !== undefined) {
      setTextModelCapabilities(null);
    }

    setState((prev) => ({
      ...prev,
      ...(() => {
        const textModel = { ...prev.textModel, ...partial };
        return {
          textModel,
          textModelProfiles: {
            ...prev.textModelProfiles,
            [prev.textModel.provider]: textProfileFromState(textModel),
          },
        };
      })(),
    }));
  };

  const openTextProviderApiKeyPage = async () => {
    const url = textProviderApiKeyUrls[state.textModel.provider];
    if (!url) {
      showToast('自定义服务商没有预置 API Key 获取页面', 'info');
      return;
    }

    try {
      const result = await window.yibiao?.openExternal(url);
      if (result && !result.success) {
        showToast(result.message || '打开 API Key 获取页面失败', 'error');
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : '打开 API Key 获取页面失败', 'error');
    }
  };

  const openImageProviderApiKeyPage = async () => {
    const url = imageProviderApiKeyUrls[state.imageModel.provider];
    if (!url) {
      showToast('自定义生图服务没有预置 API Key 获取页面', 'info');
      return;
    }

    try {
      const result = await window.yibiao?.openExternal(url);
      if (result && !result.success) {
        showToast(result.message || '打开生图服务 API Key 获取页面失败', 'error');
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : '打开生图服务 API Key 获取页面失败', 'error');
    }
  };

  const openAgnesAiRegisterPage = async (url: string) => {
    try {
      const result = await window.yibiao?.openExternal(url);
      if (result && !result.success) {
        showToast(result.message || '打开 agnes-ai 注册页面失败', 'error');
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : '打开 agnes-ai 注册页面失败', 'error');
    }
  };

  const testTextConfig = async () => {
    try {
      setTestingTextModel(true);
      const config = createClientConfig();
      const result = await window.yibiao?.config.save(config);
      if (result?.success) {
        setSavedConfig(config);
      }
      const content = await window.yibiao?.ai.chat({
        messages: [{ role: 'user', content: 'hi' }],
        temperature: 0,
        timeout_ms: 30000,
        timeout_message: '文本模型测试超时，请检查 Base URL、API Key 或模型名称',
        logTitle: '文本模型测试',
      });
      const reply = (content || '').trim();
      showToast(reply ? `测试成功：${reply.slice(0, 160)}` : '测试成功', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '测试失败', 'error');
    } finally {
      setTestingTextModel(false);
    }
  };

  const saveImageConfig = async () => {
    await saveClientConfig(createClientConfig());
  };

  const testImageConfig = async () => {
    try {
      setTestingImageModel(true);
      const config = createClientConfig();
      const result = await window.yibiao?.ai.testImageModel(config);
      if (!result?.success) {
        throw new Error(result?.message || '生图模型测试失败');
      }
      const testedImageModel: ImageModelConfig = {
        ...config.image_model,
        status: 'available',
        tested_at: new Date().toISOString(),
        last_error: '',
      };
      const testedConfig: ClientConfig = {
        ...config,
        image_model: testedImageModel,
        image_model_profiles: {
          ...config.image_model_profiles,
          [testedImageModel.provider]: testedImageModel,
        },
      };
      await window.yibiao?.config.save(testedConfig);
      setState((prev) => ({
        ...prev,
        imageModel: testedConfig.image_model,
        imageModelProfiles: {
          ...prev.imageModelProfiles,
          [testedConfig.image_model.provider]: imageProfileFromState(testedConfig.image_model),
        },
      }));
      setSavedConfig(testedConfig);
      const previewSrc = result?.image_url || (result?.image_data ? `data:${result.mime_type || 'image/png'};base64,${result.image_data}` : '');

      if (previewSrc) {
        setImageTestPreview({ src: previewSrc, title: `${imageProviderLabels[state.imageModel.provider]} 测试图片` });
      }

      showToast(result?.message || '生图模型测试成功', result?.success ? 'success' : 'error');
    } catch (error) {
      const message = error instanceof Error ? error.message : '生图模型测试失败';
      const config = createClientConfig();
      const failedImageModel: ImageModelConfig = {
        ...config.image_model,
        status: 'unavailable',
        tested_at: new Date().toISOString(),
        last_error: message,
      };
      const failedConfig: ClientConfig = {
        ...config,
        image_model: failedImageModel,
        image_model_profiles: {
          ...config.image_model_profiles,
          [failedImageModel.provider]: failedImageModel,
        },
      };
      await window.yibiao?.config.save(failedConfig).catch(() => undefined);
      setState((prev) => ({
        ...prev,
        imageModel: failedConfig.image_model,
        imageModelProfiles: {
          ...prev.imageModelProfiles,
          [failedConfig.image_model.provider]: imageProfileFromState(failedConfig.image_model),
        },
      }));
      setSavedConfig(failedConfig);
      showToast(message, 'error');
    } finally {
      setTestingImageModel(false);
    }
  };

  const saveFileParserConfig = async () => {
    await saveClientConfig(createClientConfig());
  };

  const updateWordOptimizationSkill = (enabled: boolean) => {
    setState((prev) => ({
      ...prev,
      skillSettings: {
        skills: {
          ...prev.skillSettings.skills,
          'word-optimization': {
            id: 'word-optimization',
            enabled,
          },
        },
      },
    }));
  };

  const updateTechnicalDiagramSkill = (enabled: boolean) => {
    setState((prev) => ({
      ...prev,
      skillSettings: {
        skills: {
          ...prev.skillSettings.skills,
          'technical-diagram': {
            id: 'technical-diagram',
            enabled,
          },
        },
      },
    }));
  };

  const updateFeatureModule = (moduleId: FeatureModuleId, enabled: boolean) => {
    setState((prev) => ({
      ...prev,
      featureModuleSettings: {
        modules: {
          ...prev.featureModuleSettings.modules,
          [moduleId]: {
            id: moduleId,
            enabled,
          },
        },
      },
    }));
  };

  const openConfigFolder = async () => {
    try {
      await window.yibiao?.config.openConfigFolder();
      showToast('已打开配置文件夹', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '打开配置文件夹失败', 'error');
    }
  };

  const fetchTextModels = async () => {
    try {
      setLoadingModels('text');
      const result = await window.yibiao?.config.listModels(createClientConfig());
      const models = result?.models?.length ? result.models : getBuiltInTextModels(state.textModel.provider);
      setTextModels(models);
      if (result?.success && models.length > 0) {
        setState((prev) => ({
          ...prev,
          ...(() => {
            const textModel = models.includes(prev.textModel.model_name)
              ? prev.textModel
              : { ...prev.textModel, model_name: models[0] };
            return {
              textModel,
              textModelProfiles: {
                ...prev.textModelProfiles,
                [prev.textModel.provider]: textProfileFromState(textModel),
              },
            };
          })(),
        }));
      }
      showToast(result?.message || `获取到 ${result?.models.length || 0} 个文本模型`, result?.success ? 'success' : 'info');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '获取文本模型失败', 'error');
    } finally {
      setLoadingModels(null);
    }
  };

  const fetchTextModelCapabilities = async () => {
    try {
      setTextModelCapabilities(null);
      const result = await window.yibiao?.config.getModelCapabilities(createClientConfig());
      if (result) setTextModelCapabilities(result);
      showToast(result?.message || '未获取到模型能力信息', result?.success ? 'success' : 'info');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '探测模型能力失败', 'error');
    }
  };

  const fetchImageModels = async () => {
    try {
      setLoadingModels('image');
      if (state.imageModel.provider === 'agnes-ai-cn' || state.imageModel.provider === 'agnes-ai-global' || state.imageModel.provider === 'custom') {
        const providerLabel = imageProviderLabels[state.imageModel.provider];
        const baseUrl = state.imageModel.provider === 'custom'
          ? state.imageModel.base_url || ''
          : state.imageModel.base_url || imageProviderDefaults[state.imageModel.provider].base_url || '';

        if (!state.imageModel.api_key.trim()) {
          setImageModels([]);
          showToast(`请先填写${providerLabel} API Key`, 'info');
          return;
        }

        if (!baseUrl.trim()) {
          setImageModels([]);
          showToast(`请先填写${providerLabel} Base URL`, 'info');
          return;
        }

        const config = createClientConfig();
        const result = await window.yibiao?.config.listModels({
          ...config,
          api_key: state.imageModel.api_key,
          base_url: baseUrl,
          model_name: state.imageModel.model_name,
        });
        const models = result?.models?.length ? result.models : getAgnesImageModels(state.imageModel.provider);
        setImageModels(models);
        if (result?.success && models.length > 0) {
          setState((prev) => ({
            ...prev,
            ...(() => {
              const imageModel = models.includes(prev.imageModel.model_name)
                ? prev.imageModel
                : resetImageModelStatus({ ...prev.imageModel, model_name: models[0] });
              return {
                imageModel,
                imageModelProfiles: {
                  ...prev.imageModelProfiles,
                  [prev.imageModel.provider]: imageProfileFromState(imageModel),
                },
              };
            })(),
          }));
        }
        showToast(result?.message || `获取到 ${models.length} 个${providerLabel}模型`, result?.success ? 'success' : 'info');
        return;
      }

      if (state.imageModel.provider === 'volcengine') {
        setImageModels([]);
        showToast('火山方舟请填写控制台中已开通的模型或推理接入点 ID。');
        return;
      }

      if (state.imageModel.provider === 'google-ai-studio') {
        const models = [
          'gemini-3.1-flash-image-preview',
          'gemini-3-pro-image-preview',
          'gemini-2.5-flash-image',
        ];
        setImageModels(models);
        setState((prev) => ({
          ...prev,
          ...(() => {
            const imageModel = models.includes(prev.imageModel.model_name)
              ? prev.imageModel
              : resetImageModelStatus({ ...prev.imageModel, model_name: models[0] });
            return {
              imageModel,
              imageModelProfiles: {
                ...prev.imageModelProfiles,
                [prev.imageModel.provider]: imageProfileFromState(imageModel),
              },
            };
          })(),
        }));
        showToast('已载入 Google AI Studio 生图模型', 'success');
        return;
      }

      setImageModels([]);
      showToast('该服务商模型列表接口暂未接入。');
    } finally {
      setLoadingModels(null);
    }
  };

  const isActiveTabDirty = () => {
    if (!savedConfig) {
      return false;
    }

    if (activeTab === 'text-model') {
      return JSON.stringify({
        provider: state.textModel.provider,
        profiles: getCurrentTextModelProfiles(),
      }) !== JSON.stringify({
        provider: savedConfig.text_model_provider,
        profiles: normalizeTextModelProfiles(savedConfig.text_model_profiles),
      });
    }

    if (activeTab === 'general') {
      return Boolean(state.general.developer_mode) !== Boolean(savedConfig.developer_mode);
    }

    if (activeTab === 'image-model') {
      return JSON.stringify({
        provider: state.imageModel.provider,
        profiles: getCurrentImageModelProfiles(),
      }) !== JSON.stringify({
        provider: savedConfig.image_model.provider,
        profiles: normalizeImageModelProfiles(savedConfig.image_model_profiles),
      });
    }

    if (activeTab === 'file-parser') {
      return JSON.stringify(state.fileParser) !== JSON.stringify(savedConfig.file_parser);
    }

    if (activeTab === 'skills') {
      return JSON.stringify(normalizeSkillSettings(state.skillSettings)) !== JSON.stringify(normalizeSkillSettings(savedConfig.skill_settings));
    }

    if (activeTab === 'features') {
      return JSON.stringify(normalizeFeatureModuleSettings(state.featureModuleSettings)) !== JSON.stringify(normalizeFeatureModuleSettings(savedConfig.feature_module_settings));
    }

    return false;
  };

  const saveActiveTabConfig = async () => {
    if (activeTab === 'general') {
      await saveClientConfig(createClientConfig());
      return;
    }
    if (activeTab === 'text-model') {
      await saveTextConfig();
      return;
    }
    if (activeTab === 'image-model') {
      await saveImageConfig();
      return;
    }
    if (activeTab === 'file-parser') {
      await saveFileParserConfig();
      return;
    }
    if (activeTab === 'skills') {
      await saveClientConfig(createClientConfig());
      return;
    }
    if (activeTab === 'features') {
      await saveClientConfig(createClientConfig());
    }
  };

  const canSaveActiveTab = activeTab === 'general' || activeTab === 'text-model' || activeTab === 'image-model' || activeTab === 'file-parser' || activeTab === 'skills' || activeTab === 'features';
  const activeTabDirty = isActiveTabDirty();
  const currentTextProviderDefault = textProviderDefaults[state.textModel.provider];
  const imageModelStatus: ImageModelStatus = state.imageModel.status || 'untested';
  const currentImageStatus = imageStatusMeta[imageModelStatus];
  const imageTestTime = formatImageTestTime(state.imageModel.tested_at);
  const settingsToolbarGroups: FloatingToolbarGroup[] = canSaveActiveTab
    ? [
        {
          id: 'settings-save-state',
          actions: [
            {
              id: 'save-state',
              label: activeTabDirty ? '未保存' : '已保存',
              variant: 'ghost',
              disabled: true,
              onClick: () => undefined,
            },
          ],
        },
        {
          id: 'settings-save-action',
          actions: [
            {
              id: 'save',
              label: '保存',
              variant: 'primary',
              disabled: !activeTabDirty,
              tooltip: activeTabDirty ? '保存当前设置' : '当前设置已保存',
              onClick: saveActiveTabConfig,
            },
          ],
        },
      ]
    : [];

  const hasNewRelease = Boolean(latestRelease?.version && compareVersions(latestRelease.version, appVersion) > 0);
  const latestDownloadUrl = isDirectReleaseDownloadUrl(latestRelease?.download_url) ? latestRelease?.download_url : '';
  const releaseDownloading = releaseDownloadState.status === 'downloading';
  const releaseDownloaded = releaseDownloadState.status === 'downloaded' || releaseDownloadState.status === 'installing';
  const releaseInstalling = releaseDownloadState.status === 'installing';
  const releaseProgressText = releaseDownloadState.total > 0
    ? `${formatBytes(releaseDownloadState.transferred)} / ${formatBytes(releaseDownloadState.total)}`
    : formatBytes(releaseDownloadState.transferred);
  const releaseSpeedText = releaseDownloading && releaseDownloadState.bytesPerSecond > 0
    ? `${formatBytes(releaseDownloadState.bytesPerSecond)}/s`
    : '';

  return (
    <div className="settings-page">
      <div className="settings-page-scroll">
        <div className="settings-tab-shell" role="tablist" aria-label="设置分类">
          {settingsTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`settings-tab ${activeTab === tab.id ? 'is-active' : ''}`}
              onClick={() => {
                window.localStorage.setItem(SETTINGS_ACTIVE_TAB_KEY, tab.id);
                setActiveTab(tab.id);
              }}
              role="tab"
              aria-selected={activeTab === tab.id}
            >
              {tab.label}
            </button>
          ))}
        </div>

      {activeTab === 'general' && (
        <section className="settings-page-section">
          <div className="settings-section-title">
            <span />
            <strong>通用</strong>
          </div>
          <div className="settings-list">
            <div className="settings-row">
              <div className="settings-row-copy">
                <strong>显示语言</strong>
                <span>选择界面的显示语言</span>
              </div>
              <select value="zh-CN" disabled>
                <option value="zh-CN">简体中文</option>
              </select>
            </div>
            <div className="settings-row">
              <div className="settings-row-copy">
                <strong>应用主题</strong>
                <span>切换深色或浅色模式</span>
              </div>
              <select value="system" disabled>
                <option value="system">跟随系统</option>
              </select>
            </div>
            <div className="settings-row">
              <div className="settings-row-copy">
                <strong>侧边栏布局</strong>
                <span>保持当前经典布局，后续可扩展为紧凑布局</span>
              </div>
              <select value="classic" disabled>
                <option value="classic">经典布局</option>
              </select>
            </div>
            <label className="settings-row">
              <div className="settings-row-copy">
                <strong>开发者模式</strong>
                <span>会打乱既有工作流，生成大量日志占用磁盘空间，<strong>非专业人士请勿开启</strong></span>
              </div>
              <span className="settings-switch-control">
                <input
                  type="checkbox"
                  checked={state.general.developer_mode}
                  onChange={(event) => updateDeveloperMode(event.target.checked)}
                />
                <span className="settings-switch-track" aria-hidden="true">
                  <span className="settings-switch-thumb" />
                </span>
              </span>
            </label>
            {state.general.developer_mode && (
              <div className="settings-row">
                <div className="settings-row-copy">
                  <strong>配置文件夹</strong>
                  <span>打开本机配置、工作区缓存和开发者日志所在目录</span>
                </div>
                <div className="settings-action-cell">
                  <button type="button" className="inline-action" onClick={openConfigFolder}>
                    打开配置文件夹
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {activeTab === 'text-model' && (
        <section className="settings-page-section">
          <div className="settings-section-title">
            <span />
            <strong>文本模型配置</strong>
          </div>
          <div className="settings-list">
            <label className="settings-row">
              <div className="settings-row-copy">
                <div className="settings-provider-title">
                  <strong>服务提供商</strong>
                  {(state.textModel.provider === 'agnes-ai-cn' || state.textModel.provider === 'agnes-ai-global') && (
                    <button type="button" className="settings-notice-link" onClick={() => setAgnesNoticeOpen(true)}>
                      🔔 查看使用公告
                    </button>
                  )}
                </div>
                <span>选择服务商会自动使用预置 Base URL；只有自定义服务商允许修改</span>
                {(state.textModel.provider === 'agnes-ai-cn' || state.textModel.provider === 'agnes-ai-global') && (
                  <span>
                    注册地址：
                    <button
                      type="button"
                      className="settings-inline-link"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        void openAgnesAiRegisterPage(state.textModel.provider === 'agnes-ai-cn' ? agnesAiCnRegisterUrl : agnesAiGlobalRegisterUrl);
                      }}
                    >
                      {state.textModel.provider === 'agnes-ai-cn' ? agnesAiCnRegisterUrl : agnesAiGlobalRegisterUrl}
                    </button>
                  </span>
                )}
              </div>
              <select
                value={state.textModel.provider}
                onChange={(event) => updateTextModelProvider(event.target.value as TextModelProvider)}
              >
                {textModelProviders.map((provider) => (
                  <option value={provider.value} key={provider.value}>{provider.label}</option>
                ))}
              </select>
            </label>
            <label className="settings-row">
              <div className="settings-row-copy">
                <strong>Base URL</strong>
                <span>OpenAI Like 接口地址，用于文本生成和分析任务</span>
              </div>
              <input
                type="text"
                value={state.textModel.base_url}
                placeholder={currentTextProviderDefault.base_url || '例如 https://api.openai.com/v1'}
                onChange={(event) => updateTextModelConfig({ base_url: event.target.value }, { clearModels: true })}
                disabled={state.textModel.provider !== 'custom'}
              />
            </label>
            <label className="settings-row">
              <div className="settings-row-copy">
                <strong>API Key</strong>
                <span>仅保存在本机配置文件中，不暴露给 Renderer 以外的原始能力</span>
              </div>
              <InputWithAction
                type="password"
                value={state.textModel.api_key}
                placeholder="请输入文本模型 API Key"
                onChange={(event) => updateTextModelConfig({ api_key: event.target.value }, { clearModels: true })}
                actionLabel="获取"
                actionTitle="打开当前服务商的 API Key 获取页面"
                actionDisabled={!textProviderApiKeyUrls[state.textModel.provider]}
                onAction={() => { void openTextProviderApiKeyPage(); }}
              />
            </label>
            <label className="settings-row">
              <div className="settings-row-copy">
                <strong>模型名称</strong>
                <span>可手动录入，也可从当前 Base URL 拉取可用模型</span>
              </div>
              <div className="settings-control-with-action">
                {textModels.length > 0 ? (
                  <select
                    value={state.textModel.model_name}
                    onChange={(event) => updateTextModelConfig({ model_name: event.target.value })}
                  >
                    {textModels.map((model) => <option value={model} key={model}>{model}</option>)}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={state.textModel.model_name}
                    placeholder="例如 deepseek-chat"
                    onChange={(event) => updateTextModelConfig({ model_name: event.target.value })}
                  />
                )}
                <button
                  type="button"
                  className="inline-action"
                  onClick={fetchTextModels}
                  disabled={loadingModels === 'text'}
                >
                  {loadingModels === 'text' && <span className="inline-spinner" aria-hidden="true" />}
                  {loadingModels === 'text' ? '获取中' : '获取'}
                </button>
                <button type="button" className="inline-action" onClick={testTextConfig} disabled={testingTextModel}>
                  {testingTextModel && <span className="inline-spinner" aria-hidden="true" />}
                  {testingTextModel ? '测试中' : '测试'}
                </button>
                <button type="button" className="inline-action" onClick={() => { void fetchTextModelCapabilities(); }}>
                  探测能力
                </button>
              </div>
              {textModelCapabilities && (
                <div className="model-capability-summary">
                  <span className="model-capability-source">{textModelCapabilities.source === 'remote' ? '远程信息' : textModelCapabilities.source === 'cache' ? '本地缓存' : textModelCapabilities.known ? '官方信息' : '基础信息'}</span>
                  {textModelCapabilities.contextLength ? <span>上下文 {textModelCapabilities.contextLength.toLocaleString()} tokens</span> : null}
                  {textModelCapabilities.maxOutputTokens ? <span>最大输出 {textModelCapabilities.maxOutputTokens.toLocaleString()} tokens</span> : null}
                  {textModelCapabilities.supportsVision ? <span>支持视觉</span> : null}
                  {textModelCapabilities.supportsThinking ? <span>支持思考</span> : null}
                  {textModelCapabilities.supportsJsonMode ? <span>支持 JSON</span> : null}
                  {!textModelCapabilities.contextLength && !textModelCapabilities.maxOutputTokens && !textModelCapabilities.supportsVision && !textModelCapabilities.supportsThinking && !textModelCapabilities.supportsJsonMode ? <span>服务商未返回标准能力字段，现有生成逻辑不受影响</span> : null}
                </div>
              )}
            </label>
            {supportsThinkingSettings(state.textModel.provider) && (
              <label className="settings-row">
                <div className="settings-row-copy">
                  <strong>Thinking 模式与推理设置</strong>
                  <span>{state.textModel.provider === 'deepseek' ? 'DeepSeek 使用 High / Max 推理强度；开启后会增加推理时间和 Token 消耗。' : state.textModel.provider === 'longcat' ? 'LongCat 使用 Thinking 开关，由模型自动控制推理预算。' : 'Agnes 开启后使用更深度的推理 Token 预算，默认关闭。'}</span>
                </div>
                <div className="settings-control-with-action thinking-settings-control">
                  <select
                    value={state.textModelOptions.thinking_enabled ? 'enabled' : 'disabled'}
                    onChange={(event) => setState((prev) => ({
                      ...prev,
                      textModelOptions: { ...prev.textModelOptions, thinking_enabled: event.target.value === 'enabled' },
                    }))}
                  >
                    <option value="disabled">关闭</option>
                    <option value="enabled">开启</option>
                  </select>
                  {state.textModel.provider === 'deepseek' ? (
                    <select
                      value={state.textModelOptions.thinking_effort || 'high'}
                      onChange={(event) => setState((prev) => ({
                        ...prev,
                        textModelOptions: { ...prev.textModelOptions, thinking_effort: event.target.value === 'max' ? 'max' : 'high' },
                      }))}
                      disabled={!state.textModelOptions.thinking_enabled}
                      aria-label="DeepSeek 推理强度"
                    >
                      <option value="high">High</option>
                      <option value="max">Max</option>
                    </select>
                  ) : state.textModel.provider === 'longcat' ? (
                    <span className="thinking-settings-note">模型自动控制</span>
                  ) : (
                    <div className="thinking-budget-field">
                    <input
                      type="number"
                      min={256}
                      max={65536}
                      step={256}
                      value={state.textModelOptions.thinking_budget_tokens}
                      onChange={(event) => setState((prev) => ({
                        ...prev,
                        textModelOptions: {
                          ...prev.textModelOptions,
                          thinking_budget_tokens: Math.max(256, Math.min(65536, Number(event.target.value) || 2048)),
                        },
                      }))}
                      disabled={!state.textModelOptions.thinking_enabled}
                      aria-label="Thinking 推理 Token 预算"
                    />
                    <span>Token</span>
                    </div>
                  )}
                </div>
              </label>
            )}
          </div>
        </section>
      )}

      {activeTab === 'image-model' && (
        <section className="settings-page-section">
          <div className="settings-section-title">
            <span />
            <strong>生图模型配置</strong>
          </div>
          <div className={`image-model-status is-${imageModelStatus}`}>
            <div>
              <strong>接口状态：{currentImageStatus.label}</strong>
              <span>{currentImageStatus.description}</span>
              {imageTestTime && <small>最近测试：{imageTestTime}</small>}
              {imageModelStatus === 'unavailable' && state.imageModel.last_error && <small>失败原因：{state.imageModel.last_error}</small>}
            </div>
            <em>{currentImageStatus.label}</em>
          </div>
          <div className="settings-list">
            <label className="settings-row">
              <div className="settings-row-copy">
                <div className="settings-provider-title">
                  <strong>服务提供商</strong>
                  {(state.imageModel.provider === 'agnes-ai-cn' || state.imageModel.provider === 'agnes-ai-global') && (
                    <button type="button" className="settings-notice-link" onClick={() => setAgnesNoticeOpen(true)}>
                      🔔 查看使用公告
                    </button>
                  )}
                </div>
                <span>各家生图接口不统一，先选择服务商再配置模型</span>
                {(state.imageModel.provider === 'agnes-ai-cn' || state.imageModel.provider === 'agnes-ai-global') && (
                  <span>
                    注册地址：
                    <button
                      type="button"
                      className="settings-inline-link"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        void openAgnesAiRegisterPage(state.imageModel.provider === 'agnes-ai-cn' ? agnesAiCnRegisterUrl : agnesAiGlobalRegisterUrl);
                      }}
                    >
                      {state.imageModel.provider === 'agnes-ai-cn' ? agnesAiCnRegisterUrl : agnesAiGlobalRegisterUrl}
                    </button>
                  </span>
                )}
              </div>
              <select
                value={state.imageModel.provider}
                onChange={(event) => {
                  const provider = event.target.value as ImageModelProvider;
                  updateImageModelProvider(provider);
                }}
              >
                {imageProviders.map((provider) => (
                  <option value={provider.value} key={provider.value}>{provider.label}</option>
                ))}
              </select>
            </label>
            <label className="settings-row">
              <div className="settings-row-copy">
                <strong>Base URL</strong>
                <span>{getImageBaseUrlDescription(state.imageModel.provider)}</span>
              </div>
              <input
                type="text"
                value={state.imageModel.base_url || ''}
                placeholder={state.imageModel.provider === 'custom' ? 'https://api.example.com/v1' : imageProviderDefaults[state.imageModel.provider].base_url}
                onChange={(event) => updateImageModelConfig({ base_url: event.target.value }, { clearModels: true })}
                disabled={state.imageModel.provider !== 'custom'}
              />
            </label>
            <label className="settings-row">
              <div className="settings-row-copy">
                <strong>API Key</strong>
                <span>{getImageApiKeyDescription(state.imageModel.provider)}</span>
              </div>
              <InputWithAction
                type="password"
                value={state.imageModel.api_key}
                placeholder="请输入生图服务 API Key"
                onChange={(event) => updateImageModelConfig({ api_key: event.target.value }, { clearModels: true })}
                actionLabel="获取"
                actionTitle="打开当前生图服务商的 API Key 获取页面"
                onAction={() => { void openImageProviderApiKeyPage(); }}
              />
            </label>
            <label className="settings-row">
              <div className="settings-row-copy">
                <strong>模型名称</strong>
                <span>{getImageModelDescription(state.imageModel.provider)}</span>
              </div>
              <div className="settings-control-with-action">
                {imageModels.length > 0 ? (
                  <select
                    value={state.imageModel.model_name}
                    onChange={(event) => updateImageModelConfig({ model_name: event.target.value })}
                  >
                    {imageModels.map((model) => <option value={model} key={model}>{model}</option>)}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={state.imageModel.model_name}
                    placeholder={getImageModelPlaceholder(state.imageModel.provider)}
                    onChange={(event) => updateImageModelConfig({ model_name: event.target.value })}
                  />
                )}
                <button
                  type="button"
                  className="inline-action"
                  onClick={fetchImageModels}
                  disabled={loadingModels === 'image'}
                >
                  {loadingModels === 'image' && <span className="inline-spinner" aria-hidden="true" />}
                  {loadingModels === 'image' ? '获取中' : '获取'}
                </button>
                <button type="button" className="inline-action" onClick={testImageConfig} disabled={testingImageModel}>
                  {testingImageModel && <span className="inline-spinner" aria-hidden="true" />}
                  {testingImageModel ? '测试中' : '测试'}
                </button>
              </div>
            </label>
            {(state.imageModel.provider === 'agnes-ai-cn' || state.imageModel.provider === 'agnes-ai-global') && (
              <label className="settings-row">
                <div className="settings-row-copy">
                  <strong>输出质量与比例</strong>
                  <span>Agnes Image 2.1 使用质量档位与宽高比；Image 2.0 会继续使用兼容尺寸。</span>
                </div>
                <div className="settings-control-with-action image-generation-options-control">
                  <select
                    value={state.imageModel.size || '2K'}
                    onChange={(event) => updateImageModelConfig({ size: event.target.value })}
                  >
                    <option value="1K">1K</option>
                    <option value="2K">2K</option>
                    <option value="3K">3K</option>
                    <option value="4K">4K</option>
                  </select>
                  <select
                    value={state.imageModel.ratio || '1:1'}
                    onChange={(event) => updateImageModelConfig({ ratio: event.target.value })}
                  >
                    {['1:1', '16:9', '9:16', '4:3', '3:4', '2:3', '3:2', '21:9'].map((ratio) => <option value={ratio} key={ratio}>{ratio}</option>)}
                  </select>
                </div>
              </label>
            )}
          </div>
          {imageTestPreview && (
            <div className="image-test-preview">
              <div>
                <strong>{imageTestPreview.title}</strong>
                <span>用于确认当前生图配置可用</span>
              </div>
              <img src={imageTestPreview.src} alt="生图模型测试结果" />
            </div>
          )}
        </section>
      )}

      {activeTab === 'file-parser' && (
        <section className="settings-page-section">
          <div className="settings-section-title">
            <span />
            <strong>文件解析配置</strong>
          </div>
          <div className="settings-list">
            <label className="settings-row">
              <div className="settings-row-copy">
                <strong>文件解析方式</strong>
                <span>优先使用本地解析，复杂扫描件可尝试 MinerU 精准解析 API</span>
              </div>
              <select
                value={state.fileParser.provider}
                onChange={(event) => setState((prev) => ({
                ...prev,
                fileParser: { ...prev.fileParser, provider: event.target.value as FileParserProvider },
              }))}
            >
              {fileParserProviders.map((provider) => (
                  <option value={provider.value} key={provider.value}>{provider.label}</option>
                ))}
              </select>
            </label>
            {state.fileParser.provider === 'mineru-accurate-api' && (
              <label className="settings-row">
                <div className="settings-row-copy">
                  <strong>MinerU Token</strong>
                  <span>仅精准解析 API 需要 Token；轻量解析和本地解析无需填写</span>
                </div>
                <input
                  type="password"
                  value={state.fileParser.mineru_token || ''}
                  placeholder="请输入 MinerU Token"
                  onChange={(event) => setState((prev) => ({
                    ...prev,
                    fileParser: { ...prev.fileParser, mineru_token: event.target.value },
                  }))}
                />
              </label>
            )}
          </div>

          <div className="parser-compare">
            {parserOptions.map((option) => (
              <article className={`parser-card parser-card-${option.tone}`} key={option.title}>
                <div className="parser-card-head">
                  <div>
                    <strong>{option.title}</strong>
                    <p>{option.summary}</p>
                  </div>
                  <span>{option.badge}</span>
                </div>
                <dl className="parser-metrics">
                  {option.items.map(([label, value]) => (
                    <div key={`${option.title}-${label}`}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              </article>
            ))}
          </div>
          <div className="parser-note">
            招标文件大多数是 Word 或 Word 导出的带文字层 PDF，本地解析可以适应 95% 以上的情况；如果解析失败，再尝试 MinerU 精准解析 API。
          </div>
        </section>
      )}

      {activeTab === 'features' && (
        <section className="settings-page-section">
          <div className="settings-section-title">
            <span />
            <strong>功能管理</strong>
          </div>
          <div className="feature-manager-note">
            默认显示全部模块。关闭后只隐藏侧边栏入口和首页快捷入口，不删除本机工作区数据，后续可随时重新开启。
          </div>
          <div className="settings-list">
            {configurableFeatureModules.map((module) => {
              const enabled = state.featureModuleSettings.modules[module.id]?.enabled !== false;
              return (
                <label className="settings-row" key={module.id}>
                  <div className="settings-row-copy">
                    <strong>{module.label}</strong>
                    <span>{module.description}</span>
                  </div>
                  <span className="settings-switch-control">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(event) => updateFeatureModule(module.id, event.target.checked)}
                    />
                    <span className="settings-switch-track" aria-hidden="true">
                      <span className="settings-switch-thumb" />
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </section>
      )}

      {activeTab === 'skills' && (
        <section className="settings-page-section">
          <div className="settings-section-title">
            <span />
            <strong>技能管理</strong>
          </div>
          <div className="skill-manager">
            <article className={`skill-card ${state.skillSettings.skills['word-optimization'].enabled ? 'is-enabled' : ''}`}>
              <div className="skill-card-main">
                <div className="skill-card-head">
                  <div>
                    <strong>word-optimization</strong>
                    <span>优化标书生成完成后的 Word 导出版式</span>
                  </div>
                  <em>{state.skillSettings.skills['word-optimization'].enabled ? '已启用' : '已停用'}</em>
                </div>
                <p>启用后，导出 Word 会统一正文、标题、表格、图片、题注、页码和常见编号缩进，便于后续直接制作目录和交付排版。</p>
                <div className="skill-capability-grid">
                  <span>正文两端对齐、首行缩进、固定 28 磅行距</span>
                  <span>表格黑色边框、表头重复、按窗口自适应</span>
                  <span>图片居中嵌入，并限制在页边距内</span>
                  <span>自动生成图表题注和居中页码</span>
                  <span>常见编号段落应用悬挂缩进</span>
                  <span>标题应用黑体并接入多级编号</span>
                </div>
              </div>
              <label className="skill-toggle">
                <span className="settings-switch-control">
                  <input
                    type="checkbox"
                    checked={state.skillSettings.skills['word-optimization'].enabled}
                    onChange={(event) => updateWordOptimizationSkill(event.target.checked)}
                  />
                  <span className="settings-switch-track" aria-hidden="true">
                    <span className="settings-switch-thumb" />
                  </span>
                </span>
              </label>
            </article>
            <article className={`skill-card ${state.skillSettings.skills['technical-diagram'].enabled ? 'is-enabled' : ''}`}>
              <div className="skill-card-main">
                <div className="skill-card-head">
                  <div>
                    <strong>technical-diagram</strong>
                    <span>为技术方案生成结构化技术图谱</span>
                  </div>
                  <em>{state.skillSettings.skills['technical-diagram'].enabled ? '已启用' : '已停用'}</em>
                </div>
                <p>启用后，正文生成和已有技术方案扩写会为适合的小节生成架构图、部署拓扑、数据流和复杂流程图，默认使用本地 SVG 技术图资产。</p>
                <div className="skill-capability-grid">
                  <span>系统架构、部署拓扑和模块关系图</span>
                  <span>数据流、业务流程和运维流程图</span>
                  <span>结构化节点、分层和箭头语义</span>
                  <span>与 AI 生图、Mermaid 配图自动择优</span>
                  <span>图片资产保存在本地工作区</span>
                  <span>默认关闭，需手动启用后生效</span>
                </div>
              </div>
              <label className="skill-toggle">
                <span className="settings-switch-control">
                  <input
                    type="checkbox"
                    checked={state.skillSettings.skills['technical-diagram'].enabled}
                    onChange={(event) => updateTechnicalDiagramSkill(event.target.checked)}
                  />
                  <span className="settings-switch-track" aria-hidden="true">
                    <span className="settings-switch-thumb" />
                  </span>
                </span>
              </label>
            </article>
          </div>
        </section>
      )}

      {activeTab === 'plugins' && <PluginManagementPanel />}

      {activeTab === 'usage' && (
        <section className="settings-page-section usage-stats-section">
          <div className="settings-section-title usage-section-title">
            <span />
            <strong>本地用量统计</strong>
            <button type="button" className="inline-action usage-clear-action" onClick={() => void clearUsageStats()} disabled={!usageStats?.totals.requests}>清空本地统计</button>
          </div>
          <div className="feature-manager-note">仅统计本机通过客户端完成的文本模型请求，不上传到任何远程统计服务；服务商未返回 Token 时不会估算。</div>
          <div className="usage-kpi-grid">
            {[
              ['请求次数', '已完成文本请求', usageStats?.totals.requests || 0],
              ['输入 Token', '提示词和上下文', usageStats?.totals.prompt_tokens || 0],
              ['输出 Token', '模型返回内容', usageStats?.totals.completion_tokens || 0],
              ['总 Token', '输入与输出合计', usageStats?.totals.total_tokens || 0],
            ].map(([label, description, value]) => <article className="usage-kpi-card" key={String(label)}><span>{label}</span><strong>{Number(value).toLocaleString()}</strong><small>{description}</small></article>)}
          </div>
          <div className="usage-range-control">
            <label htmlFor="usage-trend-range">趋势范围</label>
            <select id="usage-trend-range" value={usageRange} onChange={(event) => setUsageRange(event.target.value as UsageTrendRange)}>
              <option value="1h">近 1 小时</option>
              <option value="6h">近 6 小时</option>
              <option value="1d">近 1 天</option>
              <option value="7d">近 7 天</option>
              <option value="14d">近 14 天</option>
            </select>
          </div>
          <UsageTrendChart trend={usageStats?.trend || []} range={usageRange} />
          <div className="usage-thinking-note">Thinking Token：{(usageStats?.totals.reasoning_tokens || 0).toLocaleString()}（仅服务商返回该字段时统计）</div>
          {usageStats?.by_model?.length ? (
            <div className="settings-list">
              {usageStats.by_model.map((item) => <div className="settings-row" key={`${item.provider}-${item.model}`}><div className="settings-row-copy"><strong>{item.model}</strong><span>{item.provider} · {item.requests} 次请求</span></div><strong>{item.total_tokens.toLocaleString()} Token</strong></div>)}
            </div>
          ) : <div className="parser-note">暂无已记录的文本模型用量。</div>}
        </section>
      )}

      {activeTab === 'about' && (
        <section className="settings-page-section about-section">
          <div className="settings-section-title">
            <span />
            <strong>关于</strong>
          </div>
          <div className="about-grid">
            <div className="about-version-card">
              <button
                type="button"
                className="about-version-check"
                disabled={checkingLatestRelease}
                onClick={() => { void checkLatestRelease(); }}
              >
                {checkingLatestRelease ? '检测中...' : '检测版本'}
              </button>
              <span>当前版本</span>
              <strong>
                {appVersion || '...'}
                {hasNewRelease && (
                  <button
                    type="button"
                    className="version-new-badge"
                    onClick={() => setReleaseDialogOpen(true)}
                    aria-label="查看新版更新详情"
                  >
                    NEW
                  </button>
                )}
              </strong>
              {latestRelease?.version && (
                <small className={`about-version-state ${hasNewRelease ? 'has-update' : 'is-latest'}`}>
                  {hasNewRelease ? `最新版本为：${latestRelease.version}` : '已是最新版'}
                </small>
              )}
            </div>
            <div className="about-project-card">
              <span>项目代号</span>
              <strong>YuDuBid</strong>
              <span className="about-brand-producer" aria-label="禹都一只猫出品">
                <span className="about-brand-mark">
                  <img src={brandProducerLogo} alt="禹都一只猫" />
                  <sup className="about-brand-copyright" aria-hidden="true">©</sup>
                </span>
                <b>出品</b>
              </span>
            </div>
          </div>
          <Dialog.Root open={releaseDialogOpen} onOpenChange={setReleaseDialogOpen}>
            <Dialog.Portal>
              <Dialog.Overlay className="content-regenerate-modal" />
              <Dialog.Content className="release-detail-card">
                <div className="release-detail-head">
                  <span>NEW</span>
                  <Dialog.Title>{latestRelease?.name || `新版 ${latestRelease?.version || ''}`}</Dialog.Title>
                  <Dialog.Description>
                    当前版本 {appVersion || '...'}，最新版本 {latestRelease?.version || '...'}
                  </Dialog.Description>
                  <Dialog.Close className="release-detail-close" type="button" aria-label="关闭更新详情">×</Dialog.Close>
                </div>
                <div className="release-detail-body">
                  {latestRelease?.body ? (
                    <MarkdownRenderer allowRawHtml={false}>{latestRelease.body}</MarkdownRenderer>
                  ) : (
                    <p>该版本暂未填写更新详情。</p>
                  )}
                </div>
                {latestRelease?.download_name && latestDownloadUrl && (
                  <div className="release-detail-download-name">已匹配当前系统安装包：{latestRelease.download_name}</div>
                )}
                {latestRelease && !latestDownloadUrl && (
                  <div className="release-detail-download-name release-detail-build-state">
                    <span>当前系统安装包正在构建或上传，请稍后刷新状态。</span>
                    <button type="button" onClick={() => { void checkLatestRelease(); }} disabled={checkingLatestRelease}>
                      {checkingLatestRelease ? '刷新中...' : '刷新状态'}
                    </button>
                  </div>
                )}
                {releaseDownloadState.status !== 'idle' && latestDownloadUrl && (
                  <div className={`release-download-progress is-${releaseDownloadState.status}`}>
                    <div className="release-download-progress-head">
                      <strong>
                        {releaseDownloaded ? '安装包已准备好' : releaseDownloading ? '正在下载安装包' : releaseDownloadState.status === 'error' ? '下载失败' : '安装包大小'}
                      </strong>
                      <span>{Math.round(releaseDownloadState.percent)}%</span>
                    </div>
                    <div className="release-download-progress-track" aria-hidden="true">
                      <span style={{ width: `${Math.max(0, Math.min(100, releaseDownloadState.percent))}%` }} />
                    </div>
                    <p>
                      {releaseDownloadState.message || releaseProgressText}
                      {releaseSpeedText ? ` · ${releaseSpeedText}` : ''}
                    </p>
                    {releaseDownloaded && (
                      <div className="release-download-path-row">
                        <button type="button" onClick={() => { void showDownloadedRelease(); }}>
                          最新安装包路径
                        </button>
                        <span title={releaseDownloadState.filePath || releaseDownloadState.fileName}>
                          {releaseDownloadState.fileName || '打开所在文件夹'}
                        </span>
                      </div>
                    )}
                  </div>
                )}
                <div className="release-detail-actions">
                  <Dialog.Close className="secondary-action" type="button">稍后再说</Dialog.Close>
                  <button
                    type="button"
                    className="secondary-action"
                    disabled={checkingLatestRelease || releaseDownloading || releaseInstalling}
                    title="重新检测当前系统安装包是否已构建完成"
                    onClick={() => { void checkLatestRelease(); }}
                  >
                    {checkingLatestRelease ? '刷新中...' : '刷新状态'}
                  </button>
                  <button
                    type="button"
                    className="secondary-action"
                    disabled={!latestDownloadUrl || releaseDownloading || releaseInstalling}
                    title={latestDownloadUrl ? '通过下载加速服务获取当前系统安装包' : '当前系统安装包仍在构建或上传'}
                    onClick={() => { void openLatestDownload({ accelerated: true }); }}
                  >
                    加速更新下载
                  </button>
                  {releaseDownloading && (
                    <button
                      type="button"
                      className="secondary-action"
                      title="取消当前安装包下载"
                      onClick={() => { void cancelReleaseDownload(); }}
                    >
                      取消更新
                    </button>
                  )}
                  <button
                    type="button"
                    className="primary-action"
                    disabled={!latestDownloadUrl || releaseDownloading || releaseInstalling}
                    title={latestDownloadUrl ? '下载并安装当前系统安装包' : '当前系统安装包仍在构建或上传'}
                    onClick={() => {
                      if (releaseDownloaded) {
                        void installDownloadedRelease();
                        return;
                      }
                      void downloadLatestRelease();
                    }}
                  >
                    {releaseInstalling ? '启动中...' : releaseDownloaded ? '立即安装' : releaseDownloading ? '下载中...' : '下载更新'}
                  </button>
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
          <div className="privacy-statement">
            <div className="privacy-statement-head">
              <span>Privacy</span>
              <strong>隐私声明</strong>
              <p>本工具尽量把数据处理留在本机和你自行选择的服务商之间，只保留运行所必需的最少信息。</p>
            </div>
            <div className="privacy-list">
              <article className="privacy-item">
                <span>01</span>
                <strong>你的业务数据不会被我收集</strong>
                <p>应用不会上传、收集或保存你配置的 API Key、导入的招标文件、解析后的文档内容、生成的方案正文、导出文件或其他业务结果。</p>
              </article>
              <article className="privacy-item">
                <span>02</span>
                <strong>线上 AI 请求只发送给你配置的服务商</strong>
                <p>当你使用 OpenAI 兼容接口、MinerU 或其他线上 API 时，应用会把完成任务所需的内容发送给你自行配置的服务商。这是实现文档解析、内容生成、模型测试等功能的必要步骤；这些请求不经过我的服务器，我也不会额外留存任何请求内容或生成结果。</p>
              </article>
              <article className="privacy-item">
                <span>03</span>
                <strong>本地纯净版不做使用上报</strong>
                <p>应用不会生成匿名统计 ID，也不会上报页面访问、功能使用次数或 AI 请求统计。除你主动配置或触发的模型 API、文件解析服务、版本更新检查等业务请求外，软件不连接项目自有统计服务。</p>
              </article>
            </div>
          </div>
        </section>
      )}
      <Dialog.Root open={agnesNoticeOpen} onOpenChange={setAgnesNoticeOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="content-regenerate-modal" />
          <Dialog.Content className="release-detail-card agnes-notice-card">
            <div className="release-detail-head">
              <span>NOTICE</span>
              <Dialog.Title>Agnes AI 国内站与国际站使用公告</Dialog.Title>
              <Dialog.Description>请选择与账户对应的注册站点和 Base URL。</Dialog.Description>
              <Dialog.Close className="release-detail-close" type="button" aria-label="关闭公告">×</Dialog.Close>
            </div>
            <pre className="agnes-notice-content">{agnesAiNotice}</pre>
            <div className="release-detail-actions">
              <Dialog.Close className="primary-action" type="button">知道了</Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      </div>
      <FloatingToolbar groups={settingsToolbarGroups} label="设置保存工具条" />
    </div>
  );
}

export default SettingsPage;

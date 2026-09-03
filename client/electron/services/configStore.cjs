const fs = require('node:fs');
const path = require('node:path');
const { getConfigFilePath } = require('../utils/paths.cjs');

const textModelProviders = ['agnes-ai-cn', 'agnes-ai-global', 'volcengine', 'xiaomi', 'deepseek', 'longcat', 'custom'];
const imageModelProviders = ['agnes-ai-cn', 'agnes-ai-global', 'volcengine', 'google-ai-studio', 'custom'];
const featureModuleIds = ['presales', 'bid', 'official-document', 'project-management', 'thesis-tutor', 'copyright', 'patent'];
const oldXiaomiBaseUrl = 'https://api.xiaomimimo.com/v1';
const agnesAiCnBaseUrl = 'https://api.agnes-ai.cn/v1';
const agnesAiGlobalBaseUrl = 'https://apihub.agnes-ai.com/v1';

const textProviderBaseUrls = {
  'agnes-ai-cn': agnesAiCnBaseUrl,
  'agnes-ai-global': agnesAiGlobalBaseUrl,
  volcengine: 'https://ark.cn-beijing.volces.com/api/v3',
  xiaomi: 'https://token-plan-cn.xiaomimimo.com/v1',
  deepseek: 'https://api.deepseek.com',
  longcat: 'https://api.longcat.chat/openai/v1',
  custom: '',
};

const defaultTextModelProfiles = {
  'agnes-ai-cn': {
    api_key: '',
    base_url: textProviderBaseUrls['agnes-ai-cn'],
    model_name: 'agnes-2.5-flash',
  },
  'agnes-ai-global': {
    api_key: '',
    base_url: textProviderBaseUrls['agnes-ai-global'],
    model_name: 'agnes-2.5-flash',
  },
  volcengine: {
    api_key: '',
    base_url: textProviderBaseUrls.volcengine,
    model_name: '',
  },
  xiaomi: {
    api_key: '',
    base_url: textProviderBaseUrls.xiaomi,
    model_name: '',
  },
  deepseek: {
    api_key: '',
    base_url: textProviderBaseUrls.deepseek,
    model_name: 'deepseek-v4-flash',
  },
  longcat: {
    api_key: '',
    base_url: textProviderBaseUrls.longcat,
    model_name: 'LongCat-2.0',
  },
  custom: {
    api_key: '',
    base_url: '',
    model_name: '',
  },
};

const defaultImageModelProfiles = {
  'agnes-ai-cn': {
    provider: 'agnes-ai-cn',
    base_url: agnesAiCnBaseUrl,
    api_key: '',
    model_name: 'agnes-image-2.1-flash',
    status: 'untested',
    tested_at: '',
    last_error: '',
  },
  'agnes-ai-global': {
    provider: 'agnes-ai-global',
    base_url: agnesAiGlobalBaseUrl,
    api_key: '',
    model_name: 'agnes-image-2.1-flash',
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

const defaultConfig = {
  text_model_provider: 'agnes-ai-cn',
  text_model_profiles: defaultTextModelProfiles,
  api_key: '',
  base_url: textProviderBaseUrls['agnes-ai-cn'],
  model_name: defaultTextModelProfiles['agnes-ai-cn'].model_name,
  text_model_options: {
    thinking_enabled: false,
    thinking_budget_tokens: 2048,
    thinking_effort: 'high',
  },
  image_model: {
    ...defaultImageModelProfiles['agnes-ai-cn'],
  },
  image_model_profiles: defaultImageModelProfiles,
  file_parser: {
    provider: 'local',
    mineru_token: '',
  },
  skill_settings: {
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
  feature_module_settings: {
    modules: featureModuleIds.reduce((modules, id) => ({
      ...modules,
      [id]: { id, enabled: true },
    }), {}),
  },
  developer_mode: false,
  model_capabilities_cache: {},
};

function isTextModelProvider(value) {
  return textModelProviders.includes(value);
}

function normalizeTextProviderId(value) {
  return value === 'agnes-ai' ? 'agnes-ai-cn' : value;
}

function isImageModelProvider(value) {
  return imageModelProviders.includes(value);
}

function normalizeImageProviderId(value) {
  return value === 'agnes-ai' ? 'agnes-ai-cn' : value;
}

function normalizeTextModelProfile(provider, profile) {
  const defaults = defaultTextModelProfiles[provider];
  const source = profile || {};
  const sourceBaseUrl = provider === 'custom'
    ? source.base_url !== undefined ? source.base_url : defaults.base_url
    : defaults.base_url;
  return {
    api_key: source.api_key !== undefined ? source.api_key : defaults.api_key,
    base_url: provider === 'xiaomi' && sourceBaseUrl === oldXiaomiBaseUrl ? defaults.base_url : sourceBaseUrl,
    model_name: (provider.startsWith('agnes-ai-') || provider === 'deepseek' || provider === 'longcat') && !source.model_name
      ? defaults.model_name
      : source.model_name !== undefined ? source.model_name : defaults.model_name,
  };
}

function normalizeTextModelProfiles(sourceProfiles) {
  const profiles = {};
  textModelProviders.forEach((provider) => {
    profiles[provider] = normalizeTextModelProfile(
      provider,
      sourceProfiles && typeof sourceProfiles === 'object'
        ? sourceProfiles[provider] || (provider === 'agnes-ai-cn' ? sourceProfiles['agnes-ai'] : null)
        : null,
    );
  });
  return profiles;
}

function textProfileFromFlatConfig(source, fallback, provider) {
  const sourceBaseUrl = provider === 'custom'
    ? source.base_url !== undefined ? source.base_url : fallback.base_url
    : fallback.base_url;
  return {
    api_key: source.api_key !== undefined ? source.api_key : fallback.api_key,
    base_url: provider === 'xiaomi' && sourceBaseUrl === oldXiaomiBaseUrl ? fallback.base_url : sourceBaseUrl,
    model_name: provider.startsWith('agnes-ai-') && !source.model_name
      ? fallback.model_name
      : source.model_name !== undefined ? source.model_name : fallback.model_name,
  };
}

function normalizeImageModelProfile(provider, profile) {
  const defaults = defaultImageModelProfiles[provider];
  const source = profile || {};
  return {
    provider,
    base_url: provider === 'custom'
      ? source.base_url !== undefined ? source.base_url : defaults.base_url
      : defaults.base_url,
    api_key: source.api_key !== undefined ? source.api_key : defaults.api_key,
    model_name: provider.startsWith('agnes-ai-') && !source.model_name
      ? defaults.model_name
      : source.model_name !== undefined ? source.model_name : defaults.model_name,
    size: source.size !== undefined ? source.size : defaults.size,
    ratio: source.ratio !== undefined ? source.ratio : defaults.ratio,
    status: source.status !== undefined ? source.status : defaults.status,
    tested_at: source.tested_at !== undefined ? source.tested_at : defaults.tested_at,
    last_error: source.last_error !== undefined ? source.last_error : defaults.last_error,
  };
}

function normalizeImageModelProfiles(sourceProfiles) {
  const profiles = {};
  imageModelProviders.forEach((provider) => {
    profiles[provider] = normalizeImageModelProfile(
      provider,
      sourceProfiles && typeof sourceProfiles === 'object'
        ? sourceProfiles[provider] || (provider === 'agnes-ai-cn' ? sourceProfiles['agnes-ai'] : null)
        : null,
    );
  });
  return profiles;
}

function normalizeSkillSettings(sourceSettings) {
  const sourceSkills = sourceSettings && typeof sourceSettings === 'object' && sourceSettings.skills && typeof sourceSettings.skills === 'object'
    ? sourceSettings.skills
    : {};
  const wordOptimization = sourceSkills['word-optimization'] && typeof sourceSkills['word-optimization'] === 'object'
    ? sourceSkills['word-optimization']
    : {};
  const technicalDiagram = sourceSkills['technical-diagram'] && typeof sourceSkills['technical-diagram'] === 'object'
    ? sourceSkills['technical-diagram']
    : {};

  return {
    skills: {
      'word-optimization': {
        id: 'word-optimization',
        enabled: wordOptimization.enabled === undefined ? true : Boolean(wordOptimization.enabled),
      },
      'technical-diagram': {
        id: 'technical-diagram',
        enabled: technicalDiagram.enabled === undefined ? false : Boolean(technicalDiagram.enabled),
      },
    },
  };
}

function normalizeFeatureModuleSettings(sourceSettings) {
  const sourceModules = sourceSettings && typeof sourceSettings === 'object' && sourceSettings.modules && typeof sourceSettings.modules === 'object'
    ? sourceSettings.modules
    : {};

  const modules = {};
  featureModuleIds.forEach((id) => {
    const sourceModule = sourceModules[id] && typeof sourceModules[id] === 'object' ? sourceModules[id] : {};
    modules[id] = {
      id,
      enabled: sourceModule.enabled === undefined ? true : Boolean(sourceModule.enabled),
    };
  });
  return { modules };
}

function normalizeConfig(config) {
  const source = config || {};
  const fileParser = source.file_parser ? source.file_parser : {};
  const hasTextProvider = Object.prototype.hasOwnProperty.call(source, 'text_model_provider');
  const normalizedSourceTextProvider = normalizeTextProviderId(source.text_model_provider);
  const sourceTextProvider = isTextModelProvider(normalizedSourceTextProvider)
    ? normalizedSourceTextProvider
    : '';
  const textModelProvider = sourceTextProvider || (hasTextProvider || config ? 'custom' : defaultConfig.text_model_provider);
  const textModelProfiles = normalizeTextModelProfiles(source.text_model_profiles);
  textModelProfiles[textModelProvider] = textProfileFromFlatConfig(source, textModelProfiles[textModelProvider], textModelProvider);
  const activeTextProfile = textModelProfiles[textModelProvider];
  const sourceImageModel = source.image_model && typeof source.image_model === 'object' ? source.image_model : {};
  const sourceCapabilityCache = source.model_capabilities_cache && typeof source.model_capabilities_cache === 'object'
    ? source.model_capabilities_cache
    : {};
  const sourceTextModelOptions = source.text_model_options && typeof source.text_model_options === 'object'
    ? source.text_model_options
    : {};
  const normalizedSourceImageProvider = normalizeImageProviderId(sourceImageModel.provider);
  const imageModelProvider = isImageModelProvider(normalizedSourceImageProvider) ? normalizedSourceImageProvider : defaultConfig.image_model.provider;
  const imageModelProfiles = normalizeImageModelProfiles(source.image_model_profiles);
  imageModelProfiles[imageModelProvider] = normalizeImageModelProfile(imageModelProvider, sourceImageModel);
  const activeImageProfile = imageModelProfiles[imageModelProvider];

  return {
    ...defaultConfig,
    text_model_provider: textModelProvider,
    text_model_profiles: textModelProfiles,
    api_key: activeTextProfile.api_key,
    base_url: activeTextProfile.base_url,
    model_name: activeTextProfile.model_name,
    text_model_options: {
      thinking_enabled: Boolean(sourceTextModelOptions.thinking_enabled),
      thinking_budget_tokens: Number.isFinite(Number(sourceTextModelOptions.thinking_budget_tokens))
        && Number(sourceTextModelOptions.thinking_budget_tokens) >= 256
        ? Math.min(65536, Math.floor(Number(sourceTextModelOptions.thinking_budget_tokens)))
        : defaultConfig.text_model_options.thinking_budget_tokens,
      thinking_effort: sourceTextModelOptions.thinking_effort === 'max' ? 'max' : 'high',
    },
    image_model: activeImageProfile,
    image_model_profiles: imageModelProfiles,
    file_parser: {
      provider: fileParser.provider || defaultConfig.file_parser.provider,
      mineru_token: fileParser.mineru_token || defaultConfig.file_parser.mineru_token,
    },
    skill_settings: normalizeSkillSettings(source.skill_settings),
    feature_module_settings: normalizeFeatureModuleSettings(source.feature_module_settings),
    developer_mode: source.developer_mode === undefined ? defaultConfig.developer_mode : Boolean(source.developer_mode),
    model_capabilities_cache: Object.fromEntries(Object.entries(sourceCapabilityCache).slice(-50)),
  };
}

function createConfigStore(app) {
  const configFile = getConfigFilePath(app);

  function persist(config) {
    const directory = path.dirname(configFile);
    fs.mkdirSync(directory, { recursive: true });
    const temporaryFile = `${configFile}.${process.pid}.${Date.now()}.tmp`;
    const content = `${JSON.stringify(config, null, 2)}\n`;
    try {
      fs.writeFileSync(temporaryFile, content, { encoding: 'utf-8', mode: 0o600 });
      fs.renameSync(temporaryFile, configFile);
    } catch (error) {
      // Windows may not replace an existing file with renameSync. Keep the
      // fallback narrowly scoped to this exact configuration file.
      if (error?.code === 'EEXIST' || error?.code === 'EPERM' || error?.code === 'ENOTEMPTY') {
        fs.copyFileSync(temporaryFile, configFile);
        fs.rmSync(temporaryFile, { force: true });
      } else {
        if (fs.existsSync(temporaryFile)) fs.rmSync(temporaryFile, { force: true });
        throw error;
      }
    }
  }

  return {
    getConfigFilePath() {
      return configFile;
    },

    load() {
      if (!fs.existsSync(configFile)) {
        const config = normalizeConfig();
        persist(config);
        return config;
      }

      try {
        const raw = fs.readFileSync(configFile, 'utf-8');
        const parsedConfig = JSON.parse(raw);
        const config = normalizeConfig(parsedConfig);
        if (JSON.stringify(parsedConfig) !== JSON.stringify(config)) {
          persist(config);
        }
        return config;
      } catch (error) {
        throw new Error(`配置文件读取失败：${error.message}`);
      }
    },

    save(config) {
      try {
        const currentConfig = fs.existsSync(configFile)
          ? normalizeConfig(JSON.parse(fs.readFileSync(configFile, 'utf-8')))
          : normalizeConfig();
        const nextConfig = normalizeConfig({
          ...currentConfig,
          ...config,
          text_model_profiles: {
            ...currentConfig.text_model_profiles,
            ...(config && config.text_model_profiles ? config.text_model_profiles : {}),
          },
          image_model_profiles: {
            ...currentConfig.image_model_profiles,
            ...(config && config.image_model_profiles ? config.image_model_profiles : {}),
          },
        });
        persist(nextConfig);
        return { success: true, message: '配置已保存', config_path: configFile };
      } catch (error) {
        throw new Error(`配置文件保存失败：${error.message}`);
      }
    },
  };
}

module.exports = {
  createConfigStore,
};

export type TextModelProvider = 'agnes-ai-cn' | 'agnes-ai-global' | 'volcengine' | 'xiaomi' | 'deepseek' | 'longcat' | 'custom';

export interface TextModelConfig {
  api_key: string;
  base_url: string;
  model_name: string;
}

export type TextModelProfiles = Record<TextModelProvider, TextModelConfig>;

export interface AiConfig extends TextModelConfig {
  text_model_provider: TextModelProvider;
  text_model_profiles: TextModelProfiles;
  text_model_options?: TextModelOptions;
}

export interface TextModelOptions {
  thinking_enabled: boolean;
  thinking_budget_tokens: number;
  thinking_effort?: 'high' | 'max';
}

export interface ConfigSaveResult {
  success: boolean;
  message: string;
  config_path?: string;
}

export interface ModelListResult {
  success: boolean;
  message: string;
  models: string[];
}

export interface ModelCapabilityInfo {
  success: boolean;
  message: string;
  source: 'remote' | 'cache' | 'default';
  known?: boolean;
  provider?: string;
  model?: string;
  fetchedAt?: string;
  contextLength?: number;
  maxOutputTokens?: number;
  supportsTemperature?: boolean;
  supportsThinking?: boolean;
  supportsVision?: boolean;
  supportsJsonMode?: boolean;
  modalities?: string[];
}

export interface ImageModelTestResult {
  success: boolean;
  message: string;
  image_url?: string;
  image_data?: string;
  mime_type?: string;
}

export type ImageModelProvider = 'agnes-ai-cn' | 'agnes-ai-global' | 'volcengine' | 'google-ai-studio' | 'custom';
export type ImageModelStatus = 'untested' | 'available' | 'unavailable';

export interface ImageModelConfig {
  provider: ImageModelProvider;
  base_url?: string;
  api_key: string;
  model_name: string;
  size?: string;
  ratio?: string;
  status?: ImageModelStatus;
  tested_at?: string;
  last_error?: string;
}

export type ImageModelProfiles = Record<ImageModelProvider, ImageModelConfig>;

export type FileParserProvider = 'local' | 'mineru-accurate-api' | 'mineru-agent-api';

export interface FileParserConfig {
  provider: FileParserProvider;
  mineru_token?: string;
}

export type SkillId = 'word-optimization' | 'technical-diagram';

export interface SkillConfig {
  id: SkillId;
  enabled: boolean;
}

export interface SkillSettings {
  skills: Record<SkillId, SkillConfig>;
}

export type FeatureModuleId =
  | 'presales'
  | 'bid'
  | 'official-document'
  | 'grant-application'
  | 'project-management'
  | 'thesis-tutor'
  | 'copyright'
  | 'patent';

export interface FeatureModuleConfig {
  id: FeatureModuleId;
  enabled: boolean;
}

export interface FeatureModuleSettings {
  modules: Record<FeatureModuleId, FeatureModuleConfig>;
}

export interface ClientConfig extends AiConfig {
  image_model: ImageModelConfig;
  image_model_profiles: ImageModelProfiles;
  file_parser: FileParserConfig;
  skill_settings?: SkillSettings;
  feature_module_settings?: FeatureModuleSettings;
  developer_mode?: boolean;
  model_capabilities_cache?: Record<string, Omit<ModelCapabilityInfo, 'success' | 'message' | 'source'>>;
}

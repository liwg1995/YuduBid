import type { FeatureModuleSettings, FileParserConfig, ImageModelConfig, ImageModelProfiles, SkillSettings, TextModelConfig, TextModelOptions, TextModelProfiles, TextModelProvider } from '../../shared/types';

export interface SettingsPageState {
  textModel: TextModelConfig & {
    provider: TextModelProvider;
  };
  textModelProfiles: TextModelProfiles;
  textModelOptions: TextModelOptions;
  imageModel: ImageModelConfig;
  imageModelProfiles: ImageModelProfiles;
  fileParser: FileParserConfig;
  skillSettings: SkillSettings;
  featureModuleSettings: FeatureModuleSettings;
  general: {
    developer_mode: boolean;
  };
}

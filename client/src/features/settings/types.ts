import type { FileParserConfig, ImageModelConfig, ImageModelProfiles, SkillSettings, TextModelConfig, TextModelProfiles, TextModelProvider } from '../../shared/types';

export interface SettingsPageState {
  textModel: TextModelConfig & {
    provider: TextModelProvider;
  };
  textModelProfiles: TextModelProfiles;
  imageModel: ImageModelConfig;
  imageModelProfiles: ImageModelProfiles;
  fileParser: FileParserConfig;
  skillSettings: SkillSettings;
  general: {
    developer_mode: boolean;
  };
}

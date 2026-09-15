export type UiTheme = 'classic' | 'aurora' | 'dark';
export type UiThemePreference = UiTheme | 'system';

export const UI_THEME_STORAGE_KEY = 'yudubid-ui-theme';
export const UI_THEME_CHANGE_EVENT = 'yudubid-ui-theme-change';

export function normalizeUiThemePreference(value: string | null): UiThemePreference {
  return ['classic', 'aurora', 'dark', 'system'].includes(value || '') ? value as UiThemePreference : 'classic';
}

export function resolveUiTheme(preference: UiThemePreference): UiTheme {
  if (preference !== 'system') return preference;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'classic';
}

export function applyUiThemePreference(preference: UiThemePreference) {
  const resolved = resolveUiTheme(preference);
  document.documentElement.dataset.uiTheme = resolved;
  document.documentElement.dataset.uiThemePreference = preference;
  document.documentElement.style.colorScheme = resolved === 'dark' ? 'dark' : 'light';
}

export function getStoredUiThemePreference(): UiThemePreference {
  if (typeof window === 'undefined') return 'classic';
  return normalizeUiThemePreference(window.localStorage.getItem(UI_THEME_STORAGE_KEY));
}

export function setStoredUiThemePreference(preference: UiThemePreference) {
  window.localStorage.setItem(UI_THEME_STORAGE_KEY, preference);
  applyUiThemePreference(preference);
  window.dispatchEvent(new CustomEvent<UiThemePreference>(UI_THEME_CHANGE_EVENT, { detail: preference }));
}

import { applyUiThemePreference, getStoredUiThemePreference } from './uiTheme';

export type UiAppearance = 'classic' | 'modern';
export const UI_APPEARANCE_STORAGE_KEY = 'yudubid-ui-appearance';
export const UI_APPEARANCE_CHANGE_EVENT = 'yudubid-ui-appearance-change';

export function getStoredUiAppearance(): UiAppearance {
  return window.localStorage.getItem(UI_APPEARANCE_STORAGE_KEY) === 'classic' ? 'classic' : 'modern';
}

export function applyUiAppearance(appearance: UiAppearance) {
  document.documentElement.dataset.uiAppearance = appearance;
  applyUiThemePreference(getStoredUiThemePreference());
}

export function setStoredUiAppearance(appearance: UiAppearance) {
  window.localStorage.setItem(UI_APPEARANCE_STORAGE_KEY, appearance);
  applyUiAppearance(appearance);
  window.dispatchEvent(new CustomEvent<UiAppearance>(UI_APPEARANCE_CHANGE_EVENT, { detail: appearance }));
}

export const REDUCE_MOTION_STORAGE_KEY = 'yudubid-reduce-motion';
export const REDUCE_MOTION_CHANGE_EVENT = 'yudubid-reduce-motion-change';

export function getStoredReduceMotion(): boolean {
  return window.localStorage.getItem(REDUCE_MOTION_STORAGE_KEY) === 'true';
}

export function applyReduceMotion(reduceMotion: boolean) {
  document.documentElement.dataset.reduceMotion = String(reduceMotion);
}

export function setStoredReduceMotion(reduceMotion: boolean) {
  window.localStorage.setItem(REDUCE_MOTION_STORAGE_KEY, String(reduceMotion));
  applyReduceMotion(reduceMotion);
  window.dispatchEvent(new CustomEvent<boolean>(REDUCE_MOTION_CHANGE_EVENT, { detail: reduceMotion }));
}

export function shouldReduceMotion(): boolean {
  return getStoredReduceMotion() || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

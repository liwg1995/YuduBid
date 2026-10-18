import type { SectionId } from './types/navigation';

type NavigationBlocker = (destination: SectionId) => Promise<boolean>;

let activeBlocker: NavigationBlocker | null = null;

export function registerNavigationBlocker(blocker: NavigationBlocker) {
  activeBlocker = blocker;
  return () => {
    if (activeBlocker === blocker) activeBlocker = null;
  };
}

export function canNavigateToSection(destination: SectionId) {
  return activeBlocker?.(destination) ?? Promise.resolve(true);
}

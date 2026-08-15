import * as Tooltip from '@radix-ui/react-tooltip';
import { useEffect, useState, type ComponentType, type SVGProps } from 'react';

type UiTheme = 'classic' | 'aurora' | 'dark';
type ThemeIconProps = { 'aria-hidden'?: boolean | 'true' | 'false' };

const THEME_STORAGE_KEY = 'yudubid-ui-theme';

const themeOptions: Array<{
  id: UiTheme;
  label: string;
  shortLabel: string;
  Icon: ComponentType<ThemeIconProps>;
}> = [
  { id: 'classic', label: '经典风格', shortLabel: '经典', Icon: ClassicThemeIcon },
  { id: 'aurora', label: '柔光风格', shortLabel: '柔光', Icon: AuroraThemeIcon },
  { id: 'dark', label: '暗黑风格', shortLabel: '暗黑', Icon: DarkThemeIcon },
];

function applyTheme(theme: UiTheme) {
  document.documentElement.dataset.uiTheme = theme;
  document.documentElement.style.colorScheme = theme === 'dark' ? 'dark' : 'light';
}

function normalizeTheme(value: string | null): UiTheme {
  return themeOptions.some((option) => option.id === value) ? value as UiTheme : 'classic';
}

function loadInitialTheme(): UiTheme {
  if (typeof window === 'undefined') return 'classic';
  const theme = normalizeTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
  applyTheme(theme);
  return theme;
}

function ThemeSwitcher() {
  const [theme, setTheme] = useState<UiTheme>(loadInitialTheme);

  useEffect(() => {
    applyTheme(theme);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  return (
    <div className="theme-switcher" role="radiogroup" aria-label="页面风格切换">
      {themeOptions.map(({ id, label, shortLabel, Icon }) => (
        <Tooltip.Root key={id}>
          <Tooltip.Trigger asChild>
            <button
              type="button"
              className={`theme-switcher-button${theme === id ? ' is-active' : ''}`}
              onClick={() => setTheme(id)}
              role="radio"
              aria-checked={theme === id}
              aria-label={label}
            >
              <Icon aria-hidden="true" />
              <span>{shortLabel}</span>
            </button>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content className="tooltip-content" side="bottom" align="center" sideOffset={10}>
              {label}
              <Tooltip.Arrow className="tooltip-arrow" />
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      ))}
    </div>
  );
}

function ClassicThemeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" {...props}>
      <path d="M4.5 7.5h15" />
      <path d="M6.5 11h7" />
      <path d="M6.5 14.5h10" />
      <path d="M6.5 18h6" />
      <path d="M4.5 4.5h15v15h-15z" />
    </svg>
  );
}

function AuroraThemeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" {...props}>
      <path d="M5 17.5c2.4-5.6 4.9-8.4 7.4-8.4 1.9 0 2.7 1.45 4.4 1.45 1.05 0 1.95-.52 2.7-1.55" />
      <path d="M4.5 19.5h15" />
      <path d="M7.2 6.6h.02" />
      <path d="M12.2 4.9h.02" />
      <path d="M17.2 6.5h.02" />
    </svg>
  );
}

function DarkThemeIcon(props: ThemeIconProps) {
  return <span className="theme-switcher-dark-icon" {...props} />;
}

export default ThemeSwitcher;

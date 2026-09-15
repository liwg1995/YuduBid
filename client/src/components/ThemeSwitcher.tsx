import * as Tooltip from '@radix-ui/react-tooltip';
import { useEffect, useState, type ComponentType, type SVGProps } from 'react';
import { applyUiThemePreference, getStoredUiThemePreference, setStoredUiThemePreference, UI_THEME_CHANGE_EVENT, type UiThemePreference } from '../shared/uiTheme';

type ThemeIconProps = { 'aria-hidden'?: boolean | 'true' | 'false' };

const themeOptions: Array<{
  id: UiThemePreference;
  label: string;
  shortLabel: string;
  Icon: ComponentType<ThemeIconProps>;
}> = [
  { id: 'classic', label: '经典风格', shortLabel: '经典', Icon: ClassicThemeIcon },
  { id: 'aurora', label: '柔光风格', shortLabel: '柔光', Icon: AuroraThemeIcon },
  { id: 'dark', label: '暗黑风格', shortLabel: '暗黑', Icon: DarkThemeIcon },
  { id: 'system', label: '跟随系统', shortLabel: '系统', Icon: SystemThemeIcon },
];

function ThemeSwitcher() {
  const [theme, setTheme] = useState<UiThemePreference>(() => {
    const preference = getStoredUiThemePreference();
    applyUiThemePreference(preference);
    return preference;
  });

  useEffect(() => {
    applyUiThemePreference(theme);
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemChange = () => { if (theme === 'system') applyUiThemePreference('system'); };
    const handlePreferenceChange = (event: Event) => setTheme((event as CustomEvent<UiThemePreference>).detail);
    media.addEventListener('change', handleSystemChange);
    window.addEventListener(UI_THEME_CHANGE_EVENT, handlePreferenceChange);
    return () => {
      media.removeEventListener('change', handleSystemChange);
      window.removeEventListener(UI_THEME_CHANGE_EVENT, handlePreferenceChange);
    };
  }, [theme]);

  return (
    <div className="theme-switcher" role="radiogroup" aria-label="页面风格切换">
      {themeOptions.map(({ id, label, shortLabel, Icon }) => (
        <Tooltip.Root key={id}>
          <Tooltip.Trigger asChild>
            <button
              type="button"
              className={`theme-switcher-button${theme === id ? ' is-active' : ''}`}
              onClick={() => { setTheme(id); setStoredUiThemePreference(id); }}
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

function SystemThemeIcon(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" {...props}><rect x="3.5" y="4.5" width="17" height="12" rx="2" /><path d="M8 20h8M12 16.5V20" /></svg>;
}

export default ThemeSwitcher;

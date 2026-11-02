import type { ReactNode } from 'react';

/** 旧版保持原结构；新版折叠长配置，收起时仍保留输入状态。 */
export default function SettingsDisclosure({ modern, title, hint, children }: {
  modern: boolean; title: string; hint: string; children: ReactNode;
}) {
  return modern ? <details className="modern-settings-disclosure">
    <summary><strong>{title}</strong><span>{hint}</span></summary>
    <div className="modern-settings-disclosure-body">{children}</div>
  </details> : <>{children}</>;
}

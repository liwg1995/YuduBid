import { ConfigProvider, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { useMemo, type ReactNode } from 'react';
import type { ThemeConfig } from 'antd';
import useResolvedUiPalette from './useResolvedUiPalette';

/** 启象中的企业级控件统一使用品牌色、中文和克制的字阶。 */
export default function EnterpriseUiProvider({ children }: { children: ReactNode }) {
  const palette = useResolvedUiPalette();
  const config = useMemo<ThemeConfig>(() => {
    if (palette !== 'modern') {
      const css = getComputedStyle(document.documentElement);
      const color = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
      const surface = color('--yb-surface', '#ffffff');
      const control = color('--yb-control-bg', surface);
      return { algorithm: palette === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm, token: {
        colorPrimary: color('--yb-primary', '#2174fd'), colorLink: color('--yb-primary', '#2174fd'),
        colorBgContainer: surface, colorBgElevated: surface, colorText: color('--yb-text', '#172033'),
        colorTextSecondary: color('--yb-text-soft', '#606266'), colorTextPlaceholder: color('--yb-text-muted', '#909399'),
        colorBorder: color('--yb-control-border', '#dcdfe6'), colorBorderSecondary: color('--yb-border-soft', '#e8edf6'),
        fontSize:14, lineHeight:22/14, borderRadius:8, controlHeight:32,
      }, components: { Table: { headerBg:control, headerSortActiveBg:control, headerSortHoverBg:control, bodySortBg:surface, rowHoverBg:control, cellPaddingBlockMD:12, cellPaddingInlineMD:12 }, Progress: { defaultColor:color('--yb-primary', '#2174fd'), remainingColor:color('--yb-border', '#dcdfe6') } } };
    }
    return { algorithm: theme.darkAlgorithm, token: {
    colorPrimary: '#9b8cf6', colorLink: '#b9acff', colorLinkHover: '#d0c5ff',
    colorBgContainer: '#161f30', colorBgElevated: '#1a2638', colorText: '#edf0fa',
    colorTextSecondary: '#b1bad0', colorTextPlaceholder: '#94a3b8', colorTextDisabled: '#8491a9', colorBorder: '#354157', colorBorderSecondary: '#303a4d',
    fontSize: 14, lineHeight: 22 / 14, borderRadius: 8, controlHeight: 32,
  }, components: { Table: { headerBg: '#1b2638', headerSortActiveBg: '#1b2638', headerSortHoverBg: '#243149', bodySortBg: '#161f30', rowHoverBg: '#1a2638', cellPaddingBlockMD: 12, cellPaddingInlineMD: 12 }, Progress: { defaultColor: '#9b8cf6', remainingColor: '#303a4d' }, Tree: { indentSize: 12, titleHeight: 32, nodeSelectedBg: '#343955', nodeHoverBg: '#263247' } } };
  }, [palette]);
  return <ConfigProvider locale={zhCN} theme={config}>{children}</ConfigProvider>;
}

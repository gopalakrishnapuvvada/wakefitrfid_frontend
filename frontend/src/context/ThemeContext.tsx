import React, { createContext, useContext, useState, useEffect } from 'react';
import { ConfigProvider, theme as antdTheme, App as AntdApp } from 'antd';
import type { ThemeMode } from '../types';

interface ThemeContextType {
  themeMode: ThemeMode;
  toggleTheme: () => void;
  setThemeMode: (mode: ThemeMode) => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = 'wakefit_uaim_theme_mode';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
    return 'light';
  });

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, themeMode);
    if (themeMode === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [themeMode]);

  const toggleTheme = () => {
    setThemeModeState(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode);
  };

  const isDark = themeMode === 'dark';

  const themeConfig = {
    algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: {
      colorPrimary: '#E53935',
      colorInfo: '#1E3A5F',
      colorSuccess: '#10B981',
      colorWarning: '#F59E0B',
      colorError: '#EF4444',
      borderRadius: 8,
      fontFamily: `'Outfit', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`,
      fontSize: 14,
      wireframe: false,
      colorBgBase: isDark ? '#0f172a' : '#ffffff',
      colorBgContainer: isDark ? '#1e293b' : '#ffffff',
      colorBgElevated: isDark ? '#334155' : '#ffffff',
      colorBorder: isDark ? '#334155' : '#e2e8f0',
      colorText: isDark ? '#f8fafc' : '#1e293b',
      colorTextSecondary: isDark ? '#94a3b8' : '#64748b',
    },
    components: {
      Layout: {
        headerBg: isDark ? '#1e293b' : '#ffffff',
        headerPadding: '0 24px',
        siderBg: isDark ? '#0f172a' : '#ffffff',
        bodyBg: isDark ? '#0b0f19' : '#f8fafc',
      },
      Menu: {
        darkItemBg: '#0f172a',
        itemBorderRadius: 8,
        itemMarginInline: 8,
      },
      Card: {
        headerBg: isDark ? '#1e293b' : '#ffffff',
      },
      Button: {
        fontWeight: 500,
        controlHeight: 38,
        borderRadius: 8,
      },
      Table: {
        headerBg: isDark ? '#1e293b' : '#f1f5f9',
        headerColor: isDark ? '#f8fafc' : '#1e293b',
        borderRadiusLG: 8,
      }
    }
  };

  return (
    <ThemeContext.Provider value={{ themeMode, toggleTheme, setThemeMode, isDark }}>
      <ConfigProvider theme={themeConfig}>
        <AntdApp>
          {children}
        </AntdApp>
      </ConfigProvider>
    </ThemeContext.Provider>
  );
};

export const useAppTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useAppTheme must be used within a ThemeProvider');
  }
  return context;
};

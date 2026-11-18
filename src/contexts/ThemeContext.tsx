import React, { createContext, useContext, useEffect, useState } from 'react';

export type AppTheme = 'dark' | 'light';

interface ThemeContextType {
  theme: AppTheme;
  isSunMode: boolean;
  setTheme: (theme: AppTheme) => void;
  toggleTheme: () => void;
}

const STORAGE_KEY = 'agrogestion_theme';

const getInitialTheme = (): AppTheme => {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
};

const applyThemeToDom = (next: AppTheme) => {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = next;

  const colorSchemeMeta = document.querySelector('meta[name="color-scheme"]');
  if (colorSchemeMeta) {
    colorSchemeMeta.setAttribute('content', next);
  }

  const themeColorMeta = document.querySelector('meta[name="theme-color"]');
  if (themeColorMeta) {
    themeColorMeta.setAttribute('content', next === 'light' ? '#f4f6f2' : '#121212');
  }
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<AppTheme>(getInitialTheme);

  useEffect(() => {
    applyThemeToDom(theme);
  }, [theme]);

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setThemeState(e.newValue === 'light' ? 'light' : 'dark');
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const setTheme = (next: AppTheme) => {
    setThemeState(next);
    applyThemeToDom(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* noop si storage está bloqueado */
    }
  };

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        isSunMode: theme === 'light',
        setTheme,
        toggleTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

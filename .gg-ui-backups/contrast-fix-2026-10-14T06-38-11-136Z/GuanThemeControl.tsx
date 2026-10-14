import React, { useEffect, useState } from 'react';
import { Laptop, Moon, Sun } from 'lucide-react';
import '../styles/guanTheme.css';

type ThemeMode = 'light' | 'dark' | 'system';
const THEME_KEY = 'guanguan_theme_mode_v1';
const readTheme = (): ThemeMode => {
  if (typeof window === 'undefined') return 'system';
  try {
    const value = window.localStorage.getItem(THEME_KEY);
    return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
  } catch {
    return 'system';
  }
};

/** Appearance only. Does not participate in application data or authorization. */
export const GuanThemeControl: React.FC = () => {
  const [theme, setTheme] = useState<ThemeMode>(readTheme);

  useEffect(() => {
    const root = document.documentElement;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const resolved = theme === 'system' ? (query.matches ? 'dark' : 'light') : theme;
      root.setAttribute('data-gg-theme', resolved);
      root.style.colorScheme = resolved;
    };
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, [theme]);

  const chooseTheme = (mode: ThemeMode) => {
    setTheme(mode);
    try { window.localStorage.setItem(THEME_KEY, mode); } catch { /* private mode */ }
  };

  return (
    <div className="gg-theme-control" role="group" aria-label="ธีมหน้าจอ">
      <button type="button" aria-label="โหมดสว่าง" aria-pressed={theme === 'light'} title="Light mode" onClick={() => chooseTheme('light')}><Sun size={16} aria-hidden="true" /></button>
      <button type="button" aria-label="โหมดมืด" aria-pressed={theme === 'dark'} title="Dark mode" onClick={() => chooseTheme('dark')}><Moon size={16} aria-hidden="true" /></button>
      <button type="button" aria-label="ตามระบบ" aria-pressed={theme === 'system'} title="System mode" onClick={() => chooseTheme('system')}><Laptop size={16} aria-hidden="true" /></button>
    </div>
  );
};

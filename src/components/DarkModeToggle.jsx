'use client';

import { useTheme } from 'next-themes';
import { Toggle } from '@/components/ui/toggle';
import { useEffect, useState, useCallback } from 'react';
import { Sun, Moon } from 'lucide-react';

function withThemeTransition(apply) {
  const root = document.documentElement;
  root.classList.add('theme-transition');
  apply();
  window.setTimeout(() => root.classList.remove('theme-transition'), 320);
}

export default function DarkModeToggle() {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = resolvedTheme === 'dark';

  const handleToggle = useCallback(
    (pressed) => {
      withThemeTransition(() => setTheme(pressed ? 'dark' : 'light'));
    },
    [setTheme]
  );

  if (!mounted) {
    return <div className="h-10 w-10 rounded-full bg-muted animate-pulse" aria-hidden />;
  }

  return (
    <Toggle
      pressed={isDark}
      onPressedChange={handleToggle}
      size="lg"
      className="h-10 w-10 rounded-full bg-muted hover:bg-muted/80 transition-all duration-300 ease-in-out group data-[state=on]:bg-muted"
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="transition-transform duration-500 ease-in-out group-hover:scale-110"
        style={{
          transform: isDark ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.5s ease-in-out',
        }}
      >
        {isDark ? (
          <Moon className="h-5 w-5 text-foreground" />
        ) : (
          <Sun className="h-5 w-5 text-foreground" />
        )}
      </div>
    </Toggle>
  );
}

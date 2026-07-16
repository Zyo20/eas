'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { api, getToken, setToken, type AuthUser } from '@/lib/api';

export interface UseHooksParams {
  children?: React.ReactNode;
}

export const useHooks = (_params: UseHooksParams = {}) => {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  // Theme Sync on Mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const activeTheme = (localStorage.getItem('theme') as 'light' | 'dark') || 'dark';
      setTheme(activeTheme);
      document.documentElement.className = activeTheme;
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    if (typeof window !== 'undefined') {
      localStorage.setItem('theme', nextTheme);
      document.documentElement.className = nextTheme;
    }
  };

  // Auth sync and profile fetch
  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.push('/login');
      return;
    }

    setLoading(true);
    api.get<AuthUser>('/auth/me')
      .then((profile) => {
        setUser(profile);
        // Attendees trying to access admin panel get redirected
        if (profile.role === 'attendee' && !pathname.startsWith('/me')) {
          router.push('/me');
        }
      })
      .catch(() => {
        // Clear broken token and send to login
        setToken(null);
        router.push('/login');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [router, pathname]);

  const handleLogout = () => {
    setToken(null);
    router.push('/login');
  };

  return {
    user,
    loading,
    theme,
    toggleTheme,
    handleLogout,
    pathname,
  };
};

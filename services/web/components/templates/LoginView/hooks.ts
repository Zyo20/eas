'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, setToken, getToken, type AuthUser } from '@/lib/api';
import type { LoginViewProps } from './types';

interface UseHooksParams extends LoginViewProps {}

export const useHooks = (_params: UseHooksParams = {}) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(searchParams.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = getToken();
    if (t) {
      fetch('/api/v1/auth/me', { headers: { Authorization: `Bearer ${t}` } })
        .then((r) => (r.ok ? r.json() : null))
        .then((user) => {
          if (!user) return;
          router.replace(user.role === 'attendee' ? '/me' : '/dashboard');
        })
        .catch(() => { /* stay on login */ });
    }
  }, [router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { token, user } = await api.post<{ token: string; user: AuthUser }>('/auth/login', { email, password });
      setToken(token);
      const dest = user.role === 'attendee' ? '/me' : '/dashboard';
      router.push(dest);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return {
    email,
    setEmail,
    password,
    setPassword,
    error,
    busy,
    onSubmit,
  };
};

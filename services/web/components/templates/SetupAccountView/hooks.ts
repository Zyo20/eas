'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSetupInfo, consumeSetupToken, ApiError } from '@/lib/api';
import type { SetupAccountViewProps } from './types';

export type PageState = 'loading' | 'ready' | 'submitting' | 'error' | 'done';

interface UseHooksParams extends SetupAccountViewProps {}

export const useHooks = (_params: UseHooksParams = {}) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [state, setState] = useState<PageState>('loading');
  const [userInfo, setUserInfo] = useState<{ email: string; name: string } | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError('No setup token found in the URL. Please check the link you received.');
      setState('error');
      return;
    }

    (async () => {
      try {
        const info = await getSetupInfo(token);
        setUserInfo(info);
        setState('ready');
      } catch (err) {
        if (err instanceof ApiError && err.status === 410) {
          setError('This setup link has already been used. Ask your admin for a new one.');
        } else if (err instanceof ApiError && err.status === 401) {
          setError('This setup link has expired (links are valid for 7 days). Ask your admin for a new one.');
        } else {
          setError('Invalid setup link. Please check the link you received.');
        }
        setState('error');
      }
    })();
  }, [token]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token || !userInfo) return;

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setState('submitting');
    setError(null);

    try {
      await consumeSetupToken(token, newPassword);
      setState('done');
      router.push(`/login?email=${encodeURIComponent(userInfo.email)}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 410) {
        setError('This setup link has already been used. Ask your admin for a new one.');
      } else if (err instanceof ApiError && err.status === 401) {
        setError('This setup link has expired. Ask your admin for a new one.');
      } else {
        setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      }
      setState('ready');
    }
  }

  return {
    state,
    userInfo,
    newPassword,
    setNewPassword,
    confirmPassword,
    setConfirmPassword,
    error,
    onSubmit,
  };
};

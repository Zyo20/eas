import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

export const useRegisterView = () => {
  const router = useRouter();
  const [orgName, setOrgName] = useState('');
  const [orgSlug, setOrgSlug] = useState('');
  const [orgType, setOrgType] = useState<'SCHOOL' | 'ORG'>('SCHOOL');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);

  // Client-side derivations for inline feedback
  const isSlugValid = !orgSlug || /^[a-z0-9][a-z0-9-]*$/.test(orgSlug);
  const isPasswordValid = !adminPassword || adminPassword.length >= 8;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!orgName.trim() || !orgSlug.trim() || !adminName.trim() || !adminEmail.trim() || !adminPassword) {
      setError('All fields are required.');
      return;
    }

    if (!/^[a-z0-9][a-z0-9-]*$/.test(orgSlug)) {
      setError('Slug must be lowercase alphanumeric with hyphens (e.g. "my-org").');
      return;
    }

    if (adminPassword.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    setBusy(true);

    try {
      await api.post('/auth/register-tenant', {
        orgName: orgName.trim(),
        orgSlug: orgSlug.trim().toLowerCase(),
        orgType,
        adminName: adminName.trim(),
        adminEmail: adminEmail.trim().toLowerCase(),
        adminPassword,
      });

      setSuccess(true);
      setTimeout(() => {
        router.push(`/login?email=${encodeURIComponent(adminEmail)}`);
      }, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setBusy(false);
    }
  }

  return {
    orgName,
    setOrgName,
    orgSlug,
    setOrgSlug,
    orgType,
    setOrgType,
    adminName,
    setAdminName,
    adminEmail,
    setAdminEmail,
    adminPassword,
    setAdminPassword,
    error,
    busy,
    success,
    onSubmit,
    isSlugValid,
    isPasswordValid,
  };
};

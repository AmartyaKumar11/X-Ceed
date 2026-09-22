'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function DashboardPage() {
  const router = useRouter();
  const [error, setError] = useState('');

  useEffect(() => {
    const checkUserRole = async () => {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        if (!res.ok) {
          router.replace('/auth');
          return;
        }
        const data = await res.json();
        const userType = data?.user?.userType || data?.userType;
        if (userType === 'recruiter') {
          router.replace('/dashboard/recruiter');
        } else {
          router.replace('/dashboard/applicant');
        }
      } catch (e) {
        setError('Unable to verify session');
        router.replace('/auth');
      }
    };
    checkUserRole();
  }, [router]);

  return (
    <div className="flex h-screen w-screen items-center justify-center">
      <div className="animate-pulse">{error || 'Loading your dashboard...'}</div>
    </div>
  );
}

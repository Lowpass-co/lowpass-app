'use client';

import { InstallPrompt } from '@/components/pwa/InstallPrompt';
import { useEffect, useState } from 'react';

const STORAGE_VISITS = 'lp:visits';
const SESSION_BUMP_FLAG = 'lp:session-visit-bumped';

function bumpVisitCount(): number {
  if (typeof window === 'undefined') return 0;
  try {
    if (sessionStorage.getItem(SESSION_BUMP_FLAG) === '1') {
      return parseInt(localStorage.getItem(STORAGE_VISITS) ?? '0', 10);
    }
    sessionStorage.setItem(SESSION_BUMP_FLAG, '1');
    const visits = parseInt(localStorage.getItem(STORAGE_VISITS) ?? '0', 10) + 1;
    localStorage.setItem(STORAGE_VISITS, String(visits));
    return visits;
  } catch {
    return 0;
  }
}

export function PwaClient() {
  const [visits, setVisits] = useState(0);
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    queueMicrotask(() => setVisits(bumpVisitCount()));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 1023px)');
    const apply = () => queueMicrotask(() => setMobile(mq.matches));
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;

    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);

  return <InstallPrompt visitCount={visits} mobile={mobile} />;
}

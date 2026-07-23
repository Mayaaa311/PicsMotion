'use client';

import { useEffect } from 'react';

import { useRuntimeStore } from '../store';

/**
 * Syncs the OS `prefers-reduced-motion` setting into the runtime store on mount
 * and whenever it changes. Users can still override via the store afterwards.
 */
export function useSyncReducedMotion(): void {
  const setReducedMotion = useRuntimeStore((s) => s.setReducedMotion);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [setReducedMotion]);
}

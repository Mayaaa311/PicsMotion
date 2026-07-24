'use client';

import dynamic from 'next/dynamic';

/**
 * The scene runtime uses WebGL and browser-only APIs, so it must never render on
 * the server. This wraps the package export in a client-only dynamic import.
 */
export const InteractiveSceneDynamic = dynamic(
  () => import('@interactive-photo/scene-runtime').then((m) => m.InteractiveScene),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center text-sm text-slate-400">
        Preparing canvas…
      </div>
    ),
  },
);

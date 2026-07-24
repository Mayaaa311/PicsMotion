'use client';

import { useProgress } from '@react-three/drei';

/**
 * DOM overlay that shows texture-loading progress. Reads drei's global loader
 * state, so it lives outside the Canvas. Hidden once everything is loaded.
 */
export function LoadingOverlay() {
  const { active, progress } = useProgress();
  if (!active) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        background: 'rgba(8, 10, 14, 0.85)',
        color: '#e8eef7',
        font: '500 14px/1.4 system-ui, sans-serif',
        pointerEvents: 'none',
      }}
    >
      <div>Loading scene… {Math.round(progress)}%</div>
      <div style={{ width: 180, height: 4, background: 'rgba(255,255,255,0.15)', borderRadius: 2 }}>
        <div
          style={{
            width: `${progress}%`,
            height: '100%',
            background: '#8fd3fe',
            borderRadius: 2,
            transition: 'width 120ms linear',
          }}
        />
      </div>
    </div>
  );
}

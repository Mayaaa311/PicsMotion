'use client';

import type { QualityLevel } from '@interactive-photo/scene-schema';

import { useRuntimeStore } from '../store';

const QUALITIES: QualityLevel[] = ['low', 'medium', 'high'];

/**
 * DOM overlay showing live runtime diagnostics: FPS, pointer coordinates, layer
 * depths, active preset and quality. Also exposes quality/reduced-motion/pause
 * toggles. Reads the throttled debug snapshot from the store.
 */
export function DebugPanel() {
  const debug = useRuntimeStore((s) => s.debug);
  const quality = useRuntimeStore((s) => s.quality);
  const reducedMotion = useRuntimeStore((s) => s.reducedMotion);
  const paused = useRuntimeStore((s) => s.paused);
  const setQuality = useRuntimeStore((s) => s.setQuality);
  const setReducedMotion = useRuntimeStore((s) => s.setReducedMotion);
  const setPaused = useRuntimeStore((s) => s.setPaused);

  return (
    <div
      data-testid="debug-panel"
      style={{
        position: 'absolute',
        top: 12,
        left: 12,
        padding: '10px 12px',
        background: 'rgba(8, 10, 14, 0.72)',
        color: '#d6e2f0',
        font: '500 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace',
        borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.08)',
        minWidth: 200,
        backdropFilter: 'blur(4px)',
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>FPS</span>
        <span data-testid="debug-fps" style={{ color: debug.fps >= 55 ? '#8ff0a4' : debug.fps >= 30 ? '#ffe08a' : '#ff9a9a' }}>
          {debug.fps}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>Pointer</span>
        <span data-testid="debug-pointer">
          {debug.pointerImageSpace.x.toFixed(2)}, {debug.pointerImageSpace.y.toFixed(2)}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>Preset</span>
        <span data-testid="debug-preset">{debug.activePreset ?? '—'}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>Quality</span>
        <span data-testid="debug-quality">{quality}</span>
      </div>
      <details style={{ marginTop: 6 }}>
        <summary style={{ cursor: 'pointer' }}>Layers ({debug.layerDepths.length})</summary>
        <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
          {debug.layerDepths.map((l) => (
            <li key={l.id}>
              {l.id}: depth {l.depth.toFixed(2)}
            </li>
          ))}
        </ul>
      </details>

      <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {QUALITIES.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => setQuality(q)}
            aria-pressed={quality === q}
            style={btnStyle(quality === q)}
          >
            {q}
          </button>
        ))}
      </div>
      <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
        <button type="button" onClick={() => setPaused(!paused)} style={btnStyle(paused)}>
          {paused ? 'resume' : 'pause'}
        </button>
        <button
          type="button"
          onClick={() => setReducedMotion(!reducedMotion)}
          style={btnStyle(reducedMotion)}
        >
          reduced-motion
        </button>
      </div>
    </div>
  );
}

function btnStyle(active: boolean): React.CSSProperties {
  return {
    padding: '2px 8px',
    borderRadius: 6,
    border: '1px solid rgba(255,255,255,0.15)',
    background: active ? '#2b6cb0' : 'rgba(255,255,255,0.06)',
    color: '#e8eef7',
    font: 'inherit',
    cursor: 'pointer',
  };
}

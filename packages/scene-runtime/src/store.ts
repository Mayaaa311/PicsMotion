import type { PresetName, QualityLevel } from '@interactive-photo/scene-schema';
import { create } from 'zustand';

/** Per-frame debug values, updated at a throttled rate to avoid render spam. */
export interface DebugSnapshot {
  fps: number;
  pointerImageSpace: { x: number; y: number };
  activePreset: PresetName | null;
  quality: QualityLevel;
  layerDepths: Array<{ id: string; depth: number }>;
  drawCallHint: number;
  /** Latest audio readout, or null when no audio source is active. */
  audio: { bass: number; loudness: number; beat: number } | null;
}

export interface RuntimeState {
  quality: QualityLevel;
  reducedMotion: boolean;
  paused: boolean;
  muted: boolean;
  /** Spider-Verse comic palette: -1 = auto (cycle on beats), 0..N = fixed. */
  spiderPalette: number;
  /** Active AI art style id (from the scene's styles manifest), or null for the original. */
  activeStyle: string | null;
  debug: DebugSnapshot;

  setQuality: (q: QualityLevel) => void;
  setReducedMotion: (v: boolean) => void;
  setPaused: (v: boolean) => void;
  setMuted: (v: boolean) => void;
  setSpiderPalette: (i: number) => void;
  setActiveStyle: (id: string | null) => void;
  /** Merge a partial debug snapshot (called at low frequency, not every frame). */
  updateDebug: (patch: Partial<DebugSnapshot>) => void;
}

export const useRuntimeStore = create<RuntimeState>((set) => ({
  quality: 'high',
  reducedMotion: false,
  paused: false,
  muted: true,
  spiderPalette: -1,
  activeStyle: null,
  debug: {
    fps: 0,
    pointerImageSpace: { x: 0.5, y: 0.5 },
    activePreset: null,
    quality: 'high',
    layerDepths: [],
    drawCallHint: 0,
    audio: null,
  },
  setQuality: (quality) => set((s) => ({ quality, debug: { ...s.debug, quality } })),
  setReducedMotion: (reducedMotion) => set({ reducedMotion }),
  setPaused: (paused) => set({ paused }),
  setMuted: (muted) => set({ muted }),
  setSpiderPalette: (spiderPalette) => set({ spiderPalette }),
  setActiveStyle: (activeStyle) => set({ activeStyle }),
  updateDebug: (patch) => set((s) => ({ debug: { ...s.debug, ...patch } })),
}));

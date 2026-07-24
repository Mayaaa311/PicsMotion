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
  /** Ordered style ids for the current scene → maps id ↔ paint-buffer style index. */
  styleList: string[];
  /**
   * Styles actually painted with so far this scene. Only these get a styled
   * texture loaded + an overlay mesh, so GPU memory scales with what the viewer
   * used rather than with the size of the catalogue.
   */
  usedStyles: string[];
  /**
   * True once any style has been picked for the current scene. Keeps the paint
   * layer mounted afterwards so already-painted strokes persist even when the
   * active style is switched back to "Original" (the eraser).
   */
  styleEngaged: boolean;
  debug: DebugSnapshot;

  setQuality: (q: QualityLevel) => void;
  setReducedMotion: (v: boolean) => void;
  setPaused: (v: boolean) => void;
  setMuted: (v: boolean) => void;
  setSpiderPalette: (i: number) => void;
  setActiveStyle: (id: string | null) => void;
  /** Set the ordered style ids available for the current scene. */
  setStyleList: (ids: string[]) => void;
  /** Reset all styling state (call when loading a different scene/picture). */
  resetStyles: () => void;
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
  styleList: [],
  usedStyles: [],
  styleEngaged: false,
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
  setActiveStyle: (activeStyle) =>
    set((s) => ({
      activeStyle,
      styleEngaged: s.styleEngaged || activeStyle !== null,
      usedStyles:
        activeStyle && !s.usedStyles.includes(activeStyle)
          ? [...s.usedStyles, activeStyle]
          : s.usedStyles,
    })),
  setStyleList: (styleList) => set({ styleList }),
  resetStyles: () =>
    set({ activeStyle: null, styleList: [], usedStyles: [], styleEngaged: false }),
  updateDebug: (patch) => set((s) => ({ debug: { ...s.debug, ...patch } })),
}));

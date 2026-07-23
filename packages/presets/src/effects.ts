import type {
  FogConfig,
  HaloConfig,
  PaperConfig,
  ParticleConfig,
  PostFXConfig,
  SunlightConfig,
  WaterConfig,
  WindConfig,
} from '@interactive-photo/effects';
import type { PresetName } from '@interactive-photo/scene-schema';

/**
 * Per-preset effect configuration. Presets only *configure* shared effect
 * modules — they never reimplement them, and the runtime never branches on
 * preset name (it just reads these values).
 *
 * Each entry is a partial; anything omitted falls back to the effect module's
 * own `DEFAULT_*_CONFIG`.
 */
export interface PresetEffects {
  wind?: Partial<WindConfig>;
  fog?: Partial<FogConfig>;
  particles?: Partial<ParticleConfig>;
  sunlight?: Partial<SunlightConfig>;
  water?: Partial<WaterConfig>;
  paper?: Partial<PaperConfig>;
  halo?: Partial<HaloConfig>;
  post?: Partial<PostFXConfig>;
}

/**
 * Milestone 3 delivers the Soft Nature identity in full. The other presets get
 * deliberately restrained values here so they already read differently; their
 * signature effects (inertia/impulse, flashlight, bloom/aberration, paper) land
 * in Milestones 4–5.
 */
export const presetEffects: Record<PresetName, PresetEffects> = {
  'soft-nature': {
    wind: {
      enabled: true,
      intensity: 1,
      cursorStrength: 0.11,
      naturalStrength: 0.022,
      windSpeed: 0.8,
      frequency: 2.8,
      audioStrength: 0.045,
    },
    fog: {
      enabled: true,
      planeCount: 3,
      opacity: 0.11,
      speed: 0.02,
      color: '#eef4ff',
      bassSensitivity: 0.3,
      clearStrength: 1,
      clearRadius: 0.24,
    },
    particles: { enabled: true, type: 'pollen', count: 350, speed: 0.08, color: '#fff3c4' },
    sunlight: { enabled: true, position: { x: 0.72, y: 0.28 }, color: '#ffe6b0', maxIntensity: 0.35 },
    water: { enabled: true, amplitude: 0.012, frequency: 28, decay: 1.1 },
    post: { enabled: true, bloom: 0.06, bloomAudio: 0.15, vignette: 0.06, grain: 0.015, saturation: 0.05 },
  },

  urban: {
    wind: { enabled: false },
    fog: { enabled: true, planeCount: 2, opacity: 0.1, speed: 0.05, color: '#9aa7b8' },
    particles: { enabled: true, type: 'dust', count: 140, speed: 0.22, color: '#cfd6e0' },
    sunlight: { enabled: false },
    water: { enabled: false },
    post: {
      enabled: true,
      spiderverse: true,
      bloom: 0.18,
      bloomAudio: 0.5,
      maxBloom: 1.6,
      vignette: 0.2,
      grain: 0.03,
      contrast: 0.16,
      saturation: 0.12,
      chromaticAberration: 0.001,
      aberrationPointer: 0.006,
      maxAberration: 0.01,
    },
  },

  dark: {
    wind: { enabled: false },
    fog: { enabled: true, planeCount: 3, opacity: 0.32, speed: 0.015, color: '#7d8ea3' },
    particles: { enabled: true, type: 'dust', count: 180, speed: 0.05, color: '#8fa3bb' },
    sunlight: { enabled: false },
    water: { enabled: false },
    post: {
      enabled: true,
      flashlight: true,
      darken: 0.8,
      flashlightRadius: 0.24,
      flashlightFeather: 0.3,
      vignette: 0.4,
      grain: 0.04,
      saturation: -0.2,
      brightness: -0.04,
    },
  },

  nostalgic: {
    wind: { enabled: false },
    fog: { enabled: true, planeCount: 2, opacity: 0.12, speed: 0.012, color: '#ffe9cc' },
    particles: { enabled: true, type: 'dust', count: 160, speed: 0.04, color: '#ffe0b0' },
    sunlight: { enabled: true, position: { x: 0.3, y: 0.25 }, color: '#ffd9a0', maxIntensity: 0.22 },
    water: { enabled: false },
    paper: { enabled: true, warm: 0.5, thickness: 0.35, borderWidthPx: 6 },
    halo: { enabled: true, color: '#ffdca0', radius: 0.32, maxIntensity: 0.5 },
    post: {
      enabled: true,
      sepia: 0.35,
      grain: 0.08,
      vignette: 0.26,
      saturation: -0.15,
      brightness: 0.03,
    },
  },
};

/** Effects configured for a preset (empty object if none). */
export function getPresetEffects(preset: PresetName): PresetEffects {
  return presetEffects[preset] ?? {};
}

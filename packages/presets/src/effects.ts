import type {
  FogConfig,
  ParticleConfig,
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
      cursorStrength: 0.07,
      naturalStrength: 0.014,
      windSpeed: 0.6,
      frequency: 2.5,
      audioStrength: 0.035,
    },
    fog: {
      enabled: true,
      planeCount: 3,
      opacity: 0.18,
      speed: 0.02,
      color: '#eef4ff',
      bassSensitivity: 0.35,
    },
    particles: { enabled: true, type: 'pollen', count: 350, speed: 0.08, color: '#fff3c4' },
    sunlight: { enabled: true, position: { x: 0.72, y: 0.28 }, color: '#ffe6b0', maxIntensity: 0.35 },
    water: { enabled: true, amplitude: 0.012, frequency: 28, decay: 1.1 },
  },

  urban: {
    wind: { enabled: false },
    fog: { enabled: true, planeCount: 2, opacity: 0.1, speed: 0.05, color: '#9aa7b8' },
    particles: { enabled: true, type: 'dust', count: 140, speed: 0.22, color: '#cfd6e0' },
    sunlight: { enabled: false },
    water: { enabled: false },
  },

  dark: {
    wind: { enabled: false },
    fog: { enabled: true, planeCount: 3, opacity: 0.3, speed: 0.015, color: '#7d8ea3' },
    particles: { enabled: true, type: 'dust', count: 180, speed: 0.05, color: '#8fa3bb' },
    sunlight: { enabled: false },
    water: { enabled: false },
  },

  electronic: {
    wind: { enabled: false },
    fog: { enabled: false },
    particles: { enabled: true, type: 'dust', count: 600, speed: 0.3, color: '#9fe8ff', opacity: 0.7 },
    sunlight: { enabled: true, position: { x: 0.5, y: 0.5 }, color: '#7fd7ff', maxIntensity: 0.3, beatSensitivity: 0.5 },
    water: { enabled: false },
  },

  nostalgic: {
    wind: { enabled: false },
    fog: { enabled: true, planeCount: 2, opacity: 0.12, speed: 0.012, color: '#ffe9cc' },
    particles: { enabled: true, type: 'dust', count: 160, speed: 0.04, color: '#ffe0b0' },
    sunlight: { enabled: true, position: { x: 0.3, y: 0.25 }, color: '#ffd9a0', maxIntensity: 0.22 },
    water: { enabled: false },
  },
};

/** Effects configured for a preset (empty object if none). */
export function getPresetEffects(preset: PresetName): PresetEffects {
  return presetEffects[preset] ?? {};
}

// Wind deformation (plant/foliage layers)
export {
  applyWindConfig,
  computeBendAmount,
  createWindMaterial,
  DEFAULT_WIND_CONFIG,
  updateWindUniforms,
} from './wind';
export type { WindConfig, WindUniformInput } from './wind';

// Multi-depth drifting fog
export { FogPlanes, DEFAULT_FOG_CONFIG } from './fog';
export type { FogConfig, FogPlanesProps } from './fog';

// Gentle particle field (pollen / dust)
export { ParticleField, DEFAULT_PARTICLE_CONFIG } from './particles';
export type { ParticleConfig, ParticleFieldProps } from './particles';

// Soft sunlight glow
export { SunlightGlow, DEFAULT_SUNLIGHT_CONFIG } from './sunlight';
export type { SunlightConfig, SunlightGlowProps } from './sunlight';

// Water ripples
export {
  createWaterMaterial,
  DEFAULT_WATER_CONFIG,
  MAX_RIPPLES,
  RippleManager,
  updateWaterUniforms,
} from './water';
export type { Ripple, WaterConfig } from './water';

// Paper-cutout material (Nostalgic)
export { createPaperMaterial, DEFAULT_PAPER_CONFIG } from './paper';
export type { PaperConfig } from './paper';

// Postprocessing pipeline + flashlight (Milestone 4)
export { PostFX, FlashlightEffect } from './postfx';
export type { PostFXProps } from './postfx';
export { DEFAULT_POSTFX_CONFIG, resolvePostFX } from './postfx-config';
export type { PostFXConfig, PostFXInput, ResolvedPostFX } from './postfx-config';

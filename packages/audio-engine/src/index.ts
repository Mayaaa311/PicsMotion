// Engine
export { AudioEngine } from './audio-engine';
export type { AudioEngineOptions, AudioEngineEvent, BeatEvent } from './audio-engine';

// React
export { useAudioEngine } from './react';

// Source adapters
export { UploadedAudioAdapter, LicensedLibraryAdapter, SpotifyPlaybackAdapter } from './adapters';
export type { AudioSourceAdapter, DisposableAudioSourceAdapter } from './adapters';

// DSP + beat detection (pure)
export {
  beatPulseDecay,
  computeBands,
  smoothAR,
  smoothBandsAttackRelease,
  spectralFlux,
} from './dsp';
export type { BandEnergies } from './dsp';
export { BeatDetector } from './beat-detector';
export type { BeatDetectorOptions, BeatResult } from './beat-detector';

// Declarative audio → parameter bindings (pure)
export { evaluateBinding, evaluateBindings } from './bindings';

// Convenience re-exports of the shared audio contract
export type {
  AudioBinding,
  AudioBindingSource,
  AudioCurve,
  AudioFrame,
  AudioSection,
} from '@interactive-photo/scene-schema';

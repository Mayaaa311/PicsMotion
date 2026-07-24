/**
 * `AudioEngine` — owns the Web Audio graph and turns it into normalized
 * {@link AudioFrame} values that the render layer can consume.
 *
 * Design rules (spec §9):
 * - Rendering code never touches an `AnalyserNode`; it calls {@link AudioEngine.getFrame}.
 * - All DSP lives in pure functions (`./dsp`, `./beat-detector`) so it is testable
 *   without a real `AudioContext`.
 * - Nothing here touches the DOM at module load — only inside methods — so this
 *   module imports cleanly in Node for tests.
 */
import type { AudioFrame } from '@interactive-photo/scene-schema';
import { clamp } from '@interactive-photo/shared';

import type { AudioSourceAdapter } from './adapters';
import { LicensedLibraryAdapter, UploadedAudioAdapter } from './adapters';
import { BeatDetector } from './beat-detector';
import {
  beatPulseDecay,
  computeBands,
  smoothBandsAttackRelease,
  spectralFlux,
  type BandEnergies,
} from './dsp';

export interface AudioEngineOptions {
  /** FFT size for the analyser (power of two). Default 2048. */
  fftSize?: number;
  /** Smoothing rate while a value is RISING (larger = snappier). Default 18. */
  attack?: number;
  /** Smoothing rate while a value is FALLING (smaller = longer tail). Default 5. */
  release?: number;
  /** Half-life (seconds) of the decaying beat pulse. Default 0.18. */
  beatHalfLife?: number;
}

export interface BeatEvent {
  strength: number;
  timestamp: number;
}

export type AudioEngineEvent = 'beat' | 'ended';

type Listener = (payload: never) => void;

const ZERO_BANDS: BandEnergies = { bass: 0, lowMid: 0, highMid: 0, treble: 0, loudness: 0 };

function emptyFrame(): AudioFrame {
  return {
    time: 0,
    bass: 0,
    lowMid: 0,
    highMid: 0,
    treble: 0,
    loudness: 0,
    spectralFlux: 0,
    beatPulse: 0,
  };
}

export class AudioEngine {
  private readonly fftSize: number;
  private readonly attack: number;
  private readonly release: number;
  private readonly beatHalfLife: number;

  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private gain: GainNode | null = null;
  private adapter: AudioSourceAdapter | null = null;
  private mediaEl: HTMLAudioElement | null = null;

  private freqBytes: Uint8Array = new Uint8Array(0);
  private magNow: Float32Array = new Float32Array(0);
  private magPrev: Float32Array = new Float32Array(0);

  private bands: BandEnergies = { ...ZERO_BANDS };
  /** Mutated in place each analysis tick to avoid per-frame allocation. */
  private frame: AudioFrame = emptyFrame();

  private readonly beatDetector: BeatDetector;
  private rafId = 0;
  private lastTickMs = 0;
  private running = false;
  private disposed = false;

  private readonly listeners = new Map<AudioEngineEvent, Set<Listener>>();
  private readonly onEnded = () => this.emit('ended', undefined as never);

  constructor(options: AudioEngineOptions = {}) {
    this.fftSize = options.fftSize ?? 2048;
    this.attack = options.attack ?? 18;
    this.release = options.release ?? 5;
    this.beatHalfLife = options.beatHalfLife ?? 0.18;
    this.beatDetector = new BeatDetector();
  }

  // ---------------------------------------------------------------- sources

  /** Attach an adapter and wire its media element into the analysis graph. */
  async setSource(adapter: AudioSourceAdapter): Promise<void> {
    this.assertNotDisposed();
    this.teardownSource();

    await adapter.load();
    this.adapter = adapter;
    this.mediaEl = adapter.getMediaElement();

    if (!this.mediaEl || !adapter.supportsSignalAnalysis) {
      // Playback-only source (e.g. Spotify placeholder): no analysis possible.
      return;
    }

    this.mediaEl.addEventListener('ended', this.onEnded);

    const ctx = this.ensureContext();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = this.fftSize;
    this.analyser.smoothingTimeConstant = 0.6;

    this.gain = ctx.createGain();
    this.sourceNode = ctx.createMediaElementSource(this.mediaEl);
    this.sourceNode.connect(this.analyser);
    this.analyser.connect(this.gain);
    this.gain.connect(ctx.destination);

    const bins = this.analyser.frequencyBinCount;
    this.freqBytes = new Uint8Array(bins);
    this.magNow = new Float32Array(bins);
    this.magPrev = new Float32Array(bins);
    this.beatDetector.reset();
  }

  /** Load a track from a URL (licensed library / local demo asset). */
  async loadUrl(url: string): Promise<void> {
    await this.setSource(new LicensedLibraryAdapter(url));
  }

  /** Load a user-uploaded file. */
  async loadFile(file: File | Blob): Promise<void> {
    await this.setSource(new UploadedAudioAdapter(file));
  }

  // -------------------------------------------------------------- playback

  /**
   * Start playback. Must be called from a user gesture: browsers require a
   * gesture before an AudioContext may leave the "suspended" state.
   */
  async play(): Promise<void> {
    this.assertNotDisposed();
    if (this.ctx && this.ctx.state === 'suspended') await this.ctx.resume();
    await this.adapter?.play();
    this.startLoop();
  }

  async pause(): Promise<void> {
    await this.adapter?.pause();
    this.stopLoop();
    // Don't report stale energy while paused.
    this.bands = { ...ZERO_BANDS };
    this.writeFrame(0, 0);
  }

  async seek(time: number): Promise<void> {
    await this.adapter?.seek(time);
    this.beatDetector.reset();
  }

  setMuted(muted: boolean): void {
    if (this.mediaEl) this.mediaEl.muted = muted;
  }

  setVolume(volume: number): void {
    const v = clamp(volume, 0, 1);
    if (this.gain) this.gain.gain.value = v;
    else if (this.mediaEl) this.mediaEl.volume = v;
  }

  getCurrentTime(): number {
    return this.adapter?.getCurrentTime() ?? 0;
  }

  getDuration(): number {
    const d = this.adapter?.getDuration() ?? 0;
    return Number.isFinite(d) ? d : 0;
  }

  get isPlaying(): boolean {
    return !!this.mediaEl && !this.mediaEl.paused && !this.mediaEl.ended;
  }

  /** True when the current source can be analysed (false for playback-only sources). */
  get canAnalyse(): boolean {
    return !!this.analyser;
  }

  // ----------------------------------------------------------------- frames

  /**
   * The latest analysed + smoothed frame. Cheap: returns the engine's internal
   * frame object (mutated in place), so callers may read it every render frame.
   */
  getFrame(): AudioFrame {
    return this.frame;
  }

  // ----------------------------------------------------------------- events

  on(type: 'beat', cb: (e: BeatEvent) => void): () => void;
  on(type: 'ended', cb: () => void): () => void;
  on(type: AudioEngineEvent, cb: (payload: never) => void): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(cb);
    return () => {
      this.listeners.get(type)?.delete(cb);
    };
  }

  private emit(type: AudioEngineEvent, payload: never): void {
    const set = this.listeners.get(type);
    if (!set) return;
    for (const cb of set) cb(payload);
  }

  // --------------------------------------------------------------- lifecycle

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopLoop();
    this.teardownSource();
    this.listeners.clear();
    if (this.ctx) {
      void this.ctx.close().catch(() => undefined);
      this.ctx = null;
    }
  }

  // ---------------------------------------------------------------- internals

  private assertNotDisposed(): void {
    if (this.disposed) throw new Error('AudioEngine has been disposed.');
  }

  private ensureContext(): AudioContext {
    if (this.ctx) return this.ctx;
    if (typeof window === 'undefined') {
      throw new Error('AudioEngine requires a browser environment (no `window` found).');
    }
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) throw new Error('Web Audio API is not supported in this browser.');
    this.ctx = new Ctor();
    return this.ctx;
  }

  private teardownSource(): void {
    if (this.mediaEl) this.mediaEl.removeEventListener('ended', this.onEnded);
    this.sourceNode?.disconnect();
    this.analyser?.disconnect();
    this.gain?.disconnect();
    this.sourceNode = null;
    this.analyser = null;
    this.gain = null;
    const disposable = this.adapter as { dispose?: () => void } | null;
    disposable?.dispose?.();
    this.adapter = null;
    this.mediaEl = null;
    this.bands = { ...ZERO_BANDS };
    this.frame = emptyFrame();
  }

  private startLoop(): void {
    if (this.running || !this.analyser || typeof requestAnimationFrame === 'undefined') return;
    this.running = true;
    this.lastTickMs = performance.now();
    const tick = () => {
      if (!this.running) return;
      this.analyse();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private stopLoop(): void {
    this.running = false;
    if (this.rafId && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  /** One analysis tick: FFT → bands → smoothing → flux → beat → frame. */
  private analyse(): void {
    const analyser = this.analyser;
    if (!analyser) return;

    const now = performance.now();
    const dt = clamp((now - this.lastTickMs) / 1000, 0, 0.1);
    this.lastTickMs = now;

    analyser.getByteFrequencyData(this.freqBytes);

    // Normalized magnitudes for flux (reuse buffers; no per-frame allocation).
    this.magPrev.set(this.magNow);
    for (let i = 0; i < this.freqBytes.length; i++) {
      this.magNow[i] = (this.freqBytes[i] ?? 0) / 255;
    }

    const raw = computeBands(this.freqBytes, this.ctx?.sampleRate ?? 44100, analyser.fftSize);
    this.bands = smoothBandsAttackRelease(this.bands, raw, this.attack, this.release, dt);

    const flux = spectralFlux(this.magPrev, this.magNow);
    const time = this.getCurrentTime();
    const { isBeat, strength } = this.beatDetector.push(flux, time);

    let pulse = beatPulseDecay(this.frame.beatPulse, dt, this.beatHalfLife);
    if (isBeat) {
      pulse = Math.max(pulse, clamp(0.4 + strength * 0.6, 0, 1));
      this.emit('beat', { strength, timestamp: time } as never);
    }

    this.writeFrame(flux, pulse, time);
  }

  private writeFrame(flux: number, beatPulse: number, time = this.getCurrentTime()): void {
    const f = this.frame;
    f.time = time;
    f.bass = this.bands.bass;
    f.lowMid = this.bands.lowMid;
    f.highMid = this.bands.highMid;
    f.treble = this.bands.treble;
    f.loudness = this.bands.loudness;
    f.spectralFlux = flux;
    f.beatPulse = beatPulse;
  }
}

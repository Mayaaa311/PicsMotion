/**
 * Pure, deterministic beat/onset detector. Consumes a spectral-flux value per
 * frame and flags a beat when the flux exceeds an adaptive threshold (local
 * mean + k * stddev) computed over a rolling time window, subject to a
 * minimum inter-beat interval to avoid double-triggering on a single
 * transient.
 */
import { clamp } from '@interactive-photo/shared';

export interface BeatDetectorOptions {
  /** Rolling window (seconds) used to compute the adaptive mean/stddev. Default 1.5. */
  windowSeconds?: number;
  /** Number of standard deviations above the mean flux must exceed to count as a beat. Default 1.5. */
  thresholdMultiplier?: number;
  /** Minimum time (seconds) between two detected beats. Default 0.12 (120ms). */
  minIntervalSeconds?: number;
  /** Minimum number of samples collected before the detector will fire. Default 8. */
  minHistory?: number;
}

export interface BeatResult {
  isBeat: boolean;
  /** Normalized-ish overshoot above threshold in [0,1]. 0 when no beat. */
  strength: number;
}

interface FluxSample {
  time: number;
  flux: number;
}

const EPSILON = 1e-6;

export class BeatDetector {
  private readonly windowSeconds: number;
  private readonly thresholdMultiplier: number;
  private readonly minIntervalSeconds: number;
  private readonly minHistory: number;

  private history: FluxSample[] = [];
  private lastBeatTime: number | null = null;

  constructor(options: BeatDetectorOptions = {}) {
    this.windowSeconds = options.windowSeconds ?? 1.5;
    this.thresholdMultiplier = options.thresholdMultiplier ?? 1.5;
    this.minIntervalSeconds = options.minIntervalSeconds ?? 0.12;
    this.minHistory = options.minHistory ?? 8;
  }

  /** Feeds one new flux sample at `time` (seconds) and returns the detection result. */
  push(flux: number, time: number): BeatResult {
    const safeFlux = Number.isFinite(flux) ? Math.max(0, flux) : 0;
    const safeTime = Number.isFinite(time) ? time : (this.history.at(-1)?.time ?? 0);

    this.history.push({ time: safeTime, flux: safeFlux });
    const cutoff = safeTime - this.windowSeconds;
    while (this.history.length > 0 && (this.history[0] as FluxSample).time < cutoff) {
      this.history.shift();
    }

    if (this.history.length < this.minHistory) {
      return { isBeat: false, strength: 0 };
    }

    const values = this.history.map((entry) => entry.flux);
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
    const stddev = Math.sqrt(variance);
    const threshold = mean + this.thresholdMultiplier * stddev;

    const withinCooldown =
      this.lastBeatTime !== null && safeTime - this.lastBeatTime < this.minIntervalSeconds;
    const exceedsThreshold = safeFlux > threshold && safeFlux > EPSILON;

    if (exceedsThreshold && !withinCooldown) {
      this.lastBeatTime = safeTime;
      const scale = stddev > EPSILON ? stddev : Math.max(mean, EPSILON);
      const strength = clamp((safeFlux - threshold) / scale, 0, 1);
      return { isBeat: true, strength };
    }

    return { isBeat: false, strength: 0 };
  }

  /** Clears all rolling history and cooldown state. */
  reset(): void {
    this.history = [];
    this.lastBeatTime = null;
  }
}

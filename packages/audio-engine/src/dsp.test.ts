import { describe, expect, it } from 'vitest';

import {
  beatPulseDecay,
  computeBands,
  smoothAR,
  smoothBandsAttackRelease,
  spectralFlux,
  type BandEnergies,
} from './dsp';

const SAMPLE_RATE = 44100;
const FFT_SIZE = 2048;
const BINS = FFT_SIZE / 2; // frequencyBinCount
const BIN_HZ = SAMPLE_RATE / FFT_SIZE; // ~21.5 Hz

/** Build byte FFT data with a given value only in bins covering [loHz, hiHz). */
function bytesInRange(loHz: number, hiHz: number, value: number): Uint8Array {
  const data = new Uint8Array(BINS);
  for (let i = 0; i < BINS; i++) {
    const hz = i * BIN_HZ;
    if (hz >= loHz && hz < hiHz) data[i] = value;
  }
  return data;
}

describe('computeBands', () => {
  it('returns all-zero for empty input', () => {
    expect(computeBands(new Uint8Array(0), SAMPLE_RATE, FFT_SIZE)).toEqual({
      bass: 0,
      lowMid: 0,
      highMid: 0,
      treble: 0,
      loudness: 0,
    });
  });

  it('routes energy into the matching band only', () => {
    const bands = computeBands(bytesInRange(20, 140, 255), SAMPLE_RATE, FFT_SIZE);
    expect(bands.bass).toBeGreaterThan(0.9);
    expect(bands.lowMid).toBe(0);
    expect(bands.highMid).toBe(0);
    expect(bands.treble).toBe(0);
  });

  it('routes treble energy to treble', () => {
    const bands = computeBands(bytesInRange(3000, 16000, 255), SAMPLE_RATE, FFT_SIZE);
    expect(bands.treble).toBeGreaterThan(0.9);
    expect(bands.bass).toBe(0);
  });

  it('normalizes every value into [0,1]', () => {
    const full = new Uint8Array(BINS).fill(255);
    const bands = computeBands(full, SAMPLE_RATE, FFT_SIZE);
    for (const v of Object.values(bands)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(bands.loudness).toBeGreaterThan(0.9);
  });

  it('maps Float32 dB data into [0,1]', () => {
    const floats = new Float32Array(BINS).fill(-30); // at/above the dB ceiling
    const bands = computeBands(floats, SAMPLE_RATE, FFT_SIZE);
    expect(bands.loudness).toBeGreaterThan(0.9);
    const quiet = computeBands(new Float32Array(BINS).fill(-100), SAMPLE_RATE, FFT_SIZE);
    expect(quiet.loudness).toBeLessThan(0.05);
  });
});

describe('spectralFlux', () => {
  it('counts only rising energy', () => {
    expect(spectralFlux([0.1, 0.1], [0.5, 0.5])).toBeGreaterThan(0);
    expect(spectralFlux([0.5, 0.5], [0.1, 0.1])).toBe(0); // falling ignored
  });
  it('is zero for identical spectra and for empty input', () => {
    expect(spectralFlux([0.3, 0.3], [0.3, 0.3])).toBe(0);
    expect(spectralFlux([], [])).toBe(0);
  });
  it('is normalized by bin count (FFT-size independent)', () => {
    const small = spectralFlux(new Float32Array(4), new Float32Array(4).fill(1));
    const large = spectralFlux(new Float32Array(64), new Float32Array(64).fill(1));
    expect(small).toBeCloseTo(large, 5);
  });
});

describe('smoothAR', () => {
  it('rises faster with a larger attack than it falls with a small release', () => {
    const dt = 1 / 60;
    const up = smoothAR(0, 1, 30, 2, dt); // rising uses attack
    const down = smoothAR(1, 0, 30, 2, dt); // falling uses release
    expect(up).toBeGreaterThan(1 - down); // attack moved further than release
  });

  it('converges to the target', () => {
    let v = 0;
    for (let i = 0; i < 500; i++) v = smoothAR(v, 1, 20, 20, 1 / 60);
    expect(v).toBeGreaterThan(0.99);
  });

  it('does not move when dt is zero', () => {
    expect(smoothAR(0.25, 1, 20, 5, 0)).toBe(0.25);
  });

  it('tolerates non-finite input', () => {
    expect(Number.isFinite(smoothAR(Number.NaN, 1, 20, 5, 1 / 60))).toBe(true);
  });
});

describe('smoothBandsAttackRelease', () => {
  it('smooths every band independently', () => {
    const prev: BandEnergies = { bass: 0, lowMid: 0, highMid: 0, treble: 0, loudness: 0 };
    const cur: BandEnergies = { bass: 1, lowMid: 1, highMid: 1, treble: 1, loudness: 1 };
    const out = smoothBandsAttackRelease(prev, cur, 20, 5, 1 / 60);
    for (const v of Object.values(out)) {
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('beatPulseDecay', () => {
  it('decays monotonically toward zero', () => {
    let v = 1;
    const seen: number[] = [];
    for (let i = 0; i < 30; i++) {
      v = beatPulseDecay(v, 1 / 60, 0.18);
      seen.push(v);
    }
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i]!).toBeLessThan(seen[i - 1]!);
    }
    expect(v).toBeLessThan(0.2);
  });

  it('halves after one half-life', () => {
    expect(beatPulseDecay(1, 0.2, 0.2)).toBeCloseTo(0.5, 2);
  });

  it('stays within [0,1] and handles bad input', () => {
    expect(beatPulseDecay(5, 0.1, 0.2)).toBeLessThanOrEqual(1);
    expect(beatPulseDecay(1, 0.1, 0)).toBe(0);
  });
});

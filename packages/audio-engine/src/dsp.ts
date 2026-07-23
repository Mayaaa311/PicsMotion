/**
 * Pure, allocation-light DSP helpers used by the audio engine. None of these
 * touch the DOM or Web Audio API so they can be exercised directly in tests
 * with synthetic arrays.
 */
import { clamp, damp, mapRange } from '@interactive-photo/shared';

/** Normalized [0,1] energy per frequency band, plus overall loudness. */
export interface BandEnergies {
  bass: number;
  lowMid: number;
  highMid: number;
  treble: number;
  loudness: number;
}

type BandName = 'bass' | 'lowMid' | 'highMid' | 'treble';

/** Inclusive-lower/exclusive-upper Hz ranges for each band. */
const BAND_RANGES: Record<BandName, readonly [number, number]> = {
  bass: [20, 140],
  lowMid: [140, 700],
  highMid: [700, 3000],
  treble: [3000, 16000],
};

const BAND_NAMES: BandName[] = ['bass', 'lowMid', 'highMid', 'treble'];

/** Typical dB floor/ceiling used by AnalyserNode.getFloatFrequencyData(). */
const FLOAT_MIN_DB = -100;
const FLOAT_MAX_DB = -30;

function normalizeMagnitude(raw: number, isByteData: boolean): number {
  if (!Number.isFinite(raw)) return 0;
  if (isByteData) {
    return clamp(raw / 255, 0, 1);
  }
  return clamp(mapRange(raw, FLOAT_MIN_DB, FLOAT_MAX_DB, 0, 1), 0, 1);
}

/**
 * Buckets FFT magnitude bins into perceptual bands (bass/lowMid/highMid/treble)
 * and an overall loudness value, all normalized to [0,1].
 *
 * `freqData` may be a `Uint8Array` (as returned by `getByteFrequencyData`,
 * values in [0,255]) or a `Float32Array` (as returned by
 * `getFloatFrequencyData`, values in dB). `sampleRate` and `fftSize` are used
 * to derive the Hz represented by each bin: `binHz = sampleRate / fftSize`.
 */
export function computeBands(
  freqData: Uint8Array | Float32Array,
  sampleRate: number,
  fftSize: number,
): BandEnergies {
  const binCount = freqData.length;
  if (binCount === 0 || !Number.isFinite(sampleRate) || !Number.isFinite(fftSize) || fftSize <= 0) {
    return { bass: 0, lowMid: 0, highMid: 0, treble: 0, loudness: 0 };
  }

  const isByteData = freqData instanceof Uint8Array;
  const binHz = sampleRate / fftSize;

  const sums: Record<BandName, number> = { bass: 0, lowMid: 0, highMid: 0, treble: 0 };
  const counts: Record<BandName, number> = { bass: 0, lowMid: 0, highMid: 0, treble: 0 };
  let totalSum = 0;

  for (let i = 0; i < binCount; i++) {
    const raw = freqData[i] ?? 0;
    const normalized = normalizeMagnitude(raw, isByteData);
    totalSum += normalized;

    const hz = i * binHz;
    for (const band of BAND_NAMES) {
      const [lo, hi] = BAND_RANGES[band];
      if (hz >= lo && hz < hi) {
        sums[band] += normalized;
        counts[band] += 1;
        break;
      }
    }
  }

  const bass = counts.bass > 0 ? sums.bass / counts.bass : 0;
  const lowMid = counts.lowMid > 0 ? sums.lowMid / counts.lowMid : 0;
  const highMid = counts.highMid > 0 ? sums.highMid / counts.highMid : 0;
  const treble = counts.treble > 0 ? sums.treble / counts.treble : 0;
  const loudness = totalSum / binCount;

  return {
    bass: clamp(bass, 0, 1),
    lowMid: clamp(lowMid, 0, 1),
    highMid: clamp(highMid, 0, 1),
    treble: clamp(treble, 0, 1),
    loudness: clamp(loudness, 0, 1),
  };
}

/**
 * Sums only the positive (rising) differences between two magnitude spectra,
 * normalized by bin count so the result is independent of FFT size. This is
 * the classic "spectral flux" onset-strength signal used to drive beat
 * detection. Falling energy is ignored entirely.
 */
export function spectralFlux(
  prevMag: Float32Array | number[],
  curMag: Float32Array | number[],
): number {
  const length = Math.min(prevMag.length, curMag.length);
  if (length === 0) return 0;

  let sum = 0;
  for (let i = 0; i < length; i++) {
    const prev = prevMag[i] ?? 0;
    const cur = curMag[i] ?? 0;
    const diff = cur - prev;
    if (diff > 0) sum += diff;
  }

  const normalized = sum / length;
  return Number.isFinite(normalized) ? Math.max(0, normalized) : 0;
}

/**
 * Frame-rate independent exponential smoothing with separate attack (rising)
 * and release (falling) rates, in the same spirit as an audio envelope
 * follower. `attack`/`release` are smoothing rates (larger = snappier), `dt`
 * is the elapsed time in seconds since the previous sample.
 */
export function smoothAR(prev: number, cur: number, attack: number, release: number, dt: number): number {
  const safePrev = Number.isFinite(prev) ? prev : 0;
  const safeCur = Number.isFinite(cur) ? cur : 0;
  const safeDt = Number.isFinite(dt) && dt > 0 ? dt : 0;
  const rising = safeCur >= safePrev;
  const lambda = rising ? attack : release;
  const safeLambda = Number.isFinite(lambda) && lambda > 0 ? lambda : 0;

  const result = damp(safePrev, safeCur, safeLambda, safeDt);
  return Number.isFinite(result) ? result : safePrev;
}

/** Applies {@link smoothAR} independently to every band in a {@link BandEnergies}. */
export function smoothBandsAttackRelease(
  prev: BandEnergies,
  cur: BandEnergies,
  attack: number,
  release: number,
  dt: number,
): BandEnergies {
  return {
    bass: smoothAR(prev.bass, cur.bass, attack, release, dt),
    lowMid: smoothAR(prev.lowMid, cur.lowMid, attack, release, dt),
    highMid: smoothAR(prev.highMid, cur.highMid, attack, release, dt),
    treble: smoothAR(prev.treble, cur.treble, attack, release, dt),
    loudness: smoothAR(prev.loudness, cur.loudness, attack, release, dt),
  };
}

/**
 * Exponentially decays a beat pulse toward 0 with the given half-life, in
 * seconds. Frame-rate independent and monotonically decreasing.
 */
export function beatPulseDecay(prev: number, dt: number, halfLifeSeconds: number): number {
  const safePrev = Number.isFinite(prev) ? clamp(prev, 0, 1) : 0;
  if (!Number.isFinite(halfLifeSeconds) || halfLifeSeconds <= 0) return 0;

  const safeDt = Number.isFinite(dt) && dt > 0 ? dt : 0;
  const lambda = Math.LN2 / halfLifeSeconds;
  const next = safePrev * Math.exp(-lambda * safeDt);
  return clamp(Number.isFinite(next) ? next : 0, 0, 1);
}

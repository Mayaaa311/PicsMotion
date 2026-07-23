import type { AudioBinding, AudioFrame } from '@interactive-photo/scene-schema';
import { applyEasing, clamp } from '@interactive-photo/shared';

/**
 * Evaluate a single declarative audio→parameter binding against a frame.
 *
 * The normalized source value ([0,1]) is shaped by the binding's easing curve,
 * then scaled/offset and clamped to the binding's range. This is the runtime's
 * self-contained evaluator so the scene consumes normalized values and never
 * touches an AnalyserNode (or the audio-engine package) directly.
 */
export function evaluateBinding(binding: AudioBinding, frame: AudioFrame): number {
  const raw = frame[binding.source];
  const eased = applyEasing(raw, binding.curve);
  const value = eased * binding.scale + binding.offset;
  const [lo, hi] = binding.clamp;
  return clamp(value, lo, hi);
}

/** Evaluate a list of bindings into a map keyed by target path. */
export function applyAudioBindings(
  bindings: AudioBinding[],
  frame: AudioFrame,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of bindings) out[b.target] = evaluateBinding(b, frame);
  return out;
}

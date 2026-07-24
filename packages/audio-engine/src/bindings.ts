/** Pure evaluation of declarative audio-reactive bindings against an {@link AudioFrame}. */
import { applyEasing, clamp } from '@interactive-photo/shared';
import type { AudioBinding, AudioFrame } from '@interactive-photo/scene-schema';

/**
 * Reads `binding.source` off `frame`, applies the binding's easing curve to
 * the normalized [0,1] value, then applies `scale`/`offset`, then clamps to
 * `binding.clamp`. This is the only place binding math should live — scene
 * components should call {@link evaluateBindings} rather than re-deriving it.
 */
export function evaluateBinding(binding: AudioBinding, frame: AudioFrame): number {
  const raw = frame[binding.source];
  const eased = applyEasing(raw, binding.curve);
  const scaled = eased * binding.scale + binding.offset;

  const [a, b] = binding.clamp;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return clamp(scaled, lo, hi);
}

/** Evaluates every binding against `frame`, keyed by `binding.target`. */
export function evaluateBindings(bindings: AudioBinding[], frame: AudioFrame): Record<string, number> {
  const result: Record<string, number> = {};
  for (const binding of bindings) {
    result[binding.target] = evaluateBinding(binding, frame);
  }
  return result;
}

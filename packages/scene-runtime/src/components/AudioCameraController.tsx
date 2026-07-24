'use client';

import { CAMERA_DISTANCE, clamp, damp } from '@interactive-photo/shared';
import { useFrame, useThree } from '@react-three/fiber';

import { applyAudioBindings } from '../audio/bindings';
import { useRuntime } from '../context';
import { useRuntimeStore } from '../store';

/** Max world-space push-in from audio, kept small so the image stays stable. */
const MAX_AUDIO_PUSH = 0.5;

/**
 * Applies audio energy to the camera as a gentle, clamped push-in ("depth zoom")
 * plus an optional beat impulse. Values come from the scene's declarative
 * `audioBindings` (targets `camera.zoom` / `camera.push`); if none are provided
 * it falls back to a subtle loudness+beat response so audio is always felt.
 *
 * Never queries an AnalyserNode — it reads normalized frames via `getAudioFrame`.
 */
export function AudioCameraController() {
  const { scene, preset, getAudioFrame } = useRuntime();
  const camera = useThree((s) => s.camera);

  useFrame((state, rawDelta) => {
    const { paused, reducedMotion } = useRuntimeStore.getState();
    if (paused) return;
    const dt = Math.min(rawDelta, 1 / 30);

    // Gentle handheld drift, scaled by the preset (and calmed under reduced motion).
    const drift = scene.camera.driftStrength * (reducedMotion ? 0.3 : 1);
    const t = state.clock.elapsedTime;
    camera.position.x = damp(camera.position.x, Math.sin(t * 0.13) * drift, 2, dt);
    camera.position.y = damp(camera.position.y, Math.cos(t * 0.17) * drift * 0.6, 2, dt);

    const frame = getAudioFrame();
    let push = 0;
    if (frame) {
      const bound = applyAudioBindings(scene.audioBindings, frame);
      const fromBindings = (bound['camera.zoom'] ?? 0) + (bound['camera.push'] ?? 0);
      // Fallback response when no camera bindings are authored.
      const fallback =
        scene.audioBindings.length === 0
          ? frame.loudness * preset.camera.zoomResponse * 6 + frame.beatPulse * 0.15
          : 0;
      push = fromBindings + fallback;
    }
    if (reducedMotion) push *= 0.3;
    push = clamp(push, 0, MAX_AUDIO_PUSH);

    const targetZ = CAMERA_DISTANCE - push;
    camera.position.z = damp(camera.position.z, targetZ, 5, dt);
  });

  return null;
}

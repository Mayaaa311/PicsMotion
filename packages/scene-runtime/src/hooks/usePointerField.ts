'use client';

import {
  createInitialPointerFieldState,
  type PointerFieldState,
} from '@interactive-photo/scene-schema';
import { clamp } from '@interactive-photo/shared';
import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';

/**
 * Tracks the pointer over a target element and exposes a mutable ref with
 * normalized position, image-space position, velocity, speed and acceleration.
 *
 * Values update on pointer events and are smoothed on a rAF loop. Nothing here
 * calls setState — consumers read `ref.current` inside their own frame loop.
 *
 * Supports mouse, touch and pen via Pointer Events.
 */
export function usePointerField(
  targetRef: MutableRefObject<HTMLElement | null>,
  smoothing = 0.15,
): MutableRefObject<PointerFieldState> {
  const stateRef = useRef<PointerFieldState>(createInitialPointerFieldState());
  // Raw (unsmoothed) target the smoother chases.
  const rawRef = useRef({ x: 0.5, y: 0.5 });
  const smoothingRef = useRef(smoothing);
  smoothingRef.current = smoothing;

  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;

    function readPosition(e: PointerEvent) {
      const rect = el!.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      rawRef.current.x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
      rawRef.current.y = clamp((e.clientY - rect.top) / rect.height, 0, 1);
      stateRef.current.lastInteractionTime = performance.now();
    }

    const onMove = (e: PointerEvent) => readPosition(e);
    const onDown = (e: PointerEvent) => {
      stateRef.current.isDown = true;
      readPosition(e);
    };
    const onUp = () => {
      stateRef.current.isDown = false;
    };

    el.addEventListener('pointermove', onMove, { passive: true });
    el.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });

    let raf = 0;
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      const dt = Math.max(1, now - last) / 1000;
      last = now;

      const s = stateRef.current;
      const prevX = s.normalized.x;
      const prevY = s.normalized.y;
      const prevSpeed = s.speed;

      const f = clamp(smoothingRef.current, 0, 1);
      s.normalized.x += f * (rawRef.current.x - s.normalized.x);
      s.normalized.y += f * (rawRef.current.y - s.normalized.y);
      // Image space currently equals normalized (single full-frame stage).
      s.imageSpace.x = s.normalized.x;
      s.imageSpace.y = s.normalized.y;

      s.velocity.x = (s.normalized.x - prevX) / dt;
      s.velocity.y = (s.normalized.y - prevY) / dt;
      s.speed = Math.hypot(s.velocity.x, s.velocity.y);
      s.acceleration = (s.speed - prevSpeed) / dt;

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      cancelAnimationFrame(raf);
    };
  }, [targetRef]);

  return stateRef;
}

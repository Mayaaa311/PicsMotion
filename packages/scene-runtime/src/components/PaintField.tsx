'use client';

import { StylePaintField, type StampPoint } from '@interactive-photo/effects';
import { clamp } from '@interactive-photo/shared';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';

import { useRuntime } from '../context';
import type { Size } from '../math/coordinates';
import { useRuntimeStore } from '../store';

interface PaintFieldProps {
  /** Contain-fit picture size in world units. */
  stage: Size;
  /** Visible world size for the current viewport (for pointer → picture mapping). */
  visible: Size;
  /** Latest pointer position (container-normalized [0,1]) + speed. */
  getPointer: () => { x: number; y: number; speed: number };
}

/** Resolution of the paint field render target (picture-UV space). */
const PAINT_RESOLUTION = 1024;
/** Seconds for a full-strength stroke to fade completely — long + gradual. */
const PAINT_LIFETIME_SECONDS = 40;
/** Brush radius (UV) at rest and how much it grows with cursor speed. */
const BRUSH_RADIUS_MIN = 0.05;
const BRUSH_RADIUS_MAX = 0.16;
const BRUSH_SPEED_GAIN = 0.07;
/** UV spacing between interpolated stamps so fast sweeps stay continuous. */
const STAMP_SPACING = 0.02;
/** Cap stamps per frame so a pointer jump can't flood the pool. */
const MAX_STAMPS_PER_FRAME = 48;

/**
 * Owns the cursor "paint" field and advances it every frame: the cursor lays
 * down soft, speed-scaled brush stamps that record the *active* style per pixel
 * and fade slowly over ~40s. Selecting "Original" (no active style) makes the
 * brush an eraser that reveals the untouched photo. The field is shared via
 * {@link useRuntime} so each layer's styled overlay can show every stroke in the
 * style it was painted with.
 *
 * Painting is clamped to the picture: pointer positions over the letterbox map
 * outside [0,1] and are skipped, so the brush never paints beyond the photo.
 */
export function PaintField({ stage, visible, getPointer }: PaintFieldProps) {
  const { paintFieldRef } = useRuntime();
  const gl = useThree((s) => s.gl);
  const lastUv = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const field = new StylePaintField(PAINT_RESOLUTION);
    paintFieldRef.current = field;
    return () => {
      if (paintFieldRef.current === field) paintFieldRef.current = null;
      field.dispose();
    };
  }, [paintFieldRef]);

  useFrame((_, rawDelta) => {
    const field = paintFieldRef.current;
    if (!field) return;
    const { paused, activeStyle, styleList } = useRuntimeStore.getState();
    if (paused) return;
    const dt = Math.min(rawDelta, 1 / 30);

    // Active style → paint that index; no active style → erase back to original.
    const styleIndex = activeStyle ? styleList.indexOf(activeStyle) : -1;
    const erase = styleIndex < 0;

    // Map the pointer (container-normalized) into picture UV via the contain-fit
    // stage. Positions over the letterbox fall outside [0,1] → no paint.
    const p = getPointer();
    const u = ((p.x - 0.5) * visible.width) / stage.width + 0.5;
    const v = ((0.5 - p.y) * visible.height) / stage.height + 0.5;
    const inside = u >= 0 && u <= 1 && v >= 0 && v <= 1;

    const stamps: StampPoint[] = [];
    if (inside) {
      const prev = lastUv.current;
      if (prev) {
        const dist = Math.hypot(u - prev.x, v - prev.y);
        const steps = clamp(Math.ceil(dist / STAMP_SPACING), 1, MAX_STAMPS_PER_FRAME);
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          stamps.push({ x: prev.x + (u - prev.x) * t, y: prev.y + (v - prev.y) * t });
        }
      } else {
        stamps.push({ x: u, y: v });
      }
      lastUv.current = { x: u, y: v };
    } else {
      lastUv.current = null; // break the stroke so re-entry doesn't streak across
    }

    // Faster cursor → larger brush.
    const radius = clamp(
      BRUSH_RADIUS_MIN + p.speed * BRUSH_SPEED_GAIN,
      BRUSH_RADIUS_MIN,
      BRUSH_RADIUS_MAX,
    );
    field.update(gl, dt, stamps, PAINT_LIFETIME_SECONDS, radius, Math.max(styleIndex, 0), erase);
  });

  return null;
}

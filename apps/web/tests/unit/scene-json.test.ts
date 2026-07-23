import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { safeParseSceneDocument } from '@interactive-photo/scene-schema';
import { describe, expect, it } from 'vitest';

const scenePath = fileURLToPath(
  new URL('../../public/scenes/yosemite-falls/scene.json', import.meta.url),
);

describe('shipped sample scene', () => {
  const raw = JSON.parse(readFileSync(scenePath, 'utf8')) as unknown;
  const result = safeParseSceneDocument(raw);

  it('validates against the scene schema', () => {
    if (!result.success) {
      // Surface readable issues if this ever regresses.
      console.error(result.error.issues);
    }
    expect(result.success).toBe(true);
  });

  it('has 3-5+ layers with a primary subject', () => {
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.layers.length).toBeGreaterThanOrEqual(3);
      expect(result.data.layers.some((l) => l.role === 'primary-subject')).toBe(true);
    }
  });

  it('keeps the primary subject less mobile than the foreground', () => {
    expect(result.success).toBe(true);
    if (result.success) {
      const subject = result.data.layers.find((l) => l.role === 'primary-subject');
      const foreground = result.data.layers.find((l) => l.role === 'foreground');
      expect(subject).toBeDefined();
      expect(foreground).toBeDefined();
      // Product rule: the subject should move less than foreground decoration.
      expect(subject!.movement.parallaxStrength).toBeLessThan(
        foreground!.movement.parallaxStrength,
      );
    }
  });
});

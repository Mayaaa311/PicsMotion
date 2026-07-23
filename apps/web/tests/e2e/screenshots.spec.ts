import { mkdirSync } from 'node:fs';

import { expect, test } from '@playwright/test';

/**
 * Not a pass/fail test — a capture helper. Run explicitly:
 *   SHOT_DIR=/abs/dir pnpm exec playwright test screenshots --project=chromium
 * Saves one PNG per preset after interacting (sweep / dwell) so effects show.
 */
const OUT = process.env.SHOT_DIR ?? 'screenshots';
// Capture helper, not a CI test — only runs when SHOT_DIR is set.
test.skip(!process.env.SHOT_DIR, 'set SHOT_DIR to capture screenshots');
if (process.env.SHOT_DIR) mkdirSync(OUT, { recursive: true });

const CASES = [
  { preset: 'soft-nature', action: 'sweep' },
  { preset: 'urban', action: 'paint' },
  { preset: 'dark', action: 'sweep' },
  { preset: 'nostalgic', action: 'dwell' },
] as const;

for (const { preset, action } of CASES) {
  test(`capture ${preset}`, async ({ page }) => {
    await page.goto(`/demo/${preset}`);
    await expect(page.getByTestId('interactive-scene').locator('canvas')).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(1500);
    const box = (await page.getByTestId('interactive-scene').boundingBox())!;
    const at = (fx: number, fy: number) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy });

    if (action === 'paint') {
      // Fast sweeps to lay big comic paint strokes.
      const a = at(0.2, 0.3);
      await page.mouse.move(a.x, a.y);
      for (const [fx, fy] of [[0.8, 0.35], [0.3, 0.6], [0.75, 0.7], [0.5, 0.45]] as const) {
        const p = at(fx, fy);
        await page.mouse.move(p.x, p.y, { steps: 6 });
      }
    } else if (action === 'dwell') {
      const p = at(0.55, 0.45);
      await page.mouse.move(p.x, p.y);
      await page.waitForTimeout(1800); // let the halo build
    } else {
      const a = at(0.25, 0.4);
      const bb = at(0.7, 0.5);
      await page.mouse.move(a.x, a.y);
      await page.mouse.move(bb.x, bb.y, { steps: 20 });
    }
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/${preset}.png` });
  });
}

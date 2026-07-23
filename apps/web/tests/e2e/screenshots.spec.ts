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

// Capture the photo gallery + a picked photo + clean Urban (no paint overlay).
test('capture gallery flow', async ({ page }) => {
  await page.goto('/demo/soft-nature');
  await expect(page.getByTestId('interactive-scene').locator('canvas')).toBeVisible({
    timeout: 30_000,
  });
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: 'Choose photo' }).click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/gallery-open.png` });

  const thumbs = page.locator('button:has(img[alt])');
  const n = await thumbs.count();
  if (n > 0) {
    await thumbs.nth(Math.min(4, n - 1)).click();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT}/gallery-picked.png` });
  }

  await page.getByRole('button', { name: 'Urban / Spider-Verse' }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/urban-clean.png` });
});

// Capture the AI art-style cross-fade (if styles were generated for the scene).
for (const style of ['Spider-Verse Comic', 'Watercolor Painting', 'Ink Sketch'] as const) {
  test(`capture style ${style}`, async ({ page }) => {
    await page.goto('/demo/soft-nature');
    await expect(page.getByTestId('interactive-scene').locator('canvas')).toBeVisible({
      timeout: 30_000,
    });
    const btn = page.getByRole('button', { name: style, exact: true });
    if ((await btn.count()) === 0) test.skip(true, 'styles not generated');
    await btn.click();
    await page.waitForTimeout(1800); // let the cross-fade settle
    await page.screenshot({ path: `${OUT}/style-${style.split(' ')[0]!.toLowerCase()}.png` });
  });
}

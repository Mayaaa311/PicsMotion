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

// Pick a photo with a clear subject and sweep the cursor: the subject should
// parallax as one solid piece with no ghost duplicate left in the background.
test('capture subject parallax', async ({ page }) => {
  test.setTimeout(120_000);
  const photoId = process.env.SHOT_PHOTO ?? '99037565b26c2ef085d8f9c66fcf7a52';
  await page.goto('/demo/soft-nature');
  await expect(page.getByTestId('interactive-scene').locator('canvas')).toBeVisible({
    timeout: 30_000,
  });
  await page.waitForTimeout(1000);

  await page.getByRole('button', { name: 'Choose photo' }).click();
  await page.waitForTimeout(500);
  const thumb = page.locator(`img[alt="Photo ${photoId}"]`);
  if ((await thumb.count()) === 0) test.skip(true, `photo ${photoId} not in gallery`);
  await thumb.click();
  await page.waitForTimeout(3000); // load the new scene's layers

  // Drive the pointer to one extreme so the subject is maximally displaced.
  const box = (await page.getByTestId('interactive-scene').boundingBox())!;
  const at = (fx: number, fy: number) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy });
  const a = at(0.5, 0.5);
  const b = at(0.9, 0.35);
  await page.mouse.move(a.x, a.y);
  await page.mouse.move(b.x, b.y, { steps: 25 });
  await page.waitForTimeout(1200); // let the damped parallax settle at the extreme
  await page.screenshot({ path: `${OUT}/subject-parallax.png` });
});

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
});

// Paint four DIFFERENT styles into four bands. Each band must keep its own
// style — proving the per-style overlay scales past any fixed sampler limit.
test('capture many styles', async ({ page }) => {
  test.setTimeout(150_000); // loads one multi-MB styled frame per style
  await page.goto('/demo/soft-nature');
  await expect(page.getByTestId('interactive-scene').locator('canvas')).toBeVisible({
    timeout: 30_000,
  });
  await page.waitForTimeout(1200);

  const box = (await page.getByTestId('interactive-scene').boundingBox())!;
  const at = (fx: number, fy: number) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy });
  const bands: Array<[string, number]> = [
    ['Van Gogh', 0.2],
    ['Miyazaki', 0.4],
    ['Cyberpunk', 0.6],
    ['Watercolour', 0.8],
  ];

  for (const [styleName, fy] of bands) {
    const btn = page.getByRole('button', { name: styleName, exact: true });
    if ((await btn.count()) === 0) test.skip(true, `${styleName} not generated`);
    await btn.click();
    await page.waitForTimeout(500); // let the styled texture load
    const start = at(0.3, fy);
    await page.mouse.move(start.x, start.y);
    for (const fx of [0.45, 0.6, 0.7]) {
      const p = at(fx, fy);
      await page.mouse.move(p.x, p.y, { steps: 8 });
    }
    await page.waitForTimeout(250);
  }

  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/style-many.png` });
});

// Paint style A in one region, switch to style B, paint another region: the
// first region must KEEP style A (switching only affects new strokes).
test('capture mixed styles', async ({ page }) => {
  await page.goto('/demo/soft-nature');
  await expect(page.getByTestId('interactive-scene').locator('canvas')).toBeVisible({
    timeout: 30_000,
  });
  await page.waitForTimeout(1200);
  const first = page.getByRole('button', { name: 'Impressionist', exact: true });
  if ((await first.count()) === 0) test.skip(true, 'styles not generated');

  const box = (await page.getByTestId('interactive-scene').boundingBox())!;
  const at = (fx: number, fy: number) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy });
  const paint = async (pts: Array<[number, number]>) => {
    await page.mouse.move(...(Object.values(at(pts[0]![0], pts[0]![1])) as [number, number]));
    for (const [fx, fy] of pts.slice(1)) {
      const p = at(fx, fy);
      await page.mouse.move(p.x, p.y, { steps: 10 });
    }
    await page.waitForTimeout(200);
  };

  await first.click();
  await page.waitForTimeout(300);
  await paint([[0.35, 0.22], [0.6, 0.25], [0.45, 0.32], [0.62, 0.34]]); // upper band

  await page.getByRole('button', { name: 'Pop Art', exact: true }).click();
  await page.waitForTimeout(300);
  await paint([[0.35, 0.7], [0.62, 0.68], [0.45, 0.78], [0.6, 0.8]]); // lower band

  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/style-mixed.png` });
});

// Paint ONE style over the same tree/cliff overlap many times — the worst case
// for the old per-layer double-draw (which compounded into darkness).
test('capture heavy vangogh', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/demo/soft-nature');
  await expect(page.getByTestId('interactive-scene').locator('canvas')).toBeVisible({
    timeout: 30_000,
  });
  await page.waitForTimeout(1200);
  const btn = page.getByRole('button', { name: 'Van Gogh', exact: true });
  if ((await btn.count()) === 0) test.skip(true, 'styles not generated');
  await btn.click();
  await page.waitForTimeout(400);

  const box = (await page.getByTestId('interactive-scene').boundingBox())!;
  const at = (fx: number, fy: number) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy });
  // Six passes back and forth across the cliff+trees band (heavy overlap zone).
  for (let pass = 0; pass < 6; pass++) {
    const y = 0.3 + (pass % 2) * 0.06;
    const s = at(0.35, y);
    await page.mouse.move(s.x, s.y);
    for (const fx of [0.5, 0.65, 0.5, 0.4]) {
      const p = at(fx, y);
      await page.mouse.move(p.x, p.y, { steps: 6 });
    }
  }
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/heavy-vangogh.png` });
});

// Paint a big region, then select Original (eraser) and sweep back over part of
// it: the swept part must return to the sharp photo.
test('capture eraser', async ({ page }) => {
  await page.goto('/demo/soft-nature');
  await expect(page.getByTestId('interactive-scene').locator('canvas')).toBeVisible({
    timeout: 30_000,
  });
  await page.waitForTimeout(1200);
  const style = page.getByRole('button', { name: 'Pop Art', exact: true });
  if ((await style.count()) === 0) test.skip(true, 'styles not generated');

  const box = (await page.getByTestId('interactive-scene').boundingBox())!;
  const at = (fx: number, fy: number) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy });
  const paint = async (pts: Array<[number, number]>) => {
    await page.mouse.move(...(Object.values(at(pts[0]![0], pts[0]![1])) as [number, number]));
    for (const [fx, fy] of pts.slice(1)) {
      const p = at(fx, fy);
      await page.mouse.move(p.x, p.y, { steps: 12 });
    }
    await page.waitForTimeout(200);
  };

  await style.click();
  await page.waitForTimeout(300);
  await paint([[0.35, 0.3], [0.62, 0.3], [0.62, 0.6], [0.35, 0.6], [0.5, 0.45]]); // fill middle

  await page.getByRole('button', { name: 'Original', exact: true }).click();
  await page.waitForTimeout(300);
  await paint([[0.5, 0.3], [0.5, 0.6]]); // erase a vertical band back to the photo

  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/style-eraser.png` });
});

// Capture the AI art-style paintbrush reveal (if styles were generated).
for (const style of ['Stained Glass', 'Pop Art', 'Cubist', 'Impressionist'] as const) {
  test(`capture style ${style}`, async ({ page }) => {
    await page.goto('/demo/soft-nature');
    await expect(page.getByTestId('interactive-scene').locator('canvas')).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(1200);
    const btn = page.getByRole('button', { name: style, exact: true });
    if ((await btn.count()) === 0) test.skip(true, 'styles not generated');
    await btn.click();
    await page.waitForTimeout(400);

    // Paint the style in: sweep the cursor across the picture several times.
    const box = (await page.getByTestId('interactive-scene').boundingBox())!;
    const at = (fx: number, fy: number) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy });
    const path: Array<[number, number]> = [
      [0.35, 0.2], [0.65, 0.35], [0.4, 0.5], [0.62, 0.62], [0.45, 0.78], [0.58, 0.45], [0.5, 0.3],
    ];
    await page.mouse.move(...Object.values(at(path[0]![0], path[0]![1])) as [number, number]);
    for (const [fx, fy] of path.slice(1)) {
      const p = at(fx, fy);
      await page.mouse.move(p.x, p.y, { steps: 10 });
    }
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/style-${style.split(' ')[0]!.toLowerCase()}.png` });
  });
}

import { expect, test } from '@playwright/test';

test.describe('Soft Nature demo', () => {
  test('renders the interactive scene and reports a live FPS', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/demo/soft-nature');

    // The scene container mounts and a WebGL canvas appears.
    const scene = page.getByTestId('interactive-scene');
    await expect(scene).toBeVisible({ timeout: 30_000 });
    await expect(scene.locator('canvas')).toBeVisible({ timeout: 30_000 });

    // Debug panel is present with a preset label.
    const panel = page.getByTestId('debug-panel');
    await expect(panel).toBeVisible();
    await expect(page.getByTestId('debug-preset')).toHaveText('soft-nature');

    // FPS becomes non-zero once the render loop runs.
    await expect
      .poll(async () => Number((await page.getByTestId('debug-fps').textContent()) ?? '0'), {
        timeout: 15_000,
      })
      .toBeGreaterThan(0);

    // Moving the pointer updates the reported pointer coordinates.
    const box = (await scene.boundingBox())!;
    const before = await page.getByTestId('debug-pointer').textContent();
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5);
    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.5, { steps: 10 });
    await expect
      .poll(async () => page.getByTestId('debug-pointer').textContent())
      .not.toBe(before);

    // No uncaught console errors during the smoke run.
    expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
  });

  test('switches presets from the selector', async ({ page }) => {
    await page.goto('/demo/soft-nature');
    await expect(page.getByTestId('interactive-scene')).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: 'Urban / Spider-Verse' }).click();
    await expect(page.getByTestId('debug-preset')).toHaveText('urban');
  });

  test('every preset renders without console errors (postprocessing paths)', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/demo/soft-nature');
    await expect(page.getByTestId('interactive-scene').locator('canvas')).toBeVisible({
      timeout: 30_000,
    });

    // Dark (flashlight), Nostalgic (paper+halo), Urban (Spider-Verse), Soft Nature.
    for (const [label, id] of [
      ['Dark / Mysterious', 'dark'],
      ['Nostalgic / Folk', 'nostalgic'],
      ['Urban / Spider-Verse', 'urban'],
      ['Soft Nature', 'soft-nature'],
    ] as const) {
      await page.getByRole('button', { name: label }).click();
      await expect(page.getByTestId('debug-preset')).toHaveText(id);
      await page.waitForTimeout(400); // let the composer rebuild + a few frames run
    }

    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('exposes audio controls and reports audio as off until playback', async ({ page }) => {
    await page.goto('/demo/soft-nature');
    await expect(page.getByTestId('interactive-scene')).toBeVisible({ timeout: 30_000 });

    const controls = page.getByTestId('audio-controls');
    await expect(controls).toBeVisible();
    // Transport controls exist and start disabled until a source is chosen.
    await expect(controls.getByRole('button', { name: 'Play' })).toBeDisabled();
    await expect(controls.getByLabel('Seek')).toBeVisible();
    await expect(controls.getByLabel('Volume')).toBeVisible();

    // With no source the scene reports "off" rather than stale energy.
    await expect(page.getByTestId('debug-audio')).toHaveText('off');
  });
});

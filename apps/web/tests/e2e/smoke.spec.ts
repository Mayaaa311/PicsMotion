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

    await page.getByRole('button', { name: 'Electronic / Energetic' }).click();
    await expect(page.getByTestId('debug-preset')).toHaveText('electronic');
  });
});

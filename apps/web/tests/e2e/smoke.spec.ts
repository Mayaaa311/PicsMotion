import { expect, test } from '@playwright/test';

/** The four preset routes still resolve, even though the selector is hidden. */
const PRESET_ROUTES = ['soft-nature', 'urban', 'dark', 'nostalgic'] as const;

test.describe('Paint demo', () => {
  test('renders the interactive scene with no console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/demo/soft-nature');
    const scene = page.getByTestId('interactive-scene');
    await expect(scene).toBeVisible({ timeout: 30_000 });
    await expect(scene.locator('canvas')).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(800); // let the render loop run a few frames

    // Pointer interaction (drives parallax + the paint field) must not throw.
    const box = (await scene.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5);
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.5, { steps: 12 });
    await page.waitForTimeout(300);

    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('shows the paintbrush and hides the preset / debug / audio chrome', async ({ page }) => {
    await page.goto('/demo/soft-nature');
    await expect(page.getByTestId('interactive-scene').locator('canvas')).toBeVisible({
      timeout: 30_000,
    });

    // The art-style paintbrush is the app's control surface.
    await expect(page.getByRole('button', { name: 'Original', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Van Gogh', exact: true })).toBeVisible();

    // Everything the paint app intentionally hides: the preset selector, the dev
    // debug/quality/motion panel, and the audio transport.
    await expect(page.getByRole('button', { name: 'Soft Nature' })).toHaveCount(0);
    await expect(page.getByTestId('debug-panel')).toHaveCount(0);
    await expect(page.getByTestId('audio-controls')).toHaveCount(0);
  });

  test('every preset route renders without console errors', async ({ page }) => {
    for (const preset of PRESET_ROUTES) {
      const errors: string[] = [];
      const onConsole = (m: import('@playwright/test').ConsoleMessage) => {
        if (m.type() === 'error') errors.push(m.text());
      };
      const onError = (e: Error) => errors.push(e.message);
      page.on('console', onConsole);
      page.on('pageerror', onError);

      await page.goto(`/demo/${preset}`);
      await expect(page.getByTestId('interactive-scene').locator('canvas')).toBeVisible({
        timeout: 30_000,
      });
      await page.waitForTimeout(500);

      expect(errors, `${preset}: ${errors.join('\n')}`).toEqual([]);
      page.off('console', onConsole);
      page.off('pageerror', onError);
    }
  });
});

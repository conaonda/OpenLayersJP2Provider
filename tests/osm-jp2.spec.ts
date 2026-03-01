import { test, expect } from '@playwright/test';

test.describe('OSM + JP2 overlay', () => {
  test('page loads with map canvas', async ({ page }) => {
    await page.goto('/');
    const map = page.locator('#map');
    await expect(map).toBeVisible();
    // OpenLayers renders canvas inside .ol-viewport
    const canvas = page.locator('.ol-viewport canvas');
    await expect(canvas.first()).toBeVisible({ timeout: 15000 });
  });

  test('OSM tiles load successfully', async ({ page }) => {
    const osmResponse = page.waitForResponse(
      (resp) => resp.url().includes('tile.openstreetmap.org') && resp.status() === 200,
      { timeout: 15000 }
    );
    await page.goto('/');
    await osmResponse;
  });

  test('canvas has non-empty pixels', async ({ page }) => {
    await page.goto('/');
    // Wait for tiles to render
    await page.waitForTimeout(8000);

    const hasPixels = await page.evaluate(() => {
      const canvases = document.querySelectorAll('.ol-viewport canvas');
      for (const c of canvases) {
        const canvas = c as HTMLCanvasElement;
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        for (let i = 3; i < data.length; i += 4) {
          if (data[i] > 0) return true;
        }
      }
      return false;
    });

    expect(hasPixels).toBe(true);
  });

  test('no unexpected console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Allow known JP2 init errors (e.g. missing sample file)
        if (text.includes('Failed to initialize JP2 viewer')) return;
        errors.push(text);
      }
    });

    await page.goto('/');
    await page.waitForTimeout(5000);

    expect(errors).toEqual([]);
  });
});

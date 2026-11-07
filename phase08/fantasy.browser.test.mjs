import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');

test('Fantasy pigments respect the original masks and legacy Soft strokes', async () => {
  const browser = await chromium.launch(process.env.SPA_CHROME_PATH ?
    { executablePath: process.env.SPA_CHROME_PATH, args: ['--no-sandbox'] } : { channel: 'chrome' });
  try {
    const page = await browser.newPage();
    await page.goto(process.env.SPA_URL || 'http://127.0.0.1:8000/');
    const errors = await page.evaluate(async () => {
      const { createLook, regions, createPaintView } = await import('./phase08/paint.mjs');
      const { faces } = await import('./phase08/geometry.mjs');
      const { makeupBuffer } = await import('./phase08/finish.mjs');
      const context = makeupBuffer();
      const view = createPaintView(context);
      const stencil = makeupBuffer();
      const errors = [];
      for (const client of Object.keys(faces)) {
        for (const category of ['shadow', 'blush', 'lips']) {
          const paths = regions(client, category);
          const points = [];
          // Include the boundaries, where a stamp extends beyond the stencil.
          for (let x = 130; x < 385; x += 3) {
            for (let y = 235; y < 435; y += 3) {
              if (paths.some(path => context.isPointInPath(path, x, y))) points.push([x, y]);
            }
          }
          const look = createLook(client);
          const stroke = { category, color: '#af65db', points };
          look.strokes.push(stroke);
          const render = (closed = false) => {
            view.rebuild(look, closed);
            view.draw(look, null);
          };
          render();
          const legacy = context.canvas.toDataURL();
          stroke.finish = 'Soft';
          render();
          if (legacy !== context.canvas.toDataURL()) errors.push({ client, category, legacy: false });
          for (const finish of ['Pearl', 'Sparkle']) {
            stroke.finish = finish;
            stroke.hearts = category === 'blush';
            for (const closed of category === 'shadow' ? [false, true] : [false]) {
              render(closed);
              const pixels = context.getImageData(0, 0, 512, 640).data;
              stencil.clearRect(0, 0, 512, 640);
              for (const path of regions(client, category, closed)) stencil.fill(path);
              const coverage = stencil.getImageData(0, 0, 512, 640).data;
              let leaks = 0;
              // Use the browser's antialiased raster as reference so the tapered
              // tips of the lip curves are represented even below one pixel.
              for (let alpha = 3; alpha < pixels.length; alpha += 4) {
                if (pixels[alpha] > 8 && coverage[alpha] === 0) leaks++;
              }
              if (leaks) errors.push({ client, category, finish, closed, leaks });
            }
          }
        }
      }
      return errors;
    });
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

for (const [width, height, touch] of [[320, 568, true], [412, 915, true], [1280, 720, false]]) {
  test(`${width} × ${height} · six decorations on every client`, { timeout: 180000 }, async () => {
    const browser = await chromium.launch(process.env.SPA_CHROME_PATH ?
      { executablePath: process.env.SPA_CHROME_PATH, args: ['--no-sandbox'] } : { channel: 'chrome' });
    try {
      const page = await browser.newPage({ viewport: { width, height }, hasTouch: touch,
        isMobile: touch, reducedMotion: 'reduce' });
      const tap = selector => touch ? page.locator(selector).tap() : page.locator(selector).click();
      await page.goto(process.env.SPA_URL || 'http://127.0.0.1:8000/');
      await tap('#makeup');
      const surface = page.locator('#studioPaint');
      const clients = await page.evaluate(async () => {
        const { faces } = await import('./phase08/geometry.mjs');
        return Object.entries(faces).map(([id, face]) => [id, face.jewels]);
      });
      for (const [id, zones] of clients) {
        await tap(`#studioCards [data-client="${id}"]`);
        await tap('#studioCategories [data-category="jewels"]');
        await tap('#studioPalette [aria-label="Luna"]');
        await surface.scrollIntoViewIfNeeded();
        const box = await surface.boundingBox();
        const place = ([x, y]) => {
          const position = [box.x + x * box.width / 512, box.y + y * box.height / 640];
          return touch ? page.touchscreen.tap(...position) : page.mouse.click(...position);
        };
        for (const [x, y, radius] of zones) {
          await place([x - radius + 2, y + 2]);
          await place([x + radius - 2, y + 2]);
        }
        assert.match(await page.locator('#studioChoice').innerText(), /6\/6/, id);
        const [x, y, , radiusY] = zones[0];
        await place([x, y - radiusY + 1]);
        assert.match(await page.locator('#studioChoice').innerText(), /Hai già 6 decori/, id);
        await tap('#studioUndo');
        assert.match(await page.locator('#studioChoice').innerText(), /5\/6/, id);
        await tap('#studioClear');
        assert.match(await page.locator('#studioChoice').innerText(), /0\/6/, id);
        await tap('#studioClients');
      }
    } finally {
      await browser.close();
    }
  });
}

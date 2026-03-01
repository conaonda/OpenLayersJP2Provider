import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:5177';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Collect network requests
  const rangeRequests = [];
  page.on('request', (req) => {
    const range = req.headers()['range'];
    if (range) {
      rangeRequests.push({ url: req.url(), range });
    }
  });

  const consoleMessages = [];
  page.on('console', (msg) => {
    consoleMessages.push(msg.text());
  });

  const errors = [];
  page.on('pageerror', (err) => {
    errors.push(err.message);
  });

  console.log('Navigating to', BASE_URL);
  await page.goto(BASE_URL, { waitUntil: 'load', timeout: 60000 });

  // Wait for tile indexing + some tile decoding
  await page.waitForTimeout(30000);

  console.log('\n=== Console Messages ===');
  for (const msg of consoleMessages) {
    console.log(' ', msg);
  }

  console.log('\n=== Range Requests ===');
  console.log(`  Total Range requests: ${rangeRequests.length}`);
  if (rangeRequests.length > 0) {
    // Show first 5 and last 5
    const show = rangeRequests.slice(0, 5);
    for (const r of show) {
      console.log(`  ${r.range}`);
    }
    if (rangeRequests.length > 5) {
      console.log(`  ... (${rangeRequests.length - 5} more)`);
    }
  }

  console.log('\n=== Errors ===');
  if (errors.length === 0) {
    console.log('  No errors!');
  } else {
    for (const e of errors) {
      console.log(' ', e);
    }
  }

  // Check if canvas tiles were rendered
  const tileCount = await page.evaluate(() => {
    const canvases = document.querySelectorAll('canvas');
    return canvases.length;
  });
  console.log(`\n=== Render ===`);
  console.log(`  Canvas elements: ${tileCount}`);

  // Check JP2 info was parsed
  const hasJP2Info = consoleMessages.some((m) => m.includes('JP2 info:'));
  const hasTileIndex = consoleMessages.some((m) => m.includes('Tile index complete'));
  const hasTileLoad = consoleMessages.some((m) => m.includes('decoded'));

  console.log(`\n=== Summary ===`);
  console.log(`  JP2 parsed:      ${hasJP2Info ? 'YES' : 'NO'}`);
  console.log(`  Index built:     ${hasTileIndex ? 'YES' : 'NO'}`);
  console.log(`  Tiles loaded:    ${hasTileLoad ? 'YES' : 'NO'}`);
  console.log(`  Range requests:  ${rangeRequests.length > 0 ? 'YES' : 'NO'}`);
  console.log(`  Errors:          ${errors.length === 0 ? 'NONE' : errors.length}`);

  const passed = hasJP2Info && hasTileIndex && hasTileLoad && rangeRequests.length > 0 && errors.length === 0;
  console.log(`\n  Result: ${passed ? 'PASS ✓' : 'FAIL ✗'}`);

  await browser.close();
  process.exit(passed ? 0 : 1);
})();

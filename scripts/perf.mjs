// `npm run perf`: measures the main public pages on a throttled mobile profile and prints a table (NFR-PERF-01).
// Builds nothing: the npm script builds first. Uses the same throwaway seeded Worker as the browser tests.
// Method: Chromium through the DevTools protocol, 375x812, 4x CPU slowdown, slow 4G (1.6 Mbps down, 750 kbps up, 750 ms round trip),
// a fresh browser context (empty cache) for every run, median of RUNS runs. Run on a developer machine, NOT from Dili: it shows page
// weight and relative speed, not real-world latency. Pass --json to print the raw numbers.
import { chromium } from '@playwright/test';
import { startWorker } from '../e2e/serve.mjs';

const RUNS = 5;
const PAGES = [
  ['home', '/'],
  ['directory', '/tailors'],
  ['category', '/categories/placeholder-category-1'],
  ['profile', '/tailors/e2e-fake-tailor'],
  ['request', '/request'],
];
const GROUPS = {
  Document: 'html',
  Stylesheet: 'css',
  Script: 'js',
  Image: 'images',
  Font: 'fonts',
};
const median = (values) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

async function measure(browser, url) {
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 2,
    isMobile: true,
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.clearBrowserCache');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 750,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const requests = new Map();
  cdp.on('Network.responseReceived', (e) =>
    requests.set(e.requestId, {
      group: GROUPS[e.type] ?? 'other',
      transfer: 0,
      decoded: 0,
    }),
  );
  cdp.on('Network.dataReceived', (e) => {
    const r = requests.get(e.requestId);
    if (r) r.decoded += e.dataLength;
  });
  cdp.on('Network.loadingFinished', (e) => {
    const r = requests.get(e.requestId);
    if (r) r.transfer = e.encodedDataLength;
  });
  await page.addInitScript(() => {
    new PerformanceObserver((list) => {
      window.__lcp = list.getEntries().at(-1).startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(800); // let the last LCP candidate arrive
  const timing = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    return {
      dcl: nav.domContentLoadedEventEnd,
      load: nav.loadEventEnd,
      lcp: window.__lcp ?? null,
    };
  });
  await context.close();
  const bytes = {
    html: [0, 0],
    css: [0, 0],
    js: [0, 0],
    images: [0, 0],
    fonts: [0, 0],
    other: [0, 0],
  };
  for (const r of requests.values()) {
    bytes[r.group][0] += r.transfer;
    bytes[r.group][1] += r.decoded;
  }
  return { ...timing, requests: requests.size, bytes };
}

const worker = await startWorker();
const browser = await chromium.launch();
const results = {};
try {
  for (const [name, path] of PAGES) {
    const runs = [];
    for (let i = 0; i < RUNS; i++)
      runs.push(await measure(browser, `${worker.url}${path}`));
    const group = (g, k) => median(runs.map((r) => r.bytes[g][k]));
    results[name] = {
      requests: median(runs.map((r) => r.requests)),
      transferKB: Object.fromEntries(
        ['html', 'css', 'js', 'images', 'fonts'].map((g) => [
          g,
          +(group(g, 0) / 1024).toFixed(1),
        ]),
      ),
      decodedKB: Object.fromEntries(
        ['html', 'css', 'js', 'images', 'fonts'].map((g) => [
          g,
          +(group(g, 1) / 1024).toFixed(1),
        ]),
      ),
      domContentLoadedMs: Math.round(median(runs.map((r) => r.dcl))),
      loadMs: Math.round(median(runs.map((r) => r.load))),
      lcpMs: runs.every((r) => r.lcp !== null)
        ? Math.round(median(runs.map((r) => r.lcp)))
        : null,
    };
  }
} finally {
  await browser.close();
  worker.stop();
}

if (process.argv.includes('--json'))
  console.log(JSON.stringify(results, null, 2));
else {
  console.log(
    `Median of ${RUNS} runs, 375 px, 4x CPU slowdown, 1.6 Mbps, 750 ms RTT, empty cache (transfer size / decoded size in KB)`,
  );
  console.log(
    'page       req  html          css           js            images  fonts  DCL ms  load ms  LCP ms',
  );
  for (const [name, r] of Object.entries(results)) {
    const pair = (g) => `${r.transferKB[g]}/${r.decodedKB[g]}`.padEnd(13);
    console.log(
      `${name.padEnd(10)} ${String(r.requests).padEnd(4)} ${pair('html')} ${pair('css')} ${pair('js')} ${String(r.transferKB.images).padEnd(7)} ${String(r.transferKB.fonts).padEnd(6)} ${String(r.domContentLoadedMs).padEnd(7)} ${String(r.loadMs).padEnd(8)} ${r.lcpMs ?? 'n/a'}`,
    );
  }
}

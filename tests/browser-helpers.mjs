import { chromium } from '@playwright/test';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';

export async function launchExtension() {
  const extension = resolve('dist');
  const context = await chromium.launchPersistentContext('', {
    headless: process.env.HEADLESS !== 'false',
    viewport: null, // Don't override the Document PiP window's requested dimensions.
    ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : { channel: 'chromium' }),
    args: ['--enable-unsafe-extension-debugging', `--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const id = worker.url().split('/')[2];
  const cdp = await context.browser().newBrowserCDPSession();
  const trigger = async (page) => {
    const { targetInfos } = await cdp.send('Target.getTargets', { filter: [{ type: 'tab', exclude: false }] });
    const target = targetInfos.find((info) => info.url === page.url());
    if (!target) throw new Error('No tab target for extension action.');
    await cdp.send('Extensions.triggerAction', { id, targetId: target.targetId });
  };
  return { context, worker, trigger, id };
}

export async function openPip(context, trigger, page) {
  const popup = context.waitForEvent('page');
  await trigger(page);
  const pip = await popup;
  await pip.waitForSelector('.player');
  return pip;
}

export async function installFixture(context, { trustedTypes = true } = {}) {
  const bytes = await readFile('tests/fixtures/video.webm');
  await context.route('https://www.youtube.com/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/fixture.webm') {
      const range = route.request().headers().range;
      if (range) {
        const match = /bytes=(\d+)-(\d*)/.exec(range);
        const start = Number(match?.[1] ?? 0);
        const end = match?.[2] ? Math.min(Number(match[2]), bytes.length - 1) : bytes.length - 1;
        await route.fulfill({ status: 206, contentType: 'video/webm', body: bytes.subarray(start, end + 1), headers: { 'Content-Range': `bytes ${start}-${end}/${bytes.length}`, 'Accept-Ranges': 'bytes' } });
      } else await route.fulfill({ contentType: 'video/webm', body: bytes, headers: { 'Accept-Ranges': 'bytes' } });
      return;
    }
    await route.fulfill({ contentType: 'text/html', headers: trustedTypes ? { 'Content-Security-Policy': "require-trusted-types-for 'script'; script-src 'self'; style-src 'self' 'unsafe-inline'" } : {}, body: `<!doctype html><html lang="en"><head><title>Fixture - YouTube</title><style>video{width:640px;height:360px}body{background:#111;color:#fff}</style></head><body><h1>Local playback fixture</h1><div id="movie_player"><video class="html5-main-video" preload="auto" src="/fixture.webm"></video></div></body></html>` });
  });
}

export async function prepareSource(page) {
  await page.goto('https://www.youtube.com/watch?v=fixture');
  await page.waitForFunction(() => document.querySelector('video')?.readyState >= 2);
  await page.evaluate(() => {
    window.original = document.querySelector('video');
    window.originalParent = original.parentElement;
    original.pause();
    original.currentTime = 2;
    original.volume = 0.35;
    original.playbackRate = 1.25;
  });
  await page.waitForFunction(() => !original.seeking && original.readyState >= 2);
}

export async function sourceState(page) {
  return page.evaluate(() => {
    const video = document.querySelector('video');
    return { time: video.currentTime, paused: video.paused, muted: video.muted, volume: video.volume, rate: video.playbackRate, inOriginalParent: video.parentElement === window.originalParent, same: window.original === video, document: video.ownerDocument === document, src: video.currentSrc };
  });
}

export async function pixelEnergy(page, selector) {
  return page.evaluate((selector) => {
    const node = document.querySelector(selector);
    const canvas = document.createElement('canvas');
    canvas.width = 16; canvas.height = 9;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(node, 0, 0, 16, 9);
    return [...ctx.getImageData(0, 0, 16, 9).data].reduce((sum, value, i) => sum + (i % 4 === 3 ? 0 : value), 0);
  }, selector);
}

import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { launchExtension, installFixture, prepareSource, openPip, sourceState, pixelEnergy } from './browser-helpers.mjs';

let session;
let page;
test.beforeEach(async () => {
  session = await launchExtension();
  await installFixture(session.context);
  page = session.context.pages()[0];
  await prepareSource(page);
});
test.afterEach(async () => { await session?.context.close(); });

test('toolbar opens real Document PiP under Trusted Types; paused seeks preserve source and audio', async () => {
  const before = await sourceState(page);
  const pip = await openPip(session.context, session.trigger, page);
  expect(await sourceState(page)).toEqual(before);
  expect(await pixelEnergy(pip, '.still')).toBeGreaterThan(1000);
  await expect(pip.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await pip.getByRole('button', { name: 'Skip forward 10 seconds' }).click();
  await page.waitForFunction(() => !original.seeking);
  expect((await sourceState(page)).time).toBeCloseTo(12, 1);
  expect((await sourceState(page)).paused).toBe(true);
  await pip.getByRole('button', { name: 'Skip backward 10 seconds' }).click();
  await page.waitForFunction(() => !original.seeking);
  expect((await sourceState(page)).time).toBeCloseTo(2, 1);
  await pip.screenshot({ path: test.info().outputPath('mini-player.png') });
  const mirror = await pip.evaluate(() => {
    const output = document.querySelector('video');
    return { muted: output.muted, audioTracks: output.srcObject.getAudioTracks().length };
  });
  expect(mirror).toEqual({ muted: true, audioTracks: 0 });
  await pip.getByRole('button', { name: 'Close mini-player' }).click();
  await expect.poll(() => pip.isClosed()).toBe(true);
  expect(await sourceState(page)).toEqual(before);
  const reopened = await openPip(session.context, session.trigger, page);
  await session.trigger(page);
  await expect.poll(() => reopened.isClosed()).toBe(true);
});

test('play/pause controls the source; page controls synchronize; background tab keeps delivering frames', async () => {
  const pip = await openPip(session.context, session.trigger, page);
  await pip.getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForFunction(() => !original.paused && original.currentTime > 2.4, null, { polling: 100 });
  await pip.waitForFunction(() => document.querySelector('video').getVideoPlaybackQuality().totalVideoFrames > 2);
  expect(await pixelEnergy(pip, '.video')).toBeGreaterThan(1000);
  const frames = await pip.evaluate(() => document.querySelector('video').getVideoPlaybackQuality().totalVideoFrames);
  const other = await session.context.newPage();
  await other.goto('about:blank');
  await other.bringToFront();
  // Verify the source is actually a background tab. Some Chromium builds keep
  // the PiP opener's visibilityState visible to continue rendering its media.
  const cdp = await session.context.browser().newBrowserCDPSession();
  const { targetInfos } = await cdp.send('Target.getTargets', { filter: [{ type: 'tab', exclude: false }] });
  expect(targetInfos.find((target) => target.url === page.url()).embedderData.tabActive).toBe(false);
  await pip.waitForFunction((frames) => document.querySelector('video').getVideoPlaybackQuality().totalVideoFrames > frames + 5, frames);
  await pip.getByRole('button', { name: 'Pause', exact: true }).click();
  expect((await sourceState(page)).paused).toBe(true);
  const paused = (await sourceState(page)).time;
  await page.evaluate(() => original.play());
  await expect(pip.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.evaluate(() => original.pause());
  await expect(pip.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  expect((await sourceState(page)).time).toBeGreaterThanOrEqual(paused);
  await pip.evaluate(() => document.activeElement?.blur());
  await pip.keyboard.press('Space');
  await page.waitForFunction(() => !original.paused, null, { polling: 100 });
  // Closing a playing mirror must leave the original playing.
  await pip.close();
  expect((await sourceState(page)).paused).toBe(false);
  expect((await sourceState(page)).inOriginalParent).toBe(true);
});

test('native window close stops captured tracks; reopening and ended replay work', async () => {
  const pip = await openPip(session.context, session.trigger, page);
  // Save a track in the same-origin opener for inspection after PiP is destroyed.
  await pip.evaluate(() => { window.opener.capturedTrack = document.querySelector('video').srcObject.getVideoTracks()[0]; });
  await pip.close();
  await expect.poll(() => page.evaluate(() => capturedTrack.readyState)).toBe('ended');
  const reopened = await openPip(session.context, session.trigger, page);
  await page.evaluate(async () => { original.currentTime = original.duration - .1; await original.play(); });
  await page.waitForFunction(() => original.ended);
  await expect(reopened.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await reopened.getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForFunction(() => !original.paused && original.currentTime < 3);
  await reopened.waitForFunction(() => document.querySelector('video').getVideoPlaybackQuality().totalVideoFrames > 3);
});

test('YouTube navigation, removed video, and tab closure clean up the window', async () => {
  let pip = await openPip(session.context, session.trigger, page);
  await page.evaluate(() => document.dispatchEvent(new Event('yt-navigate-start')));
  await expect.poll(() => pip.isClosed()).toBe(true);
  pip = await openPip(session.context, session.trigger, page);
  await page.evaluate(() => original.remove());
  await expect.poll(() => pip.isClosed()).toBe(true);
  await prepareSource(page);
  pip = await openPip(session.context, session.trigger, page);
  await page.close();
  await expect.poll(() => pip.isClosed()).toBe(true);
});

test('ads disable seeking and resizes keep the video contained', async () => {
  const pip = await openPip(session.context, session.trigger, page);
  await page.evaluate(() => document.querySelector('#movie_player').classList.add('ad-showing'));
  await expect(pip.getByRole('button', { name: 'Skip forward 10 seconds' })).toBeDisabled();
  await expect(pip.getByRole('button', { name: 'Skip backward 10 seconds' })).toBeDisabled();
  await pip.evaluate(() => window.resizeTo(600, 400));
  expect(await pip.evaluate(() => getComputedStyle(document.querySelector('video')).objectFit)).toBe('contain');
  expect(await pip.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
});

test('missing video reports a toolbar error without opening a window', async () => {
  await page.evaluate(() => original.remove());
  await session.trigger(page);
  await expect(page.locator('#better-mini-player-notice')).toBeAttached();
  const badge = await session.worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: '*://www.youtube.com/*' });
    return chrome.action.getBadgeText({ tabId: tab.id });
  });
  expect(badge).toBe('!');
  expect(await page.evaluate(() => !!documentPictureInPicture.window)).toBe(false);
});

test('unsupported API and security failures return descriptive errors', async () => {
  // Main-world harness for deterministic failure injection; actual action tests above use ISOLATED.
  const code = await readFile('dist/player.js', 'utf8');
  await page.evaluate(() => {
    window.savedPip = documentPictureInPicture;
    Object.defineProperty(window, 'documentPictureInPicture', { value: undefined, configurable: true });
  });
  const unsupported = await page.evaluate(code);
  expect(unsupported.ok).toBe(false);
  expect(unsupported.message).toContain('unavailable');
  await page.evaluate(() => {
    Object.defineProperty(window, 'documentPictureInPicture', { value: savedPip, configurable: true });
    original.captureStream = () => { throw new DOMException('Blocked', 'SecurityError'); };
  });
  const security = await page.evaluate(code);
  expect(security.ok).toBe(false);
  expect(security.message).toContain('security restrictions');
  await expect.poll(() => page.evaluate(() => !!documentPictureInPicture.window)).toBe(false);
});

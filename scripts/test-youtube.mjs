import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { launchExtension, openPip, sourceState, pixelEnergy } from '../tests/browser-helpers.mjs';

const session = await launchExtension();
const { context, trigger } = session;
const page = context.pages()[0];
const result = { browser: await context.browser().version(), headless: process.env.HEADLESS !== 'false', site: 'https://www.youtube.com/watch?v=jNQXAC9IVRw' };
const waitSource = (condition) => page.waitForFunction(condition, null, { polling: 100, timeout: 15000 });
await mkdir('artifacts', { recursive: true });
try {
  await page.goto(result.site, { waitUntil: 'domcontentloaded', timeout: 60000 });
  // Consent can arrive after the player initializes and pause it again.
  // This isolated test profile has no user's saved preferences.
  const reject = page.getByText('Reject all', { exact: true });
  const consent = await reject.waitFor({ state: 'visible', timeout: 10000 }).then(() => true, () => false);
  if (consent) await reject.click();
  await waitSource(() => document.querySelector('#movie_player video')?.readyState >= 2);
  await page.evaluate(() => {
    window.original = document.querySelector('#movie_player video');
    window.originalParent = original.parentElement;
    original.pause();
    original.currentTime = 2;
  });
  await waitSource(() => !original.seeking && original.readyState >= 2);
  const before = await sourceState(page);
  const pip = await openPip(context, trigger, page);
  assert.deepEqual(await sourceState(page), before, 'Opening must preserve the original source and playback state');
  assert.ok(await pixelEnergy(pip, '.still') > 1000, 'Paused PiP must show an actual source frame');
  await pip.screenshot({ path: 'artifacts/youtube-paused.png' });
  await pip.getByRole('button', { name: 'Play', exact: true }).click();
  await waitSource(() => !original.paused && original.currentTime > 2.4);
  await pip.waitForFunction(() => document.querySelector('video').getVideoPlaybackQuality().totalVideoFrames > 2);
  assert.ok(await pixelEnergy(pip, '.video') > 1000, 'Playing mirror must display video frames');
  await pip.getByRole('button', { name: 'Pause', exact: true }).click();
  assert.equal((await sourceState(page)).paused, true);
  const time = (await sourceState(page)).time;
  await pip.getByRole('button', { name: 'Skip forward 10 seconds' }).click();
  await waitSource(() => !original.seeking);
  assert.ok(Math.abs((await sourceState(page)).time - time - 10) < .15, 'Forward must change actual YouTube time by 10 seconds');
  await pip.getByRole('button', { name: 'Skip backward 10 seconds' }).click();
  await waitSource(() => !original.seeking);
  assert.ok(Math.abs((await sourceState(page)).time - time) < .15, 'Backward must change actual YouTube time by 10 seconds');
  assert.equal((await sourceState(page)).paused, true);
  result.original = await sourceState(page);
  result.mirror = await pip.evaluate(() => {
    const video = document.querySelector('video');
    return { muted: video.muted, audioTracks: video.srcObject.getAudioTracks().length, frames: video.getVideoPlaybackQuality().totalVideoFrames };
  });
  assert.equal(result.mirror.audioTracks, 0);
  assert.equal(result.mirror.muted, true);
  await pip.getByRole('button', { name: 'Play', exact: true }).click();
  const frames = await pip.evaluate(() => document.querySelector('video').getVideoPlaybackQuality().totalVideoFrames);
  const other = await context.newPage();
  await other.goto('about:blank');
  await other.bringToFront();
  result.backgroundVisibility = await page.evaluate(() => document.visibilityState);
  result.backgroundTabActive = await session.worker.evaluate(async () => (await chrome.tabs.query({ url: '*://www.youtube.com/*' }))[0].active);
  assert.equal(result.backgroundTabActive, false);
  await pip.waitForFunction((frames) => document.querySelector('video').getVideoPlaybackQuality().totalVideoFrames > frames + 15, frames, { polling: 100 });
  result.backgroundFramesDelivered = true;
  await pip.getByRole('button', { name: 'Pause', exact: true }).click();
  const closing = await sourceState(page);
  await pip.getByRole('button', { name: 'Close mini-player' }).click();
  await page.waitForFunction(() => !documentPictureInPicture.window, null, { polling: 100 });
  assert.deepEqual(await sourceState(page), closing, 'Close must preserve source state and position');
  await page.bringToFront();
  const reopened = await openPip(context, trigger, page);
  await page.locator('a#logo').first().click();
  await page.waitForURL((url) => url.pathname === '/', { timeout: 15000 });
  assert.equal(reopened.isClosed(), true, 'Real YouTube SPA navigation must close PiP');
  result.passed = ['toolbar activation', 'original DOM retained', 'paused source frame', 'play', 'pause', '+10 seconds', '-10 seconds', 'audio isolation', 'background frame delivery', 'close state preservation', 'reopen', 'real YouTube navigation cleanup'];
  await writeFile('artifacts/youtube-verification.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  await page.screenshot({ path: 'artifacts/youtube-failure.png' }).catch(() => {});
  console.error('Live YouTube verification failed. Site/network/consent restrictions may prevent testing; this is not a passing playback test.');
  throw error;
} finally {
  await context.close();
}

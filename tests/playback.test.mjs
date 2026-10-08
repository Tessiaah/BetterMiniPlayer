import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle = await build({ entryPoints: ['src/playback.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const { seekTarget, skip, togglePlayback, formatTime } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const ranges = (...pairs) => ({ length: pairs.length, start: (i) => pairs[i][0], end: (i) => pairs[i][1] });
const video = (overrides = {}) => ({ currentTime: 20, duration: 60, seekable: ranges(), readyState: 4, closest: () => null, ...overrides });

test('VOD seeks exactly ten seconds, clamping at both ends', () => {
  assert.equal(seekTarget(video(), -10), 10);
  assert.equal(seekTarget(video(), 10), 30);
  assert.equal(seekTarget(video({ currentTime: 3 }), -10), 0);
  assert.equal(seekTarget(video({ currentTime: 57 }), 10), 60);
});
test('live seeks stay inside the DVR window and avoid timeline gaps', () => {
  const source = video({ duration: Infinity, currentTime: 110, seekable: ranges([100, 130], [150, 200]) });
  assert.equal(seekTarget(source, -20), 100);
  assert.equal(seekTarget(source, 10), 120);
  assert.equal(seekTarget(source, 25), 130);
  assert.equal(seekTarget(source, 35), 150);
  assert.equal(seekTarget(source, 100), 200);
});
test('unseekable or invalid timelines have no target', () => {
  assert.equal(seekTarget(video({ duration: Infinity }), 10), null);
  assert.equal(seekTarget(video({ duration: NaN }), 10), null);
  assert.equal(seekTarget(video({ currentTime: NaN }), 10), null);
  assert.equal(seekTarget(video(), NaN), null);
});
test('skip writes the real source time and refuses ads', () => {
  const source = video();
  skip(source, 10);
  assert.equal(source.currentTime, 30);
  source.closest = () => ({ classList: { contains: () => true } });
  skip(source, -10);
  assert.equal(source.currentTime, 30);
});
test('toggle reads real source state and surfaces rejected play promises', async () => {
  let plays = 0;
  let pauses = 0;
  const source = { paused: true, ended: false, play: async () => { plays++; }, pause: () => { pauses++; } };
  await togglePlayback(source);
  source.paused = false;
  await togglePlayback(source);
  source.ended = true;
  await togglePlayback(source);
  assert.equal(plays, 2);
  assert.equal(pauses, 1);
  source.play = async () => { throw new Error('blocked'); };
  await assert.rejects(togglePlayback(source), /blocked/);
});
test('time labels handle long videos and unknown live duration', () => {
  assert.equal(formatTime(65.9), '1:05');
  assert.equal(formatTime(3723), '1:02:03');
  assert.equal(formatTime(Infinity), '0:00');
});

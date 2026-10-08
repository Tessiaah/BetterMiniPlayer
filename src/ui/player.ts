import styles from './player.css';
import { canSeek, formatTime, isAdvertisement, skip, togglePlayback } from '../playback';
import { errorMessage } from '../types';
import { createIcon } from './icons';

export interface PlayerView {
  video: HTMLVideoElement;
  still: HTMLCanvasElement;
  refresh(): void;
  dispose(): void;
}

export function createPlayer(pip: Window, source: HTMLVideoElement, close: () => void): PlayerView {
  const doc = pip.document;
  doc.title = 'Better Mini Player';
  doc.documentElement.lang = 'en';
  const style = doc.createElement('style');
  style.textContent = styles;
  doc.head.append(style);
  const root = doc.createElement('main');
  root.className = 'player';
  root.setAttribute('aria-label', 'YouTube mini-player');
  // The PiP document inherits YouTube's Trusted Types CSP. Build nodes directly.
  const element = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent: HTMLElement): HTMLElementTagNameMap[K] => {
    const node = doc.createElement(tag);
    node.className = className;
    parent.append(node);
    return node;
  };
  const video = element('video', 'video', root);
  video.muted = true;
  video.playsInline = true;
  video.setAttribute('aria-hidden', 'true');
  const still = element('canvas', 'still', root);
  still.setAttribute('aria-hidden', 'true');
  const overlay = element('div', 'overlay', root);
  const top = element('div', 'top', overlay);
  const title = element('p', 'title', top);
  const button = (parent: HTMLElement, className: string, label: string, hint: string, icon: Parameters<typeof createIcon>[1]): HTMLButtonElement => {
    const node = element('button', `icon-button ${className}`, parent);
    node.type = 'button';
    node.setAttribute('aria-label', label);
    node.title = hint;
    node.append(createIcon(doc, icon));
    return node;
  };
  const closeButton = button(top, 'close', 'Close mini-player', 'Close (Escape)', 'close');
  const transport = element('div', 'transport', overlay);
  transport.setAttribute('role', 'group');
  transport.setAttribute('aria-label', 'Playback controls');
  const back = button(transport, 'backward', 'Skip backward 10 seconds', 'Back 10 seconds (Left arrow)', 'backward');
  const toggle = button(transport, 'toggle', 'Pause', 'Play / Pause (Space)', 'pause');
  const forward = button(transport, 'forward', 'Skip forward 10 seconds', 'Forward 10 seconds (Right arrow)', 'forward');
  const bottom = element('div', 'bottom', overlay);
  const status = element('span', 'status', bottom);
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const time = element('span', 'time', bottom);
  const feedback = element('p', 'feedback', root);
  feedback.setAttribute('role', 'status');
  feedback.hidden = true;
  doc.body.replaceChildren(root);
  const abort = new AbortController();
  const options = { signal: abort.signal };
  let idleTimer = 0;
  let feedbackTimer = 0;
  let playbackError = '';
  let pointerInside = root.matches(':hover');
  let keyboardInteracting = false;

  const hideControls = (): void => {
    pip.clearTimeout(idleTimer);
    pip.clearTimeout(feedbackTimer);
    root.dataset.idle = 'true';
    feedback.hidden = true;
    keyboardInteracting = false;
  };

  const showControls = (): void => {
    if (!pointerInside && !keyboardInteracting) return;
    root.dataset.idle = 'false';
    pip.clearTimeout(idleTimer);
    if (!source.paused && !source.ended && !keyboardInteracting) idleTimer = pip.setTimeout(() => {
      root.dataset.idle = 'true';
    }, 2200);
  };
  const refresh = (): void => {
    const paused = source.paused || source.ended;
    const label = paused ? 'Play' : 'Pause';
    if (toggle.getAttribute('aria-label') !== label) {
      toggle.setAttribute('aria-label', label);
      toggle.replaceChildren(createIcon(doc, paused ? 'play' : 'pause'));
    }
    back.disabled = forward.disabled = !canSeek(source);
    title.textContent = source.ownerDocument.querySelector('h1.ytd-watch-metadata yt-formatted-string')?.textContent?.trim()
      || source.ownerDocument.title.replace(/ - YouTube$/, '');
    time.textContent = Number.isFinite(source.duration)
      ? `${formatTime(source.currentTime)} / ${formatTime(source.duration)}` : `${formatTime(source.currentTime)} · LIVE`;
    status.textContent = playbackError || (isAdvertisement(source) ? 'Advertisement · seeking unavailable' : source.ended ? 'Ended' : paused ? 'Paused' : source.readyState < 3 ? 'Buffering…' : '');
    if (paused) pip.clearTimeout(idleTimer);
  };
  const play = async (): Promise<void> => {
    playbackError = '';
    try { await togglePlayback(source); }
    catch (error) {
      // A second click can pause while play() is still waiting for data.
      // That intentionally rejects the first request with AbortError.
      if (!(error && typeof error === 'object' && 'name' in error && error.name === 'AbortError')) playbackError = errorMessage(error);
    }
    finally { refresh(); showControls(); }
  };
  const seek = (seconds: number): void => {
    if (!canSeek(source)) return;
    try {
      skip(source, seconds);
      feedback.textContent = seconds < 0 ? '−10 seconds' : '+10 seconds';
      feedback.hidden = false;
      pip.clearTimeout(feedbackTimer);
      feedbackTimer = pip.setTimeout(() => { feedback.hidden = true; }, 700);
      playbackError = '';
    } catch (error) { playbackError = errorMessage(error); }
    refresh();
    showControls();
  };
  toggle.addEventListener('click', () => { void play(); }, options);
  back.addEventListener('click', () => { seek(-10); }, options);
  forward.addEventListener('click', () => { seek(10); }, options);
  closeButton.addEventListener('click', close, options);
  video.addEventListener('click', () => { void play(); }, options);
  still.addEventListener('click', () => { void play(); }, options);
  const pointerActivity = (): void => {
    pointerInside = true;
    keyboardInteracting = false;
    showControls();
  };
  root.addEventListener('pointerenter', pointerActivity, options);
  root.addEventListener('pointermove', pointerActivity, options);
  root.addEventListener('pointerdown', pointerActivity, options);
  root.addEventListener('pointerleave', () => {
    pointerInside = false;
    hideControls();
  }, options);
  pip.addEventListener('blur', () => {
    pointerInside = false;
    hideControls();
  }, options);
  root.addEventListener('focusin', () => {
    if (doc.activeElement?.matches(':focus-visible')) {
      keyboardInteracting = true;
      showControls();
    }
  }, options);
  doc.addEventListener('keydown', (event) => {
    if (!event.altKey && !event.ctrlKey && !event.metaKey) {
      keyboardInteracting = true;
      showControls();
    }
    // Let focused buttons handle Enter/Space themselves, avoiding a double toggle.
    if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
    if ((event.code === 'Space' || event.code === 'Enter') && (event.target as Element | null)?.closest('button')) return;
    if (event.code === 'Space' || event.code === 'KeyK') { event.preventDefault(); void play(); }
    else if (event.code === 'ArrowLeft' || event.code === 'KeyJ') { event.preventDefault(); seek(-10); }
    else if (event.code === 'ArrowRight' || event.code === 'KeyL') { event.preventDefault(); seek(10); }
    else if (event.code === 'Escape') { event.preventDefault(); close(); }
  }, options);
  for (const event of ['play', 'pause', 'ended', 'timeupdate', 'durationchange', 'loadedmetadata', 'waiting', 'playing', 'seeked']) {
    source.addEventListener(event, refresh, options);
  }
  root.dataset.idle = 'true';
  refresh();
  showControls();
  return { video, still, refresh, dispose: () => {
    abort.abort();
    pip.clearTimeout(idleTimer);
    pip.clearTimeout(feedbackTimer);
    root.remove();
    style.remove();
  } };
}

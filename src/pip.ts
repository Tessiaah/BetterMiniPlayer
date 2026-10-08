import { findVideo } from './playback';
import { VideoMirror } from './mirror';
import { createPlayer, type PlayerView } from './ui/player';
import { errorMessage, type DocumentPip, type ToggleResult } from './types';

export function notify(message: string): void {
  document.getElementById('better-mini-player-notice')?.remove();
  const host = document.createElement('div');
  host.id = 'better-mini-player-notice';
  host.style.cssText = 'position:fixed;right:24px;bottom:24px;z-index:2147483647;max-width:380px;';
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = ':host{all:initial}p{margin:0;padding:16px 20px;border:1px solid #ffffff25;border-radius:14px;background:#171b23;color:#f5f7fa;font:14px/1.5 system-ui;box-shadow:0 8px 32px #0005}';
  const text = document.createElement('p');
  text.setAttribute('role', 'status');
  text.textContent = message;
  shadow.append(style, text);
  document.documentElement.append(host);
  window.setTimeout(() => { host.remove(); }, 8000);
}

export class PipController {
  private session: { window: Window; close: () => void } | undefined;
  private opening = false;

  async toggle(): Promise<ToggleResult> {
    if (this.session) { this.session.close(); return { ok: true, state: 'closed' }; }
    if (this.opening) return { ok: false, message: 'The mini-player is opening. Please wait a moment.' };
    let pipWindow: Window | undefined;
    let disposeSession: (() => void) | undefined;
    this.opening = true;
    try {
      const api = (window as Window & { documentPictureInPicture?: DocumentPip }).documentPictureInPicture;
      if (!api) throw new Error('Document Picture-in-Picture is unavailable. Update your desktop browser and enable Picture-in-Picture in its settings.');
      const source = findVideo(document);
      if (!source) throw new Error('Start a YouTube video, wait for it to load, then click the extension icon.');
      if (document.pictureInPictureElement) throw new Error('Close the browser’s existing Picture-in-Picture window, then click this icon again.');
      const sourceUrl = source.currentSrc;
      const pageUrl = location.href;
      const aspect = source.videoWidth / source.videoHeight || 16 / 9;
      const height = Math.round(Math.min(480, Math.max(240, 480 / aspect)));
      const width = Math.round(Math.min(640, Math.max(240, height * aspect)));
      // This must precede asynchronous setup to retain transient user activation.
      pipWindow = await api.requestWindow({ width, height });
      if (!source.isConnected || source.currentSrc !== sourceUrl || location.href !== pageUrl) {
        throw new Error('The video changed while opening. Click the extension icon again.');
      }
      const pip = pipWindow;
      let disposed = false;
      let mirror: VideoMirror | undefined;
      let view: PlayerView | undefined;
      let monitor = 0;
      const abort = new AbortController();
      const cleanup = (): void => {
        if (disposed) return;
        disposed = true;
        abort.abort();
        pip.clearInterval(monitor);
        mirror?.dispose();
        view?.dispose();
        if (this.session?.window === pip) this.session = undefined;
      };
      const close = (): void => { cleanup(); if (!pip.closed) pip.close(); };
      disposeSession = close;
      const fail = (error: unknown): void => { close(); notify(errorMessage(error)); };
      pip.addEventListener('pagehide', cleanup, { once: true, signal: abort.signal });
      window.addEventListener('pagehide', close, { once: true, signal: abort.signal });
      document.addEventListener('yt-navigate-start', close, { signal: abort.signal });
      source.addEventListener('emptied', close, { signal: abort.signal });
      source.addEventListener('error', () => { fail(new Error('YouTube could not play this video. Return to the tab to retry.')); }, { signal: abort.signal });
      view = createPlayer(pip, source, close);
      mirror = new VideoMirror(source, view.video, view.still, fail);
      this.session = { window: pip, close };
      // Use the visible PiP document's timer; no permanent observers/content scripts.
      monitor = pip.setInterval(() => {
        const candidate = findVideo(document);
        // A seek/network stall can temporarily lower readyState. A missing
        // loaded candidate alone does not mean YouTube destroyed the source.
        if (pip.closed || !source.isConnected || source.currentSrc !== sourceUrl || location.href !== pageUrl || (candidate !== null && candidate !== source)) {
          close();
          return;
        }
        view?.refresh();
      }, 500);
      return { ok: true, state: 'open' };
    } catch (error) {
      disposeSession?.();
      if (pipWindow && !pipWindow.closed) pipWindow.close();
      const message = errorMessage(error);
      notify(message);
      return { ok: false, message };
    } finally { this.opening = false; }
  }
}

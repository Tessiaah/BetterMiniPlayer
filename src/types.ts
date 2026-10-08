export interface DocumentPip {
  readonly window: Window | null;
  requestWindow(options: { width: number; height: number }): Promise<Window>;
}

export type CaptureVideo = HTMLVideoElement & { captureStream?: () => MediaStream };
export type ToggleResult = { ok: true; state: 'open' | 'closed' } | { ok: false; message: string };

export function errorMessage(error: unknown): string {
  // Exceptions can come from the PiP window's realm, where instanceof fails.
  const detail = error && typeof error === 'object' ? error as { name?: unknown; message?: unknown } : undefined;
  if (detail?.name === 'NotAllowedError') {
    return 'The browser blocked Picture-in-Picture. Click the extension icon again, or allow Picture-in-Picture in your browser settings.';
  }
  if (detail?.name === 'SecurityError') {
    return 'This video cannot be mirrored because of media security restrictions. Try a regular, non-protected YouTube video.';
  }
  return typeof detail?.message === 'string' ? detail.message : 'Could not open the mini-player. Reload the YouTube tab and try again.';
}

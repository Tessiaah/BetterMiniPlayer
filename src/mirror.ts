import type { CaptureVideo } from './types';

/** Only the source plays media/audio. This video consumes its rendered frames. */
export class VideoMirror {
  private readonly capture: MediaStream;
  private readonly tracks = new Set<MediaStreamTrack>();
  private readonly abort = new AbortController();
  private frameCallback: number | undefined;
  private disposed = false;

  constructor(
    private readonly source: CaptureVideo,
    private readonly output: HTMLVideoElement,
    private readonly still: HTMLCanvasElement,
    private readonly onError: (error: unknown) => void,
  ) {
    if (source.mediaKeys) throw new Error('Protected video cannot be mirrored. Try a regular YouTube video.');
    if (!source.captureStream) throw new Error('Video mirroring is unavailable in this browser. Update Brave, Chrome, or Edge.');
    // Opening/seeking while paused must not resume the original.
    this.paintStill();
    this.capture = source.captureStream();
    this.output.muted = true;
    this.output.playsInline = true;
    const options = { signal: this.abort.signal };
    this.capture.addEventListener('addtrack', this.refreshTracks, options);
    this.capture.addEventListener('removetrack', this.refreshTracks, options);
    for (const event of ['pause', 'seeked', 'loadeddata', 'resize', 'ended', 'playing']) {
      source.addEventListener(event, this.updateStill, options);
    }
    this.refreshTracks();
    this.observeFrame();
  }

  private readonly refreshTracks = (): void => {
    if (this.disposed) return;
    for (const track of this.capture.getTracks()) {
      this.tracks.add(track);
      // Never route captured audio to a second player, even briefly.
      if (track.kind === 'audio') track.stop();
    }
    const live = this.capture.getVideoTracks().filter((track) => track.readyState === 'live');
    const previous = (this.output.srcObject as MediaStream | null)?.getVideoTracks() ?? [];
    if (live.length === previous.length && live.every((track, i) => track === previous[i])) return;
    this.output.srcObject = new MediaStream(live);
    if (live.length > 0) void this.output.play().catch((error: unknown) => {
      if (!this.disposed && !(error instanceof DOMException && error.name === 'AbortError')) this.onError(error);
    });
  };

  private paintStill(): void {
    if (this.source.readyState < 2) return;
    const scale = Math.min(1, 1280 / this.source.videoWidth);
    this.still.width = Math.max(1, Math.round(this.source.videoWidth * scale));
    this.still.height = Math.max(1, Math.round(this.source.videoHeight * scale));
    const context = this.still.getContext('2d');
    if (!context) throw new Error('Could not display the video frame.');
    context.drawImage(this.source, 0, 0, this.still.width, this.still.height);
    // Fail visibly for tainted media rather than opening a black player.
    context.getImageData(0, 0, 1, 1);
  }

  private readonly updateStill = (): void => {
    if (this.disposed) return;
    try {
      if (this.source.paused || this.source.ended) this.paintStill();
      this.still.hidden = !this.source.paused && !this.source.ended && this.output.readyState >= 2;
      this.refreshTracks();
    } catch (error) { this.onError(error); }
  };

  private observeFrame(): void {
    if (this.disposed) return;
    this.frameCallback = this.output.requestVideoFrameCallback(() => {
      if (this.disposed) return;
      this.updateStill();
      this.observeFrame();
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.abort.abort();
    if (this.frameCallback !== undefined) this.output.cancelVideoFrameCallback(this.frameCallback);
    for (const track of this.tracks) track.stop();
    for (const track of this.capture.getTracks()) track.stop();
    this.output.pause();
    this.output.srcObject = null;
  }
}

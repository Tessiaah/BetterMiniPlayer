/** Compute a seek without crossing gaps in a live video's available timeline. */
export function seekTarget(video: Pick<HTMLVideoElement, 'currentTime' | 'duration' | 'seekable'>, seconds: number): number | null {
  if (!Number.isFinite(video.currentTime) || !Number.isFinite(seconds)) return null;
  const target = Math.max(0, video.currentTime + seconds);
  const ranges = video.seekable;
  if (ranges.length > 0) {
    let nearest = ranges.start(0);
    let distance = Math.abs(target - nearest);
    for (let i = 0; i < ranges.length; i++) {
      const start = ranges.start(i);
      const end = ranges.end(i);
      if (target >= start && target <= end) return target;
      for (const boundary of [start, end]) {
        const nextDistance = Math.abs(target - boundary);
        if (nextDistance < distance) { nearest = boundary; distance = nextDistance; }
      }
    }
    return nearest;
  }
  return Number.isFinite(video.duration) && video.duration > 0 ? Math.min(target, video.duration) : null;
}

export function isAdvertisement(video: HTMLVideoElement): boolean {
  return video.closest('#movie_player')?.classList.contains('ad-showing') ?? false;
}
export function canSeek(video: HTMLVideoElement): boolean {
  return !isAdvertisement(video) && video.readyState >= 1 && seekTarget(video, 0) !== null;
}
export async function togglePlayback(video: HTMLVideoElement): Promise<void> {
  if (video.paused || video.ended) await video.play();
  else video.pause();
}
export function skip(video: HTMLVideoElement, seconds: number): void {
  if (!canSeek(video)) return;
  const target = seekTarget(video, seconds);
  if (target !== null) video.currentTime = target;
}
export function findVideo(doc: Document): HTMLVideoElement | null {
  const candidates = Array.from(doc.querySelectorAll<HTMLVideoElement>('#movie_player video, video.html5-main-video'));
  return candidates.filter((video) => {
    const rect = video.getBoundingClientRect();
    return video.isConnected && video.readyState >= 2 && video.videoWidth > 0 && rect.width > 0 && rect.height > 0;
  }).sort((a, b) => {
    const area = (video: HTMLVideoElement): number => {
      const rect = video.getBoundingClientRect();
      return rect.width * rect.height;
    };
    return area(b) - area(a);
  })[0] ?? null;
}
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total / 60) % 60;
  const remainder = String(total % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${remainder}` : `${minutes}:${remainder}`;
}

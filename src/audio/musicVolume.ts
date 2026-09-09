/** Ten percent above the previous MGS3 baseline, preserving the saved volume preference. */
export function musicPlaybackVolume(volume: number): number {
  return Number.isFinite(volume) ? Math.max(0, Math.min(1, volume * 1.375)) : 0;
}

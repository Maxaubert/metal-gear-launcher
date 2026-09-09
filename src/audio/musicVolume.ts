/** A modest background-music boost, without changing the saved volume preference. */
export function musicPlaybackVolume(volume: number): number {
  return Number.isFinite(volume) ? Math.max(0, Math.min(1, volume * 1.25)) : 0;
}

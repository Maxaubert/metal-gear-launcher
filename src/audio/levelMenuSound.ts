// Recorded effects can be much quieter than mastered music. Level each decoded clip
// once, preserving its waveform and stereo balance while leaving peak headroom.
export function levelMenuSound(channels: readonly Float32Array[]): void {
  let peak = 0;
  for (const channel of channels) for (const sample of channel) peak = Math.max(peak, Math.abs(sample));
  if (!Number.isFinite(peak) || peak < 0.001) return;
  const multiplier = Math.min(16, 0.85 / peak);
  for (const channel of channels) {
    for (let index = 0; index < channel.length; index++) channel[index] = channel[index]! * multiplier;
  }
}

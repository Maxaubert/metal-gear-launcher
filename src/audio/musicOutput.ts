export interface MusicOutput {
  setNormalization(gain?: number): void;
  resume(): Promise<void>;
  dispose(): void;
}

/** Keep source loudness correction separate from the user's volume and menu fades. */
export function createMusicOutput(audio: HTMLAudioElement): MusicOutput {
  audio.crossOrigin = "anonymous";
  const context = new AudioContext();
  const source = context.createMediaElementSource(audio);
  const level = context.createGain();
  source.connect(level);
  level.connect(context.destination);
  return {
    setNormalization(gain = 1) {
      level.gain.value = Number.isFinite(gain) && gain >= 0 ? gain : 1;
    },
    async resume() { if (context.state === "suspended") await context.resume(); },
    dispose() { source.disconnect(); level.disconnect(); void context.close(); },
  };
}

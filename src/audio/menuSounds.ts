import { MENU_SOUNDS, type MenuSound, type MenuSoundData } from "@shared/menuSounds";
export type { MenuSound } from "@shared/menuSounds";

let context: AudioContext | undefined;
let gain: GainNode | undefined;
let loading: Promise<void> | undefined;
let requestedVolume = 0.6;
const buffers = new Map<MenuSound, AudioBuffer>();
const playing = new Map<MenuSound, AudioBufferSourceNode>();
const isRunning = () => context?.state === "running";

async function resumeAudio(): Promise<boolean> {
  if (!context || context.state === "closed") return false;
  if (context.state === "running") return true;
  let timer: number | undefined;
  try {
    await Promise.race([
      context.resume(),
      new Promise<void>(resolve => { timer = window.setTimeout(resolve, 1000); }),
    ]);
    return isRunning();
  } catch { return false; }
  finally { window.clearTimeout(timer); }
}

export function setMenuSoundVolume(volume: number): void {
  requestedVolume = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 0.6;
  if (gain) gain.gain.value = requestedVolume;
}

export function preloadMenuSounds(): Promise<void> {
  loading ??= (async () => {
    const result = await window.hub.getMenuSounds();
    if (!result.ok) return;
    await decodeSounds(result.value);
  })().catch(error => { console.warn("Menu sounds unavailable", error); });
  return loading;
}

async function decodeSounds(data: MenuSoundData): Promise<void> {
  if (!Object.keys(data).length) return;
  context ??= new AudioContext();
  gain ??= context.createGain();
  gain.gain.value = requestedVolume;
  gain.connect(context.destination);
  await Promise.all(MENU_SOUNDS.map(async sound => {
    const encoded = data[sound];
    if (!encoded) return;
    try {
      const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
      const buffer = await context!.decodeAudioData(bytes.buffer);
      if (buffer.duration <= 10) buffers.set(sound, buffer);
    } catch { console.warn(`Menu sound could not be decoded: ${sound}`); }
  }));
  await resumeAudio();
}

export async function playMenuSound(sound: MenuSound): Promise<void> {
  const buffer = buffers.get(sound);
  if (!context || !gain || !buffer) return;
  if (context.state !== "running" && !await resumeAudio()) return;
  // Rapid navigation restarts the tick; it cannot accumulate a wall of overlapping clips.
  playing.get(sound)?.stop();
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(gain);
  playing.set(sound, source);
  await new Promise<void>(resolve => {
    const timer = window.setTimeout(finish, buffer.duration * 1000 + 100);
    function finish() {
      window.clearTimeout(timer);
      if (playing.get(sound) === source) playing.delete(sound);
      source.disconnect();
      resolve();
    }
    source.onended = finish;
    source.start();
  });
}

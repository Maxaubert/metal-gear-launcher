import { MENU_SOUNDS, type MenuSound, type MenuSoundData } from "@shared/menuSounds";
import type { HubState } from "@shared/ipc";
import { levelMenuSound } from "./levelMenuSound";
export type { MenuSound } from "@shared/menuSounds";

let context: AudioContext | undefined;
let gain: GainNode | undefined;
let loading: { key: string; promise: Promise<void> } | undefined;
let generation = 0;
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

/** Artwork/settings refreshes do not invalidate audio, but a different installed library does. */
export function menuSoundSourceKey(state: Pick<HubState, "steamPath" | "games">): string {
  const pathKey = (path: string | undefined | null) => path?.replaceAll("\\", "/").replace(/\/+$/, "").toLowerCase() ?? "";
  const installs = state.games.filter(game => game.installed)
    .map(game => [game.pack.id, pathKey(game.installDir), game.buildId ?? ""])
    .sort((left, right) => left[0]!.localeCompare(right[0]!));
  return JSON.stringify([pathKey(state.steamPath), installs]);
}

export function preloadMenuSounds(key = "default"): Promise<void> {
  if (loading?.key === key) return loading.promise;
  const request = ++generation;
  buffers.clear();
  const promise = (async () => {
    const result = await window.hub.getMenuSounds();
    if (request !== generation) return;
    if (!result.ok) throw new Error(result.error);
    const decoded = await decodeSounds(result.value);
    if (request !== generation) return;
    for (const [sound, buffer] of decoded.buffers) buffers.set(sound, buffer);
    await resumeAudio();
    if (decoded.retryable && request === generation) loading = undefined;
  })().catch(error => {
    if (request === generation) loading = undefined;
    console.warn("Menu sounds unavailable", error);
  });
  loading = { key, promise };
  return promise;
}

async function decodeSounds(data: MenuSoundData): Promise<{ buffers: Map<MenuSound, AudioBuffer>; retryable: boolean }> {
  const decoded = new Map<MenuSound, AudioBuffer>();
  let retryable = false;
  if (!Object.keys(data).length) return { buffers: decoded, retryable };
  if (!context || context.state === "closed") {
    context = new AudioContext();
    gain = context.createGain();
    gain.gain.value = requestedVolume;
    gain.connect(context.destination);
  }
  const decodingContext = context;
  await Promise.all(MENU_SOUNDS.map(async sound => {
    const encoded = data[sound];
    if (!encoded) return;
    try {
      const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
      const buffer = await decodingContext.decodeAudioData(bytes.buffer);
      if (buffer.duration > 0 && buffer.duration <= 10) {
        levelMenuSound(Array.from({ length: buffer.numberOfChannels }, (_, channel) => buffer.getChannelData(channel)));
        decoded.set(sound, buffer);
      } else retryable = true;
    } catch { retryable = true; console.warn(`Menu sound could not be decoded: ${sound}`); }
  }));
  return { buffers: decoded, retryable };
}

export async function playMenuSound(sound: MenuSound): Promise<void> {
  const request = generation;
  const buffer = buffers.get(sound);
  if (!context || !gain || !buffer) return;
  if (context.state !== "running" && !await resumeAudio()) return;
  if (request !== generation) return;
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

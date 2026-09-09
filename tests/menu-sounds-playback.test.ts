/// <reference lib="dom" />
import type {} from "../src/hub/global";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MenuSoundData } from "../shared/menuSounds";
import type { GameState } from "../shared/ipc";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

function decodedBuffer(duration = 0.25, channels = [new Float32Array([0, 0.1, -0.05, 0])]) {
  return {
    duration,
    numberOfChannels: channels.length,
    getChannelData: vi.fn((channel: number) => channels[channel]!),
  };
}

function audioHarness(data: MenuSoundData = { select: btoa("valid"), navigate: btoa("valid") }) {
  const getMenuSounds = vi.fn(async () => ({ ok: true, value: data }));
  const gain = { gain: { value: 1 }, connect: vi.fn() };
  const sources: Array<{ buffer: unknown; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; onended: (() => void) | null }> = [];
  const context = {
    state: "running", destination: {},
    createGain: vi.fn(() => gain),
    decodeAudioData: vi.fn(async (bytes: ArrayBuffer) => { void bytes; return decodedBuffer(); }),
    resume: vi.fn(async () => { context.state = "running"; }),
    createBufferSource: vi.fn(() => {
      const source = { buffer: undefined as unknown, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null as (() => void) | null };
      source.stop.mockImplementation(() => { source.onended?.(); });
      sources.push(source);
      return source;
    }),
  };
  const AudioContext = vi.fn(function () { return context; });
  vi.stubGlobal("AudioContext", AudioContext);
  vi.stubGlobal("window", { hub: { getMenuSounds }, setTimeout, clearTimeout });
  return { getMenuSounds, gain, context, sources, AudioContext };
}

describe("preloaded menu sound playback", () => {
  beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("shares one preload and waits for decoding before startup can finish", async () => {
    const harness = audioHarness({ select: btoa("valid") });
    harness.context.state = "suspended";
    const decoding = deferred<ReturnType<typeof decodedBuffer>>();
    harness.context.decodeAudioData.mockReturnValue(decoding.promise);
    const sounds = await import("../src/audio/menuSounds");
    const first = sounds.preloadMenuSounds();
    expect(sounds.preloadMenuSounds()).toBe(first);
    let loaded = false;
    void first.then(() => { loaded = true; });
    await Promise.resolve();
    expect(loaded).toBe(false);
    decoding.resolve(decodedBuffer());
    await first;
    expect(loaded).toBe(true);
    expect(harness.getMenuSounds).toHaveBeenCalledTimes(1);
    expect(harness.context.resume).toHaveBeenCalledOnce();
  });

  it("starts each replay immediately from decoded memory without further IPC or decoding", async () => {
    const harness = audioHarness();
    const sounds = await import("../src/audio/menuSounds");
    await sounds.preloadMenuSounds();
    const decoded = harness.context.decodeAudioData.mock.calls.length;
    const first = sounds.playMenuSound("navigate");
    expect(harness.sources[0]!.start).toHaveBeenCalledOnce();
    const second = sounds.playMenuSound("navigate");
    expect(harness.sources[0]!.stop).toHaveBeenCalledOnce();
    expect(harness.sources[1]!.start).toHaveBeenCalledOnce();
    harness.sources[1]!.onended?.();
    await Promise.all([first, second]);
    expect(harness.getMenuSounds).toHaveBeenCalledTimes(1);
    expect(harness.context.decodeAudioData).toHaveBeenCalledTimes(decoded);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("plays the leveled quiet stereo buffer at the saved master volume", async () => {
    const harness = audioHarness({ navigate: btoa("quiet recording") });
    const left = new Float32Array([0, 0.053, -0.106, 0]);
    const right = new Float32Array([0, 0.0265, -0.053, 0]);
    const buffer = decodedBuffer(0.25, [left, right]);
    harness.context.decodeAudioData.mockResolvedValue(buffer);
    const sounds = await import("../src/audio/menuSounds");
    sounds.setMenuSoundVolume(0.2);
    await sounds.preloadMenuSounds();
    expect(left[2]).toBeCloseTo(-0.85);
    expect(right[2]).toBeCloseTo(-0.425);
    const playing = sounds.playMenuSound("navigate");
    expect(harness.sources[0]!.buffer).toBe(buffer);
    expect(harness.sources[0]!.connect).toHaveBeenCalledWith(harness.gain);
    expect(harness.gain.gain.value).toBe(0.2);
    expect(harness.sources[0]!.start).toHaveBeenCalledOnce();
    harness.sources[0]!.onended?.();
    await playing;
  });

  it("does not repeatedly amplify a gain-capped clip during navigation replay", async () => {
    const harness = audioHarness({ navigate: btoa("very quiet recording") });
    const channel = new Float32Array([0, 0.002, -0.003, 0]);
    const buffer = decodedBuffer(0.25, [channel]);
    harness.context.decodeAudioData.mockResolvedValue(buffer);
    const sounds = await import("../src/audio/menuSounds");
    await sounds.preloadMenuSounds();
    const leveled = channel.slice();
    expect(channel[2]).toBeCloseTo(-0.048);
    const first = sounds.playMenuSound("navigate");
    const second = sounds.playMenuSound("navigate");
    await sounds.preloadMenuSounds();
    expect(channel).toEqual(leveled);
    expect(buffer.getChannelData).toHaveBeenCalledTimes(1);
    expect(harness.sources[1]!.buffer).toBe(buffer);
    harness.sources[1]!.onended?.();
    await Promise.all([first, second]);
  });

  it("keeps the completion promise pending until the confirmation sound ends", async () => {
    const harness = audioHarness();
    const sounds = await import("../src/audio/menuSounds");
    await sounds.preloadMenuSounds();
    const quit = vi.fn();
    const completion = sounds.playMenuSound("select").then(quit);
    await Promise.resolve();
    expect(quit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(quit).not.toHaveBeenCalled();
    harness.sources[0]!.onended?.();
    await completion;
    expect(quit).toHaveBeenCalledOnce();
    expect(harness.sources[0]!.disconnect).toHaveBeenCalledOnce();
  });

  it("bounds completion if a device never delivers the ended event", async () => {
    const harness = audioHarness();
    const sounds = await import("../src/audio/menuSounds");
    await sounds.preloadMenuSounds();
    const completed = vi.fn();
    const playing = sounds.playMenuSound("select").then(completed);
    await vi.advanceTimersByTimeAsync(349);
    expect(completed).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await playing;
    expect(completed).toHaveBeenCalledOnce();
    expect(harness.sources[0]!.disconnect).toHaveBeenCalledOnce();
  });

  it("does not create audio hardware for missing optional sounds", async () => {
    const harness = audioHarness({});
    const sounds = await import("../src/audio/menuSounds");
    await sounds.preloadMenuSounds();
    await sounds.playMenuSound("select");
    expect(harness.AudioContext).not.toHaveBeenCalled();
  });

  it("isolates corrupt and overly long clips so valid actions still play", async () => {
    const harness = audioHarness({ navigate: btoa("corrupt"), select: btoa("long"), back: btoa("valid") });
    harness.context.decodeAudioData.mockImplementation(async bytes => {
      const value = new TextDecoder().decode(bytes);
      if (value === "corrupt") throw new Error("Invalid WAV");
      return decodedBuffer(value === "long" ? 11 : 0.25);
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const sounds = await import("../src/audio/menuSounds");
    await sounds.preloadMenuSounds();
    await sounds.playMenuSound("navigate");
    await sounds.playMenuSound("select");
    expect(harness.sources).toHaveLength(0);
    const valid = sounds.playMenuSound("back");
    expect(harness.sources[0]!.start).toHaveBeenCalledOnce();
    harness.sources[0]!.onended?.();
    await valid;
  });

  it("makes an IPC failure nonfatal for preload and playback", async () => {
    const harness = audioHarness();
    harness.getMenuSounds.mockRejectedValue(new Error("Unavailable"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const sounds = await import("../src/audio/menuSounds");
    await expect(sounds.preloadMenuSounds()).resolves.toBeUndefined();
    await expect(sounds.playMenuSound("select")).resolves.toBeUndefined();
    expect(harness.AudioContext).not.toHaveBeenCalled();
  });

  it("applies a saved volume set before preload creates the audio gain", async () => {
    const harness = audioHarness();
    const sounds = await import("../src/audio/menuSounds");
    sounds.setMenuSoundVolume(0.2);
    await sounds.preloadMenuSounds();
    expect(harness.gain.gain.value).toBe(0.2);
    sounds.setMenuSoundVolume(2);
    expect(harness.gain.gain.value).toBe(1);
    sounds.setMenuSoundVolume(-1);
    expect(harness.gain.gain.value).toBe(0);
  });

  it("lets startup finish when the audio device never resumes", async () => {
    const harness = audioHarness();
    harness.context.state = "suspended";
    harness.context.resume.mockReturnValue(new Promise(() => {}));
    const sounds = await import("../src/audio/menuSounds");
    const loaded = vi.fn();
    const preload = sounds.preloadMenuSounds().then(loaded);
    await vi.advanceTimersByTimeAsync(2000);
    expect(loaded).toHaveBeenCalledOnce();
    await preload;
  });

  it("lets an action complete if the audio device stalls after preload", async () => {
    const harness = audioHarness();
    const sounds = await import("../src/audio/menuSounds");
    await sounds.preloadMenuSounds();
    harness.context.state = "suspended";
    harness.context.resume.mockReturnValue(new Promise(() => {}));
    const quit = vi.fn();
    const completion = sounds.playMenuSound("select").then(quit);
    await vi.advanceTimersByTimeAsync(2000);
    expect(quit).toHaveBeenCalledOnce();
    expect(harness.sources).toHaveLength(0);
    await completion;
  });

  it("keys refreshes by installed library identity, not artwork or settings refreshes", async () => {
    const { menuSoundSourceKey } = await import("../src/audio/menuSounds");
    const game = { pack: { id: "mgs1" }, installed: true, installDir: "D:\\SteamLibrary\\MGS1", buildId: "100", assetUrls: {}, stale: false } as GameState;
    const state = { steamPath: "C:\\Steam\\", games: [game] };
    const key = menuSoundSourceKey(state);
    expect(menuSoundSourceKey({ steamPath: "c:/steam", games: [{ ...game, stale: true, assetUrls: { mainVisual: "new-art" } }] })).toBe(key);
    expect(menuSoundSourceKey({ ...state, games: [{ ...game, buildId: "101" }] })).not.toBe(key);
    expect(menuSoundSourceKey({ ...state, games: [{ ...game, installDir: "E:/SteamLibrary/MGS1" }] })).not.toBe(key);
    expect(menuSoundSourceKey({ ...state, games: [{ ...game, installed: false }] })).not.toBe(key);
    expect(menuSoundSourceKey({ ...state, steamPath: "D:/Steam" })).not.toBe(key);
  });

  it("refreshes an empty no-Steam preload when a library becomes available", async () => {
    const harness = audioHarness({});
    const sounds = await import("../src/audio/menuSounds");
    const empty = sounds.preloadMenuSounds("no-steam");
    await empty;
    expect(sounds.preloadMenuSounds("no-steam")).toBe(empty);
    expect(harness.getMenuSounds).toHaveBeenCalledOnce();
    harness.getMenuSounds.mockResolvedValue({ ok: true, value: { navigate: btoa("found") } });
    const found = sounds.preloadMenuSounds("steam-A");
    expect(sounds.preloadMenuSounds("steam-A")).toBe(found);
    await found;
    const playing = sounds.playMenuSound("navigate");
    expect(harness.sources[0]!.start).toHaveBeenCalledOnce();
    harness.sources[0]!.onended?.(); await playing;
    expect(harness.getMenuSounds).toHaveBeenCalledTimes(2);
  });

  it("publishes only the newest decoded bank and connects the shared gain once", async () => {
    const harness = audioHarness();
    const oldDecode = deferred<ReturnType<typeof decodedBuffer>>();
    const newest = decodedBuffer();
    harness.getMenuSounds.mockResolvedValueOnce({ ok: true, value: { select: btoa("old"), back: btoa("old") } })
      .mockResolvedValueOnce({ ok: true, value: { select: btoa("new") } });
    harness.context.decodeAudioData.mockImplementation(bytes => new TextDecoder().decode(bytes) === "old" ? oldDecode.promise : Promise.resolve(newest));
    const sounds = await import("../src/audio/menuSounds");
    sounds.setMenuSoundVolume(.3);
    const old = sounds.preloadMenuSounds("steam-A");
    await Promise.resolve();
    expect(harness.context.decodeAudioData).toHaveBeenCalledTimes(2);
    sounds.setMenuSoundVolume(.7);
    const fresh = sounds.preloadMenuSounds("steam-B");
    await fresh;
    oldDecode.resolve(decodedBuffer()); await old;
    expect(sounds.preloadMenuSounds("steam-B")).toBe(fresh);
    const playing = sounds.playMenuSound("select");
    expect(harness.sources[0]!.buffer).toBe(newest);
    harness.sources[0]!.onended?.(); await playing;
    await sounds.playMenuSound("back");
    expect(harness.sources).toHaveLength(1);
    expect(harness.context.createGain).toHaveBeenCalledOnce();
    expect(harness.gain.connect).toHaveBeenCalledOnce();
    expect(harness.gain.gain.value).toBe(.7);
  });

  it("discards a stale IPC result before it starts any decoding", async () => {
    const harness = audioHarness();
    const oldResponse = deferred<{ ok: boolean; value: MenuSoundData }>();
    harness.getMenuSounds.mockReturnValueOnce(oldResponse.promise)
      .mockResolvedValueOnce({ ok: true, value: { navigate: btoa("fresh") } });
    const sounds = await import("../src/audio/menuSounds");
    const old = sounds.preloadMenuSounds("steam-A");
    await sounds.preloadMenuSounds("steam-B");
    oldResponse.resolve({ ok: true, value: { back: btoa("obsolete") } });
    await old;
    expect(harness.context.decodeAudioData).toHaveBeenCalledOnce();
    await sounds.playMenuSound("back");
    expect(harness.sources).toHaveLength(0);
  });

  it("allows a failed IPC or decode to retry for the same library", async () => {
    const harness = audioHarness({ select: btoa("valid") });
    harness.getMenuSounds.mockRejectedValueOnce(new Error("Library unavailable"));
    harness.context.decodeAudioData.mockRejectedValueOnce(new Error("Incomplete file"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const sounds = await import("../src/audio/menuSounds");
    await sounds.preloadMenuSounds("steam-A");
    await sounds.preloadMenuSounds("steam-A");
    const completed = sounds.preloadMenuSounds("steam-A");
    await completed;
    expect(sounds.preloadMenuSounds("steam-A")).toBe(completed);
    expect(harness.getMenuSounds).toHaveBeenCalledTimes(3);
    expect(harness.gain.connect).toHaveBeenCalledOnce();
    const playing = sounds.playMenuSound("select");
    expect(harness.sources[0]!.start).toHaveBeenCalledOnce();
    harness.sources[0]!.onended?.(); await playing;
  });
});


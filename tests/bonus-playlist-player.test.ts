import { describe, expect, it, vi } from "vitest";
import { BonusPlaylistPlayer } from "../src/bonus/bonusPlaylistPlayer";

class FakeAudio extends EventTarget {
  src = "";
  paused = true;
  currentTime = 0;
  volume = 1;
  loop = true;
  preload = "";
  play = vi.fn(async () => { this.paused = false; });
  pause = vi.fn(() => { this.paused = true; });
  load = vi.fn(() => { this.currentTime = 0; });
  removeAttribute = vi.fn(() => { this.src = ""; });
}
const playlist = ["one", "two", "three"].map(id => ({ id, title: id, url: `hub-music://${id}` }));
function setup() {
  const audio = new FakeAudio();
  const changed = vi.fn();
  const output = { setNormalization: vi.fn(), resume: vi.fn(async () => {}), dispose: vi.fn() };
  const player = new BonusPlaylistPlayer(audio as unknown as HTMLAudioElement, changed, output);
  player.setPlaylist(playlist);
  return { audio, changed, player, output };
}
const settle = async () => { for (let index = 0; index < 8; index++) await Promise.resolve(); };

describe("bonus sequential background transport", () => {
  it("advances through the playlist and wraps, rather than repeating the first song", async () => {
    const { audio, player } = setup();
    expect(audio.play).not.toHaveBeenCalled();
    player.setPlayback(true, false, 0.6);
    await settle();
    expect(audio.loop).toBe(false);
    expect(audio.volume).toBeCloseTo(0.825);
    for (const expected of ["two", "three", "one"]) {
      audio.dispatchEvent(new Event("ended"));
      await settle();
      expect(audio.src).toBe(`hub-music://${expected}`);
    }
    player.dispose();
  });

  it("preserves position while bonus media plays, when leaving bonus, and on unchanged refresh", async () => {
    const { audio, player } = setup();
    player.setPlayback(true, false, 1);
    await settle();
    audio.currentTime = 87;
    player.setPlayback(true, true, 0.5);
    expect(audio.paused).toBe(true);
    player.setPlaylist([...playlist]);
    player.setPlayback(true, false, 0.5);
    await settle();
    expect(audio.currentTime).toBe(87);
    player.setPlayback(false, false, 0.5);
    expect(audio.paused).toBe(true);
    player.setPlayback(true, false, 0.5);
    await settle();
    expect(audio.currentTime).toBe(87);
    player.dispose();
  });

  it("skips failed songs and stops after one failed pass without a retry loop", async () => {
    const { audio, player, changed } = setup();
    player.setPlayback(true, false, 1);
    await settle();
    for (let index = 0; index < 3; index++) { audio.dispatchEvent(new Event("error")); await settle(); }
    expect(changed).toHaveBeenLastCalledWith({ currentTrack: playlist[2], unavailable: true });
    expect(audio.paused).toBe(true);
    expect(audio.play).toHaveBeenCalledTimes(3);
    player.setPlayback(false, false, 1);
    player.setPlayback(true, false, 1);
    await settle();
    expect(audio.src).toBe(playlist[0]!.url);
    expect(audio.play).toHaveBeenCalledTimes(4);
    player.dispose();
  });

  it("skips rejected play promises and avoids failed tracks on subsequent cycles", async () => {
    const { audio, player } = setup();
    audio.play.mockRejectedValueOnce(new Error("Decode failed"));
    player.setPlayback(true, false, 1);
    await settle(); await settle();
    expect(audio.src).toBe(playlist[1]!.url);
    audio.dispatchEvent(new Event("ended")); await settle();
    audio.dispatchEvent(new Event("ended")); await settle();
    expect(audio.src).toBe(playlist[1]!.url);
    player.dispose();
  });

  it("does not leak sound when a pending play resolves after suspension or disposal", async () => {
    const { audio, player } = setup();
    let finish!: () => void;
    audio.play.mockImplementationOnce(() => new Promise<void>(resolve => { finish = () => { audio.paused = false; resolve(); }; }));
    player.setPlayback(true, false, 1);
    await settle();
    player.setPlayback(true, true, 1);
    finish(); await settle();
    expect(audio.paused).toBe(true);
    player.dispose();
    audio.dispatchEvent(new Event("ended"));
    expect(audio.src).toBe("");
    expect(audio.play).toHaveBeenCalledTimes(1);
  });

  it("recovers from empty or changed libraries and clamps volume", async () => {
    const { audio, player, changed } = setup();
    player.setPlaylist([]);
    expect(changed).toHaveBeenLastCalledWith({ currentTrack: undefined, unavailable: true });
    player.setPlayback(true, false, 99);
    expect(audio.volume).toBe(1);
    player.setPlaylist(playlist.slice(1)); await settle();
    expect(audio.src).toBe(playlist[1]!.url);
    player.setPlayback(true, false, Number.NaN);
    expect(audio.volume).toBe(0);
    player.dispose();
  });

  it("applies each track's normalization before playback and refreshes metadata without restarting", async () => {
    const { audio, player, output } = setup();
    const tracks = playlist.map((track, index) => ({ ...track, normalizationGain: [0.5, 1.5, 1][index] }));
    player.setPlaylist(tracks);
    audio.play.mockImplementation(async () => {
      expect(output.setNormalization).toHaveBeenLastCalledWith(tracks.find(track => track.url === audio.src)?.normalizationGain);
      audio.paused = false;
    });
    player.setPlayback(true, false, 0.6); await settle();
    audio.dispatchEvent(new Event("ended")); await settle();
    expect(output.setNormalization).toHaveBeenLastCalledWith(1.5);
    audio.currentTime = 42;
    player.setPlaylist(tracks.map(track => ({ ...track, normalizationGain: 0.8 })));
    expect(output.setNormalization).toHaveBeenLastCalledWith(0.8);
    expect(audio.currentTime).toBe(42);
    expect(audio.play).toHaveBeenCalledTimes(2);
    player.dispose();
    expect(output.dispose).toHaveBeenCalledOnce();
  });

  it("does not start stale audio while the output context is resuming", async () => {
    const { audio, player, output } = setup();
    let resume!: () => void;
    output.resume.mockImplementationOnce(() => new Promise<void>(resolve => { resume = resolve; }));
    player.setPlayback(true, false, 0.6);
    player.setPlayback(true, true, 0.6);
    resume(); await settle();
    expect(audio.play).not.toHaveBeenCalled();
    player.dispose();
  });

  it("keeps mute and applies the music boost when volume changes without restarting playback", async () => {
    const { audio, player } = setup();
    player.setPlayback(true, false, 0.6);
    await settle();
    audio.currentTime = 42;
    player.setPlayback(true, false, 0);
    expect(audio.volume).toBe(0);
    player.setPlayback(true, false, 0.4);
    expect(audio.volume).toBeCloseTo(0.55);
    expect(audio.currentTime).toBe(42);
    expect(audio.play).toHaveBeenCalledTimes(1);
    player.dispose();
  });
});

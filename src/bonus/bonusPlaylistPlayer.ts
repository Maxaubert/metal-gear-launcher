import type { BonusPlaylist, BonusPlaylistTrack } from "../../shared/bonusPlaylist";
import { musicPlaybackVolume } from "../audio/musicVolume";

export interface BonusPlaylistState { currentTrack?: BonusPlaylistTrack; unavailable: boolean }

/** One persistent transport shared by bonus selection, menus and paused media playback. */
export class BonusPlaylistPlayer {
  private playlist: BonusPlaylist = [];
  private index = 0;
  private failed = new Set<string>();
  private active = false;
  private suspended = false;
  private disposed = false;
  private generation = 0;
  private pending = false;

  constructor(private audio: HTMLAudioElement, private changed: (state: BonusPlaylistState) => void) {
    audio.loop = false;
    audio.preload = "auto";
    audio.addEventListener("ended", this.ended);
    audio.addEventListener("error", this.error);
  }

  setPlaylist(playlist: BonusPlaylist) {
    if (JSON.stringify(playlist) === JSON.stringify(this.playlist)) return;
    const current = this.playlist[this.index];
    this.playlist = playlist;
    this.failed.clear();
    const preserved = playlist.findIndex(track => track.id === current?.id && track.url === current.url);
    if (preserved >= 0) { this.index = preserved; this.publish(); return; }
    this.index = 0;
    this.load();
  }

  setPlayback(active: boolean, suspended: boolean, volume: number) {
    const reactivate = active && !this.active;
    this.active = active;
    this.suspended = suspended;
    this.audio.volume = musicPlaybackVolume(volume);
    if (!this.shouldPlay()) {
      this.generation++;
      this.pending = false;
      this.audio.pause();
    } else if (reactivate && this.exhausted()) {
      this.failed.clear();
      this.index = 0;
      this.load();
    } else this.play();
  }

  dispose() {
    this.disposed = true;
    this.generation++;
    this.audio.removeEventListener("ended", this.ended);
    this.audio.removeEventListener("error", this.error);
    this.audio.pause();
    this.audio.removeAttribute("src");
    this.audio.load();
  }

  private shouldPlay() { return this.active && !this.suspended && !this.disposed; }
  private exhausted() { return !this.playlist.length || this.playlist.every(track => this.failed.has(track.id)); }
  private publish() { this.changed({ currentTrack: this.playlist[this.index], unavailable: this.exhausted() }); }

  private load() {
    this.generation++;
    this.pending = false;
    this.audio.pause();
    const track = this.playlist[this.index];
    if (track) this.audio.src = track.url;
    else this.audio.removeAttribute("src");
    this.audio.load();
    this.publish();
    this.play();
  }

  private play() {
    if (!this.shouldPlay() || this.exhausted() || this.pending || !this.audio.paused) return;
    const generation = this.generation;
    this.pending = true;
    void this.audio.play().then(() => {
      // A pending browser play promise can finish after suspension or disposal.
      if (!this.shouldPlay()) this.audio.pause();
      if (generation === this.generation) this.pending = false;
    }).catch(error => {
      if (generation !== this.generation || this.disposed) return;
      this.pending = false;
      if (error instanceof Error && (error.name === "AbortError" || error.name === "NotAllowedError")) return;
      this.error();
    });
  }

  private advance() {
    if (!this.playlist.length || this.exhausted()) { this.audio.pause(); this.publish(); return; }
    for (let offset = 1; offset <= this.playlist.length; offset++) {
      const next = (this.index + offset) % this.playlist.length;
      if (!this.failed.has(this.playlist[next]!.id)) { this.index = next; this.load(); return; }
    }
  }

  private ended = () => { if (this.shouldPlay()) this.advance(); };
  private error = () => {
    if (this.disposed) return;
    const track = this.playlist[this.index];
    if (track) this.failed.add(track.id);
    this.generation++;
    this.pending = false;
    this.advance();
  };
}

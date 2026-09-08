import type { Result } from "@shared/ipc";
import type { GameSettings, SettingsChange, SaveSettingsRequest } from "@shared/settings";
import type { MenuMusicSelections } from "@shared/menuMusic";

export type PendingChanges = Record<string, SettingsChange>;
type Snapshot = {
  settings: GameSettings | null;
  changes: PendingChanges;
  initialize: string[];
  musicDraft?: string;
  saving: boolean;
  error: string;
};
type Options = {
  saveNative: (request: SaveSettingsRequest) => Promise<Result<GameSettings>>;
  saveMusic: (id: string) => Promise<Result<MenuMusicSelections>>;
  nativeSaved: (settings: GameSettings) => void;
  musicSaved: (selections: MenuMusicSelections) => void;
  saved?: () => void;
};

/** One revision-aware writer. New edits remain visible while the previous batch is on disk. */
export class SettingsAutosave {
  private state: Snapshot;
  private listeners = new Set<() => void>();
  private timer?: ReturnType<typeof setTimeout>;
  private running?: Promise<boolean>;
  constructor(settings: GameSettings | null, private options: Options, private delay = 180) {
    this.state = { settings, changes: {}, initialize: [], saving: false, error: "" };
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<Snapshot>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  private schedule() {
    clearTimeout(this.timer);
    if (!this.state.error) this.timer = setTimeout(() => { void this.flush(); }, this.delay);
  }
  change(update: (changes: PendingChanges) => PendingChanges) {
    this.update({ changes: update(this.state.changes) });
    this.schedule();
  }
  initialize(id: string) {
    this.update({ initialize: [...new Set([...this.state.initialize, id])] });
    this.schedule();
  }
  selectMusic(id: string) { this.update({ musicDraft: id }); this.schedule(); }
  reset(settings: GameSettings) {
    if (this.running) throw new Error("Wait for the current settings write before changing its source.");
    clearTimeout(this.timer);
    this.update({ settings, changes: {}, initialize: [], musicDraft: undefined, error: "" });
  }
  async retry(): Promise<boolean> { this.update({ error: "" }); return this.flush(); }
  flush(): Promise<boolean> {
    clearTimeout(this.timer);
    if (this.running) return this.running;
    if (this.state.error) return Promise.resolve(false);
    this.running = this.write().finally(() => { this.running = undefined; });
    return this.running;
  }
  private async write(): Promise<boolean> {
    const hadChanges = Boolean(Object.keys(this.state.changes).length || this.state.initialize.length || this.state.musicDraft !== undefined);
    this.update({ saving: true });
    try {
      while (Object.keys(this.state.changes).length || this.state.initialize.length || this.state.musicDraft !== undefined) {
        const batch = this.state;
        if (Object.keys(batch.changes).length || batch.initialize.length) {
          if (!batch.settings) throw new Error("Game settings are unavailable. Use Current Settings to try again.");
          const result = await this.options.saveNative({ gameId: batch.settings.gameId, accountId: batch.settings.accountId,
            revision: batch.settings.revision, changes: Object.values(batch.changes), initializeSectionIds: batch.initialize });
          if (!result.ok) throw new Error(result.error);
          const remaining = { ...this.state.changes };
          for (const [key, value] of Object.entries(batch.changes)) if (remaining[key] === value) delete remaining[key];
          this.options.nativeSaved(result.value);
          this.update({ settings: result.value, changes: remaining, initialize: this.state.initialize.filter(id => !batch.initialize.includes(id)) });
        }
        if (batch.musicDraft !== undefined) {
          const result = await this.options.saveMusic(batch.musicDraft);
          if (!result.ok) throw new Error(result.error);
          this.options.musicSaved(result.value);
          if (this.state.musicDraft === batch.musicDraft) this.update({ musicDraft: undefined });
        }
      }
      if (hadChanges) this.options.saved?.();
      return true;
    } catch (error) {
      this.update({ error: error instanceof Error ? error.message : String(error) });
      return false;
    } finally { this.update({ saving: false }); }
  }
}

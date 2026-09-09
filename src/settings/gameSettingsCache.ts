import type { GameId, Result } from "@shared/ipc";
import type { GameSettings } from "@shared/settings";

type SettingsResult = Result<GameSettings>;
type Reader = (gameId: GameId, accountId?: string) => Promise<SettingsResult>;
const cacheKey = (gameId: GameId, accountId?: string) => `${gameId}\n${accountId ?? ""}`;

/** Session snapshots only. The backend still rereads files and checks revisions on save. */
export class GameSettingsCache {
  private entries = new Map<string, { result: SettingsResult; stamp: number }>();
  private pending = new Map<string, Promise<SettingsResult>>();
  private stamp = 0;

  constructor(private readonly reader: Reader, private readonly timeoutMs = 10000, private readonly preloadTimeoutMs = 60000) {}

  peek(gameId: GameId, accountId?: string): SettingsResult | undefined {
    return this.entries.get(cacheKey(gameId, accountId))?.result;
  }

  private put(key: string, result: SettingsResult, stamp: number) {
    if ((this.entries.get(key)?.stamp ?? -1) <= stamp) this.entries.set(key, { result, stamp });
  }

  read(gameId: GameId, accountId?: string, options: { refresh?: boolean; timeoutMs?: number } = {}): Promise<SettingsResult> {
    const key = cacheKey(gameId, accountId);
    const cached = this.peek(gameId, accountId);
    if (cached && !options.refresh) return Promise.resolve(cached);
    const pending = this.pending.get(key);
    if (pending) return pending;
    const stamp = ++this.stamp;
    let timer: ReturnType<typeof setTimeout>;
    let timedOut = false;
    const read = Promise.resolve().then(() => this.reader(gameId, accountId)).catch((error: unknown): SettingsResult => ({
      ok: false, error: error instanceof Error ? error.message : "Unable to read game settings. Choose Try Again to retry.",
    }));
    const timeout = new Promise<SettingsResult>(resolve => {
      timer = setTimeout(() => {
        timedOut = true;
        resolve({ ok: false, error: "Reading game settings timed out. Choose Try Again to retry." });
      }, options.timeoutMs ?? this.timeoutMs);
    });
    const acceptResult = (result: SettingsResult) => {
      if (!accountId && result.ok && result.value.accountId) {
        const newerAccount = this.entries.get(cacheKey(gameId, result.value.accountId));
        if (newerAccount && newerAccount.stamp > stamp) {
          this.put(key, newerAccount.result, newerAccount.stamp);
          return newerAccount.result;
        }
      }
      this.put(key, result, stamp);
      if (result.ok) {
        if (!accountId && result.value.accountId) this.put(cacheKey(gameId, result.value.accountId), result, stamp);
        const initial = this.peek(gameId);
        if (accountId && initial?.ok && initial.value.accountId === accountId) this.put(cacheKey(gameId), result, stamp);
      }
      return this.peek(gameId, accountId)!;
    };
    const request = Promise.race([read, timeout]).then(result => {
      if (this.pending.get(key) !== request) return this.peek(gameId, accountId)
        ?? { ok: false as const, error: "The game settings source changed. Choose Try Again to retry." };
      this.pending.delete(key);
      return acceptResult(result);
    }).finally(() => clearTimeout(timer));
    this.pending.set(key, request);
    void read.then(result => {
      // A slow disk may finish after the UI deadline. Retain that success, but never
      // overwrite a save, retry or changed installation that superseded this read.
      if (timedOut && result.ok && this.entries.get(key)?.stamp === stamp && !this.pending.has(key)) acceptResult(result);
    });
    return request;
  }

  async preload(gameIds: readonly GameId[]): Promise<void> {
    const results = await Promise.all([...new Set(gameIds)].map(async id => ({
      id, result: await this.read(id, undefined, { refresh: this.peek(id)?.ok === false, timeoutMs: this.preloadTimeoutMs }),
    })));
    const failed = results.filter(item => !item.result.ok);
    if (failed.length) throw new Error(failed.map(({ id, result }) =>
      `${id.toUpperCase()}: ${result.ok ? "" : result.error}`).join("\n"));
  }

  remember(value: GameSettings): void {
    const result: SettingsResult = { ok: true, value };
    const stamp = ++this.stamp;
    const keys = [cacheKey(value.gameId, value.accountId)];
    const initial = this.peek(value.gameId);
    if (!initial?.ok || initial.value.accountId === value.accountId) keys.push(cacheKey(value.gameId));
    for (const key of keys) {
      this.pending.delete(key);
      this.put(key, result, stamp);
    }
  }

  invalidate(gameId: GameId): void {
    const prefix = `${gameId}\n`;
    for (const key of this.entries.keys()) if (key.startsWith(prefix)) this.entries.delete(key);
    for (const key of this.pending.keys()) if (key.startsWith(prefix)) this.pending.delete(key);
  }
}

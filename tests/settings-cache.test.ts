import { afterEach, describe, expect, it, vi } from "vitest";
import type { GameId, Result } from "../shared/ipc";
import type { GameSettings } from "../shared/settings";
import { GameSettingsCache } from "../src/settings/gameSettingsCache";

const A = "76561198000000001", B = "76561198000000002";
const value = (gameId: GameId = "mgs2", revision = "original", accountId: string | undefined = A): GameSettings => ({
  gameId, revision, accountId, accounts: [{ id: A, label: "A" }, { id: B, label: "B" }], sections: [],
});
const ok = (settings: GameSettings): Result<GameSettings> => ({ ok: true, value: settings });
function deferred() {
  let resolve!: (result: Result<GameSettings>) => void;
  const promise = new Promise<Result<GameSettings>>(done => { resolve = done; });
  return { resolve, promise };
}
afterEach(() => vi.useRealTimers());

describe("game settings session cache", () => {
  it("preloads every requested game once and reuses its default-account snapshot", async () => {
    const reader = vi.fn(async (id: GameId) => ok(value(id)));
    const cache = new GameSettingsCache(reader);
    const ids: GameId[] = ["mg12", "mgs1", "mgs2", "mgs3", "mgs4", "mgspw"];
    await Promise.all([cache.preload(ids), cache.preload(ids)]);
    expect(reader).toHaveBeenCalledTimes(6);
    for (const id of ids) {
      expect(cache.peek(id)?.ok).toBe(true);
      expect(await cache.read(id, A)).toBe(cache.peek(id));
    }
    expect(reader).toHaveBeenCalledTimes(6);
  });

  it("caches failed reads until an explicit retry and handles rejected IPC calls", async () => {
    const reader = vi.fn().mockRejectedValueOnce(new Error("Read failed")).mockResolvedValue(ok(value()));
    const cache = new GameSettingsCache(reader);
    await cache.preload(["mgs2"]);
    expect(await cache.read("mgs2")).toEqual({ ok: false, error: "Read failed" });
    expect(reader).toHaveBeenCalledTimes(1);
    expect((await cache.read("mgs2", undefined, { refresh: true })).ok).toBe(true);
    expect(reader).toHaveBeenCalledTimes(2);
  });

  it("bounds a stalled preload and ignores its late response after a retry", async () => {
    vi.useFakeTimers();
    const stalled = deferred();
    const reader = vi.fn().mockReturnValueOnce(stalled.promise).mockResolvedValue(ok(value("mgs2", "retry")));
    const cache = new GameSettingsCache(reader, 100);
    const preload = cache.preload(["mgs2"]);
    await vi.advanceTimersByTimeAsync(101);
    await preload;
    expect(cache.peek("mgs2")).toEqual({ ok: false, error: expect.stringContaining("timed out") });
    await cache.read("mgs2", undefined, { refresh: true });
    stalled.resolve(ok(value("mgs2", "stale")));
    await Promise.resolve();
    expect(cache.peek("mgs2")).toEqual(ok(value("mgs2", "retry")));
  });

  it("deduplicates refreshes and prevents a pending read from replacing a successful save", async () => {
    const refresh = deferred();
    const reader = vi.fn().mockResolvedValueOnce(ok(value())).mockReturnValueOnce(refresh.promise);
    const cache = new GameSettingsCache(reader);
    await cache.read("mgs2");
    const one = cache.read("mgs2", A, { refresh: true });
    const two = cache.read("mgs2", A, { refresh: true });
    expect(one).toBe(two);
    cache.remember(value("mgs2", "saved"));
    refresh.resolve(ok(value("mgs2", "stale")));
    expect(await one).toEqual(ok(value("mgs2", "saved")));
    expect(cache.peek("mgs2")).toEqual(ok(value("mgs2", "saved")));
  });

  it("keeps explicit accounts isolated and does not auto-select one from a multi-account overview", async () => {
    const overview = { ...value(), accountId: undefined };
    const cache = new GameSettingsCache(async (id, account) => ok(account ? value(id, account, account) : overview));
    await cache.preload(["mgs2"]);
    await cache.read("mgs2", A);
    await cache.read("mgs2", B);
    cache.remember(value("mgs2", "saved A", A));
    expect(cache.peek("mgs2")).toEqual(ok(overview));
    expect(cache.peek("mgs2", B)).toEqual(ok(value("mgs2", B, B)));
    expect(cache.peek("mgs2", A)).toEqual(ok(value("mgs2", "saved A", A)));
  });

  it("does not alias an older default preload over a newer explicit-account read", async () => {
    const initial = deferred();
    const reader = vi.fn().mockReturnValueOnce(initial.promise).mockResolvedValue(ok(value("mgs2", "fresh")));
    const cache = new GameSettingsCache(reader);
    const preload = cache.read("mgs2");
    await cache.read("mgs2", A);
    initial.resolve(ok(value("mgs2", "old")));
    expect(await preload).toEqual(ok(value("mgs2", "fresh")));
    expect(cache.peek("mgs2", A)).toEqual(cache.peek("mgs2"));
  });

  it("invalidates every account for a changed installation and discards old in-flight reads", async () => {
    const old = deferred();
    const reader = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValue(ok(value("mgs2", "new install")));
    const cache = new GameSettingsCache(reader);
    const pending = cache.read("mgs2");
    cache.invalidate("mgs2");
    old.resolve(ok(value("mgs2", "old install")));
    expect((await pending).ok).toBe(false);
    expect(cache.peek("mgs2")).toBeUndefined();
    expect(await cache.read("mgs2")).toEqual(ok(value("mgs2", "new install")));
  });
});

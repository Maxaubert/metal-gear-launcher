import { describe, expect, it, vi } from "vitest";
import { SettingsAutosave } from "../src/settings/settingsAutosave";
import type { GameSettings, SaveSettingsRequest } from "../shared/settings";

const settings = (revision = "a".repeat(64), value = 10): GameSettings => ({ gameId: "mgs2", accountId: "76561198000000001",
  accounts: [], revision, sections: [{ id: "launcher", title: "Launcher", kind: "native", status: "ready",
    fields: [{ id: "volume", label: "Volume", category: "Audio", kind: "range", value }] }] });
const change = (queue: SettingsAutosave, value: number) => queue.change(previous => ({ ...previous,
  volume: { sectionId: "launcher", fieldId: "volume", value } }));

describe("settings autosave", () => {
  it("serializes edits made during a write, including a return to the old baseline, using the new revision", async () => {
    let release!: (value: { ok: true; value: GameSettings }) => void;
    const requests: SaveSettingsRequest[] = [];
    const saveNative = vi.fn(async (request: SaveSettingsRequest) => {
      requests.push(request);
      if (requests.length === 1) return new Promise<{ ok: true; value: GameSettings }>(resolve => { release = resolve; });
      return { ok: true as const, value: settings("c".repeat(64), Number(request.changes[0]!.value)) };
    });
    const queue = new SettingsAutosave(settings(), { saveNative, saveMusic: vi.fn(), nativeSaved: vi.fn(), musicSaved: vi.fn() });
    change(queue, 9);
    const leaving = queue.flush();
    change(queue, 8);
    change(queue, 10);
    expect(saveNative).toHaveBeenCalledTimes(1);
    expect(queue.getSnapshot().changes.volume?.value).toBe(10);
    release({ ok: true, value: settings("b".repeat(64), 9) });
    expect(await leaving).toBe(true);
    expect(requests.map(request => request.revision)).toEqual(["a".repeat(64), "b".repeat(64)]);
    expect(requests.map(request => request.changes[0]!.value)).toEqual([9, 10]);
    expect(requests.map(request => request.accountId)).toEqual(["76561198000000001", "76561198000000001"]);
    expect(queue.getSnapshot().changes).toEqual({});
    expect(queue.getSnapshot().settings?.sections[0]?.fields[0]?.value).toBe(10);
  });

  it("batches setup and rapid edits, then drains music confirmation before leaving", async () => {
    const calls: string[] = [];
    const saveNative = vi.fn(async () => { calls.push("native"); return { ok: true as const, value: settings("b".repeat(64), 7) }; });
    const savedMusic = vi.fn();
    const queue = new SettingsAutosave(settings(), { saveNative,
      saveMusic: async id => { calls.push(id); return { ok: true, value: { mgs2: id } }; },
      nativeSaved: vi.fn(), musicSaved: savedMusic });
    queue.initialize("patch");
    change(queue, 8);
    change(queue, 7);
    queue.selectMusic("chosen-theme");
    expect(await queue.flush()).toBe(true);
    expect(saveNative).toHaveBeenCalledWith(expect.objectContaining({ initializeSectionIds: ["patch"],
      changes: [{ sectionId: "launcher", fieldId: "volume", value: 7 }] }));
    expect(calls).toEqual(["native", "chosen-theme"]);
    expect(savedMusic).toHaveBeenCalledWith({ mgs2: "chosen-theme" });
    expect(queue.getSnapshot()).toMatchObject({ saving: false, changes: {}, initialize: [], musicDraft: undefined });
  });

  it("retains failed intent, blocks departure and never retries against a fresh revision implicitly", async () => {
    const saveNative = vi.fn(async () => ({ ok: false as const, error: "Settings changed outside the hub." }));
    const queue = new SettingsAutosave(settings(), { saveNative, saveMusic: vi.fn(), nativeSaved: vi.fn(), musicSaved: vi.fn() });
    change(queue, 9);
    expect(await queue.flush()).toBe(false);
    expect(queue.getSnapshot().error).toContain("changed outside");
    change(queue, 8);
    expect(await queue.flush()).toBe(false);
    expect(saveNative).toHaveBeenCalledTimes(1);
    expect(queue.getSnapshot().changes.volume?.value).toBe(8);
    queue.reset(settings("f".repeat(64), 4));
    expect(queue.getSnapshot()).toMatchObject({ changes: {}, error: "", settings: { revision: "f".repeat(64) } });
    change(queue, 3);
    await queue.flush();
    expect(saveNative).toHaveBeenLastCalledWith(expect.objectContaining({ revision: "f".repeat(64) }));
  });

  it("retries a transient failure explicitly and saves music independently of native availability", async () => {
    const saveNative = vi.fn();
    const saveMusic = vi.fn().mockResolvedValueOnce({ ok: false, error: "File temporarily locked" })
      .mockResolvedValueOnce({ ok: true, value: { mgs2: "chosen-theme" } });
    const queue = new SettingsAutosave(null, { saveNative, saveMusic, nativeSaved: vi.fn(), musicSaved: vi.fn() });
    queue.selectMusic("chosen-theme");
    expect(await queue.flush()).toBe(false);
    expect(await queue.retry()).toBe(true);
    expect(saveNative).not.toHaveBeenCalled();
    expect(queue.getSnapshot()).toMatchObject({ error: "", musicDraft: undefined, saving: false });
  });
});

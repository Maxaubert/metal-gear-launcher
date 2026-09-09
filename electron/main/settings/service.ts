import { join } from "node:path";
import { createHash } from "node:crypto";
import type { GameSettings, SaveSettingsRequest } from "@shared/settings";
import type { GameId } from "../cli";
import { readNativeSettings, prepareNativeEdits } from "./native";
import { readPatchSettings, preparePatchEdits } from "./patches";
import { commitSettings, settingsRevision } from "./transaction";
import { requireGameClosed } from "./processGuard";
import { readNativeDisplayContext } from "./nativeDisplay";
import { readConfig } from "../config";
import { findSteamRoot } from "../steam/library";

const saving = new Set<string>();

async function readSources(gameId: GameId, installDir: string, accountId?: string, resolvedSteamRoot?: string) {
  const display = await readNativeDisplayContext();
  const steamRoot = gameId === "mgs1" ? resolvedSteamRoot ?? await findSteamRoot((await readConfig()).steamPath) : null;
  const [native, patches] = await Promise.all([
    readNativeSettings(gameId, installDir, accountId, display, steamRoot ?? undefined),
    readPatchSettings(gameId, installDir),
  ]);
  const result: GameSettings = {
    gameId, accountId: native.accountId, accounts: native.accounts,
    revision: createHash("sha256")
      .update(settingsRevision([...native.sources.map((source) => ({ path: source.path, original: source.originalBuffer })), ...patches.sources]))
      .update(JSON.stringify(display ?? null)).digest("hex"),
    sections: [...native.sections, ...patches.sections],
  };
  return { result, native, patches };
}

export async function getGameSettings(gameId: GameId, installDir: string, accountId?: string, steamRoot?: string): Promise<GameSettings> {
  return (await readSources(gameId, installDir, accountId, steamRoot)).result;
}

export async function saveGameSettings(request: SaveSettingsRequest, installDir: string, hubDataDir: string): Promise<GameSettings> {
  if (saving.has(installDir)) throw new Error("A settings save is already in progress.");
  saving.add(installDir);
  try {
    await requireGameClosed(installDir);
    const { result, native, patches } = await readSources(request.gameId, installDir, request.accountId);
    if (request.revision !== result.revision) throw new Error("Settings changed outside the hub. Use Current Settings, then make your change again.");
    const changes = request.changes;
    const seen = new Set<string>();
    for (const change of changes) {
      const key = `${change.sectionId}\n${change.fieldId}`;
      if (seen.has(key)) throw new Error("A setting was specified twice.");
      seen.add(key);
      const section = result.sections.find((section) => section.id === change.sectionId);
      if (!section || section.status === "unsupported" || !section.fields.some((field) => field.id === change.fieldId && !field.readOnly)) {
        throw new Error("This setting is not supported by the installed game or patch.");
      }
    }
    for (const id of request.initializeSectionIds ?? []) {
      if (!patches.sections.some((section) => section.id === id && section.status === "needsSetup")) {
        throw new Error("This patch cannot be initialized.");
      }
    }
    const nativeIds = new Set(native.sections.map((section) => section.id));
    const patchIds = new Set(patches.sections.map((section) => section.id));
    const writes = [
      ...prepareNativeEdits(native.sources, changes.filter((change) => nativeIds.has(change.sectionId))),
      ...preparePatchEdits(patches.sources, changes.filter((change) => patchIds.has(change.sectionId)), request.initializeSectionIds ?? []),
    ];
    // Discovery can read several patch binaries. Recheck after preparation so a
    // game started during that work cannot immediately overwrite our settings.
    await requireGameClosed(installDir);
    await commitSettings(writes, join(hubDataDir, "settings-backups", request.gameId));
    return getGameSettings(request.gameId, installDir, request.accountId);
  } finally { saving.delete(installDir); }
}

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { PreparedSettingsWrite } from "./types";

export async function readOptional(path: string): Promise<Buffer | null> {
  try { return await readFile(path); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export function settingsRevision(sources: { path: string; original: Buffer | null }[]): string {
  const hash = createHash("sha256");
  for (const source of [...sources].sort((a, b) => a.path.localeCompare(b.path))) {
    hash.update(JSON.stringify([source.path, source.original?.length ?? null]));
    if (source.original) hash.update(source.original);
  }
  return hash.digest("hex");
}

function same(a: Buffer | null, b: Buffer | null): boolean {
  return a === null ? b === null : b !== null && a.equals(b);
}

// Every original is backed up before the first replacement. A failed multi-file save
// rolls back only files still containing our bytes, preserving concurrent external edits.
export async function commitSettings(writes: PreparedSettingsWrite[], backupRoot: string): Promise<void> {
  if (!writes.length) return;
  if (new Set(writes.map((w) => w.path.toLowerCase())).size !== writes.length) {
    throw new Error("Settings target was specified twice.");
  }
  for (const write of writes) {
    if (!same(await readOptional(write.path), write.original)) {
      throw new Error("Settings changed outside the hub. Reload before saving.");
    }
  }
  const transactionId = `${Date.now()}-${randomUUID()}`;
  const backupDir = join(backupRoot, transactionId);
  await mkdir(backupDir, { recursive: true });
  const staged: { write: PreparedSettingsWrite; temporary: string }[] = [];
  const committed: PreparedSettingsWrite[] = [];
  try {
    await writeFile(join(backupDir, "manifest.json"), JSON.stringify(writes.map((w, i) => ({
      path: w.path, backup: w.original === null ? null : `${i}-${basename(w.path)}`,
    })), null, 2), { flag: "wx" });
    for (const [i, write] of writes.entries()) {
      if (write.original) await writeFile(join(backupDir, `${i}-${basename(write.path)}`), write.original, { flag: "wx" });
      const temporary = join(dirname(write.path), `.${basename(write.path)}.${transactionId}.tmp`);
      await writeFile(temporary, write.updated, { flag: "wx" });
      staged.push({ write, temporary });
    }
    for (const { write, temporary } of staged) {
      if (!same(await readOptional(write.path), write.original)) {
        throw new Error("Settings changed outside the hub during save. Reload before saving.");
      }
      await rename(temporary, write.path);
      committed.push(write);
      if (!same(await readOptional(write.path), write.updated)) throw new Error("Could not verify saved settings.");
    }
  } catch (error) {
    const failures: string[] = [];
    for (const write of committed.reverse()) {
      try {
        if (!same(await readOptional(write.path), write.updated)) {
          failures.push(basename(write.path));
          continue;
        }
        if (write.original === null) await unlink(write.path);
        else {
          const restore = join(dirname(write.path), `.${basename(write.path)}.${transactionId}.restore`);
          await writeFile(restore, write.original, { flag: "wx" });
          await rename(restore, write.path);
        }
      } catch { failures.push(basename(write.path)); }
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${message}${failures.length ? ` Restore required for ${failures.join(", ")}. Backups: ${backupDir}` : " No pending changes were applied."}`);
  } finally {
    for (const { temporary } of staged) await unlink(temporary).catch(() => undefined);
  }
}

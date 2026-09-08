import { join } from "node:path";
import { loadPacks, type Pack } from "@shared/packs";
import { listLibraries } from "../steam/library";
import { resolveInstall, type Install } from "../steam/resolve";
import { discoverBooks, type BookInstall } from "../books/discovery";
import { discoverBonus, type BonusInstall } from "../bonus/discovery";
import { filesIn } from "../books/cache";
import { toolPaths } from "../extract/tools";
import { sourceFingerprint, stampFiles, type FileStamp } from "./snapshot";

export interface PreparationInventory {
  games: { pack: Pack; install: Install }[];
  books: BookInstall[];
  bonus: BonusInstall[];
  sources: FileStamp[];
  fingerprint: string;
  cacheRoots: string[];
}
async function optionalFiles(root: string): Promise<string[]> {
  try { return await filesIn(root); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
}
export async function inspectLibrary(steamPath: string | null, dataDir: string): Promise<PreparationInventory> {
  const libraries = steamPath ? await listLibraries(steamPath) : [];
  const games: PreparationInventory["games"] = [];
  for (const pack of loadPacks()) {
    const install = await resolveInstall(pack, libraries);
    if (install) games.push({ pack, install });
  }
  const [books, bonus] = await Promise.all([discoverBooks(steamPath), discoverBonus(steamPath)]);
  const sources: string[] = []; const cacheRoots: string[] = [];
  for (const { pack, install } of games) {
    cacheRoots.push(join(dataDir, "assets", pack.id));
    for (const asset of pack.assets) {
      if (asset.source === "unity") sources.push(join(install.installDir, asset.path));
      else sources.push(join(install.installDir, `${asset.archive}.psb.m`), join(install.installDir, `${asset.archive}.bin`));
    }
  }
  for (const book of books) {
    cacheRoots.push(join(dataDir, "book-cache", book.gameId));
    if (book.gameId === "mgs1") sources.push(join(book.path, "windata/alldata.psb.m"), join(book.path, "windata/alldata.bin"));
    else for (const roots of Object.values(book.roots)) for (const root of roots ?? []) sources.push(...await optionalFiles(root));
  }
  for (const install of bonus) {
    cacheRoots.push(join(dataDir, "bonus", install.id));
    sources.push(...await optionalFiles(join(install.path, "windata")));
  }
  if (games.length || books.length || bonus.length) {
    for (const tool of Object.values(toolPaths())) sources.push(tool, join(tool, "..", "VERSION"));
  }
  const records = await stampFiles(sources);
  const identity = { games: games.map(({ pack, install }) => ({ pack, install })), books: books.map(({ gameId, build, path, roots }) => ({ gameId, build, path, roots })), bonus };
  return { games, books, bonus, sources: records, fingerprint: sourceFingerprint(identity, records), cacheRoots };
}

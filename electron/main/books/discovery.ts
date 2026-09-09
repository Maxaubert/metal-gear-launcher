import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { loadPacks } from "@shared/packs";
import type { BookEntry, BookKind, BookLanguage, BookRequest } from "@shared/books";
import { installFromManifest, listLibraries } from "../steam/library";

export interface BookInstall { gameId: BookRequest["gameId"]; title: string; path: string; build: string; roots: Partial<Record<BookKind, string[]>> }
export const bookTitle = (kind: BookKind): string => kind === "master" ? "Master Book" : "Screenplay Book";
export async function isFile(path: string): Promise<boolean> { try { return (await stat(path)).isFile(); } catch { return false; } }

export async function discoverBooks(steamPath: string | null): Promise<BookInstall[]> {
  if (!steamPath) return [];
  const installs: BookInstall[] = [];
  for (const library of await listLibraries(steamPath)) for (const pack of loadPacks()) {
    if (installs.some(item => item.gameId === pack.id)) continue;
    try {
      const manifest = installFromManifest(await readFile(join(library, "steamapps", `appmanifest_${pack.steam.appId}.acf`), "utf8"));
      const path = join(library, "steamapps/common", manifest.installdir);
      const roots: BookInstall["roots"] = {};
      if (pack.id === "mgs1") {
        if (!await isFile(join(path, "windata/alldata.psb.m")) || !await isFile(join(path, "windata/alldata.bin"))) continue;
        roots.master = [path]; roots.screenplay = [path];
      } else {
        const prefix = pack.id === "mgs4" ? "Launcher" : pack.id === "mgspw" ? "launcher" : "";
        const base = join(path, prefix, "launcher_Data/StreamingAssets/aa/StandaloneWindows64");
        const folders = await readdir(base, { withFileTypes: true });
        for (const kind of ["master", "screenplay"] as const) {
          const name = kind === "master" ? "bonus" : "scenario";
          roots[kind] = folders.filter(folder => folder.isDirectory() && folder.name.startsWith(`${name}assets${pack.id}`))
            .map(folder => join(base, folder.name, name)).sort((a, b) => Number(b.includes(`${pack.id}ww_`)) - Number(a.includes(`${pack.id}ww_`)));
        }
      }
      installs.push({ gameId: pack.id, title: pack.title, path, build: manifest.buildid, roots });
    } catch { /* An optional installation is missing or incomplete. */ }
  }
  return installs;
}

export async function metadataSource(install: BookInstall, kind: BookKind, language: BookLanguage, type: string): Promise<string | undefined> {
  for (const root of install.roots[kind] ?? []) {
    for (const suffix of language === "jp" ? ["jp_ww", "jp"] : ["en"]) {
      const file = join(root, `output_${type}_${suffix}.bundle`);
      if (await isFile(file)) return file;
    }
  }
  return undefined;
}

export async function catalog(steamPath: string | null): Promise<BookEntry[]> {
  const result: BookEntry[] = [];
  for (const install of await discoverBooks(steamPath)) for (const kind of ["master", "screenplay"] as const) {
    const languages: BookLanguage[] = [];
    for (const language of ["en", "jp"] as const) {
      if (install.gameId === "mgs1" || await metadataSource(install, kind, language, "page")) languages.push(language);
    }
    if (languages.length) result.push({ gameId: install.gameId, kind, title: bookTitle(kind), gameTitle: install.title, languages });
  }
  return result;
}

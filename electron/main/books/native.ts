import { readFile, writeFile, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import sharp from "sharp";
import { z } from "zod";
import { parseM2FileTable, sliceArchiveFile } from "../extract/m2";
import { M2_SEED, M2_SEED_LENGTH, runTool, toolPaths } from "../extract/tools";
import { cachedExtraction, fileIdentity, filesIn } from "./cache";
import { isFile, metadataSource, type BookInstall } from "./discovery";
import type { BookRequest } from "@shared/books";
import { withBookDecoderSlot } from "./decoders";
import { rememberBookFile } from "./memory";
import { decoderIdentity } from "../extract/identity";

export type NativeRow = Record<string, unknown> & { pageNo: number };
const rowsSchema = z.object({ data: z.array(z.object({ pageNo: z.number().int().nonnegative() }).passthrough()).min(1).max(20000) });
export interface NativeBook { pages: NativeRow[]; index: NativeRow[]; text: NativeRow[]; backgrounds: NativeRow[]; mapping: Record<string, string> }

async function run(executable: string, args: string[]): Promise<void> {
  const result = await withBookDecoderSlot(() => runTool(executable, args));
  if (result.code !== 0) throw new Error(`Book extraction failed: ${result.stderr || result.stdout}`);
}
const decodeJson = async (file: string): Promise<unknown> => JSON.parse((await readFile(file, "utf8")).replace(/^\uFEFF/, ""));
const decodeRows = (file: string): Promise<NativeRow[]> => rememberBookFile(file, "rows", async () => rowsSchema.parse(await decodeJson(file)).data);
const decodeMapping = (file: string): Promise<Record<string, string>> => rememberBookFile(file, "mapping", async () => z.object({ files: z.record(z.string()) }).parse(await decodeJson(file)).files);
const safeAsset = (name: string): string => {
  if (name.length > 200 || !/^[\p{L}\p{N}_ -]+$/u.test(name)) throw new Error("Invalid native book asset name");
  return name;
};

export class NativeBooks {
  readonly root: string;
  constructor(readonly install: BookInstall, dataDir: string) { this.root = join(dataDir, "book-cache", install.gameId); }

  private async identity(source: string, type: string): Promise<string> {
    const tool = this.install.gameId === "mgs1" ? toolPaths().psbDecompile : toolPaths().assetStudio;
    return JSON.stringify([3, this.install.build, type, await fileIdentity(source), await decoderIdentity(tool)]);
  }

  private async m2Table(): Promise<Map<string, { source: string; offset: number; size: number }>> {
    const file = join(this.install.path, "windata/alldata.psb.m");
    const directory = await cachedExtraction(this.root, await this.identity(file, "m2-table"), async temporary => {
      const local = join(temporary, "alldata.psb.m");
      await writeFile(local, await readFile(file));
      await this.decompile(local, temporary);
      const value = await decodeJson(`${local}.json`);
      const table = parseM2FileTable(value);
      if (!table.size || [...table.values()].some(entry => !Number.isSafeInteger(entry.offset) || entry.offset < 0 || !Number.isSafeInteger(entry.size) || entry.size < 0)) throw new Error("Invalid book archive index");
      for (const item of await filesIn(temporary)) await rm(item, { force: true });
      await writeFile(join(temporary, "table.json"), JSON.stringify(value));
    });
    const path = join(directory, "table.json");
    return rememberBookFile(path, "m2-table-lookup", async () => new Map([...parseM2FileTable(await decodeJson(path))]
      .map(([source, entry]) => [source.toLowerCase(), { source, ...entry }])));
  }

  private async decompile(local: string, temporary: string): Promise<void> {
    // MGS1's upper-case book filenames use a lowercase filename in the MDF seed.
    await run(toolPaths().psbDecompile, ["-s", M2_SEED + basename(local).toLowerCase(), "-l", String(M2_SEED_LENGTH), "-o", temporary, local]);
  }

  private async m2(file: string, images: boolean): Promise<string> {
    const archive = join(this.install.path, "windata/alldata.bin");
    const table = await this.m2Table();
    const entry = table.get(file.toLowerCase());
    const source = entry?.source;
    if (!source || !entry || entry.size > 128 * 1024 * 1024) throw new Error(`Book asset unavailable: ${basename(file)}`);
    const identity = `${await this.identity(archive, images ? "m2-image" : "m2-json")}:${await fileIdentity(join(this.install.path, "windata/alldata.psb.m"))}:${source}`;
    return cachedExtraction(this.root, identity, async temporary => {
      const local = join(temporary, basename(source));
      await sliceArchiveFile(archive, entry, local);
      await this.decompile(local, temporary);
      if (!images) {
        const value = await decodeJson(`${local}.json`);
        if (!value || typeof value !== "object") throw new Error("Book metadata could not be decoded");
        for (const item of await filesIn(temporary)) await rm(item, { force: true });
        await writeFile(join(temporary, "data.json"), JSON.stringify(value));
      } else await this.keepImages(temporary);
    });
  }

  private async unity(source: string, images: boolean): Promise<string> {
    return cachedExtraction(this.root, await this.identity(source, images ? "unity-image" : "unity-json"), async temporary => {
      const args = [source, "-o", temporary, "-g", "type", "-t", images ? "sprite" : "monoBehaviour", "--log-level", "error"];
      await run(toolPaths().assetStudio, args);
      if (images) {
        if (!(await filesIn(temporary)).some(file => file.endsWith(".png"))) await run(toolPaths().assetStudio, [source, "-o", temporary, "-g", "type", "-t", "tex2d", "--log-level", "error"]);
        await this.keepImages(temporary);
      } else {
        const json = (await filesIn(temporary)).find(file => file.endsWith(".json"));
        if (!json) throw new Error("Book metadata extraction produced no JSON");
        const value = await decodeJson(json);
        rowsSchema.parse(value);
        for (const item of await filesIn(temporary)) await rm(item, { force: true });
        await writeFile(join(temporary, "data.json"), JSON.stringify(value));
      }
    });
  }

  private async keepImages(temporary: string): Promise<void> {
    const files = await filesIn(temporary);
    const images = files.filter(file => file.toLowerCase().endsWith(".png"));
    if (!images.length) throw new Error("Book image extraction produced no image");
    for (const image of images) await sharp(image).raw().toBuffer();
    for (const file of files) if (!images.includes(file)) await rm(file, { force: true });
  }

  private async metadata(request: BookRequest, type: string, optional = false): Promise<NativeRow[]> {
    let directory: string;
    if (this.install.gameId === "mgs1") {
      const prefix = request.kind === "master" ? "bonusbook" : "output";
      const file = `087/config/${prefix}_${type === "textdata" ? "TextData" : type}_${request.language.toUpperCase()}.psb.m`;
      if (optional && !(await this.m2Table()).has(file.toLowerCase())) return [];
      directory = await this.m2(file, false);
    } else {
      const source = await metadataSource(this.install, request.kind, request.language, type);
      if (!source && optional) return [];
      if (!source) throw new Error("This book language is not installed");
      directory = await this.unity(source, false);
    }
    return decodeRows(join(directory, "data.json"));
  }

  async book(request: BookRequest): Promise<NativeBook> {
    const [pages, index, text, backgrounds] = await Promise.all([
      this.metadata(request, "page"), this.metadata(request, "index", true),
      request.kind === "screenplay" ? this.metadata(request, "textdata") : [],
      request.kind === "screenplay" ? this.metadata(request, "background") : [],
    ]);
    let mapping: Record<string, string> = {};
    if (this.install.gameId === "mgs1" && request.kind === "screenplay") {
      const directory = await this.m2("087/config/title_scenariobook_files.psb.m", false);
      mapping = await decodeMapping(join(directory, "data.json"));
    }
    return { pages, index, text, backgrounds, mapping };
  }

  async image(request: BookRequest, name: string, mapping: Record<string, string>): Promise<string[]> {
    if (!name || name.toLowerCase() === "null_pic") return [];
    safeAsset(name);
    let directory: string;
    if (this.install.gameId === "mgs1") {
      const mapped = Object.entries(mapping).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1] ?? name;
      directory = await this.m2(`087/image/${safeAsset(mapped)}.psb.m`, true);
    } else {
      const alias = this.install.gameId === "mgs4" && name.toLowerCase() === "johhny" ? "johnny" : name.toLowerCase();
      let source: string | undefined;
      for (const root of this.install.roots[request.kind] ?? []) {
        const candidate = join(root, "image", `${alias}.bundle`);
        if (await isFile(candidate)) { source = candidate; break; }
      }
      if (!source) throw new Error(`Book image unavailable: ${name}`);
      directory = await this.unity(source, true);
    }
    return (await filesIn(directory)).filter(file => file.toLowerCase().endsWith(".png")).sort();
  }
}

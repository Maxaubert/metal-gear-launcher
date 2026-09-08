import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { SettingField, SettingValue, SettingsChange, SettingsSection } from "@shared/settings";
import type { PreparedSettingsWrite } from "./types";
import { decodeUsersv, editUsersv } from "./usersv";
import { isVolumeTwo, launcherFields, nativeField, usersvFields, validateNativeValue, type NativeFieldSpec, type NativeGameId } from "./nativeSchemas";

import { readMgs1Settings, prepareMgs1Edits, type Mgs1Source } from "./mgs1";
import { displayResolutionLevel, mgs4ResolutionOptions, presetGraphics, type NativeDisplayContext } from "./nativeDisplay";

type LauncherDocument = Record<string, unknown> & { keyList: string[]; valueList: string[] };
type UnitySource = {
  gameId: Exclude<NativeGameId, "mgs1">;
  sectionId: string;
  path: string;
  originalBuffer: Buffer;
  format: "launcher-json" | "usersv";
  specs: NativeFieldSpec[];
  fields: SettingField[];
  display?: NativeDisplayContext;
};
export type NativeSource = UnitySource | Mgs1Source;
export type NativeSettingsResult = {
  sections: SettingsSection[];
  accounts: { id: string; label: string }[];
  accountId?: string;
  sources: NativeSource[];
};

const SAVE_FOLDERS: Record<Exclude<NativeGameId, "mgs1">, string> = {
  mg12: "mg12_savedata_win", mgs2: "mgs2_savedata_win", mgs3: "mgs3_savedata_win", mgs4: "mgs4_savedata_win", mgspw: "mgspw_savedata_win",
};

const VOLUME_TWO_MIRRORS: Record<string, string> = {
  SndMasterVol: "launcherMasterVolume", SndMute: "launcherMute", WindowMode: "WindowMode", WindowSizeW: "WindowSizeW", WindowSizeH: "WindowSizeH",
  SndVolBGM: "launcherVolumeBGM", SndMuteBGM: "launcherMuteBGM",
  SndVolSE: "launcherVolumeSE", SndMuteSE: "launcherMuteSE", SndVolVoise: "SndVolVoise",
};

function isMirrored(gameId: NativeGameId, key: string): boolean {
  return isVolumeTwo(gameId) ? key in VOLUME_TWO_MIRRORS || key === "WindowSizeMode" : key.startsWith("Hireso") || key === "WallType" || key === "WallAlign";
}

function parseLauncher(buffer: Buffer): LauncherDocument {
  const parsed: unknown = JSON.parse(buffer.toString("utf8").replace(/^\uFEFF/, ""));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid launcher settings object");
  const value = parsed as Record<string, unknown>;
  if (!Array.isArray(value.keyList) || !Array.isArray(value.valueList) || value.keyList.length !== value.valueList.length
    || !value.keyList.every(key => typeof key === "string") || !value.valueList.every(item => typeof item === "string")
    || new Set(value.keyList).size !== value.keyList.length) throw new Error("Invalid launcher settings key/value arrays");
  return value as LauncherDocument;
}

function readInteger(text: string): number {
  if (!/^-?\d+$/.test(text) || !Number.isSafeInteger(Number(text))) throw new Error("Invalid native integer");
  return Number(text);
}

function presetFieldValues(source: UnitySource, game: UnitySource | undefined, preset: number): Record<string, SettingValue> {
  const display = source.display!;
  const pw = source.gameId === "mgspw";
  const ids = pw ? ["CustomResolution", "CustomUpscale", "CustomMovie"] : ["HiresoRender", "HiresoUpScale", "HiresoMovie", "HiresoTexture"];
  if (preset !== 2) {
    const projection = presetGraphics(source.gameId, preset, display);
    const values = [projection.render, projection.upscale, projection.movie, projection.texture];
    return Object.fromEntries(ids.map((key, index) => [key, values[index]!]));
  }
  const doc = parseLauncher(source.originalBuffer);
  const nativeSpecs = pw ? launcherFields(source.gameId) : usersvFields(source.gameId);
  const values: Record<string, SettingValue> = {};
  for (const key of ids) {
    const index = doc.keyList.indexOf(key);
    let value = index < 0 ? 0 : readInteger(doc.valueList[index]!);
    validateNativeValue({ ...nativeSpecs.find(spec => spec.id === key)!, readOnly: false }, value);
    const spec = (pw ? source : game)!.specs.find(spec => spec.id === key)!;
    if (ids.indexOf(key) < 2) value = Math.min(value, Math.max(...spec.options!.map(option => Number(option.value))));
    if (key === "HiresoTexture" && decodeUsersv(game!.originalBuffer).readInt32LE(72) !== 1) value = 0;
    values[key] = value;
  }
  return values;
}

async function withinInstall(path: string, installDir: string): Promise<void> {
  const [target, root] = await Promise.all([realpath(path), realpath(installDir)]);
  const rel = relative(root, target);
  if (rel === ".." || rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(rel)) throw new Error("Native settings path leaves the game installation");
}

async function loadSource(result: NativeSettingsResult, gameId: UnitySource["gameId"], installDir: string, sectionId: string, title: string, path: string, format: UnitySource["format"], specs: NativeFieldSpec[]): Promise<void> {
  const section: SettingsSection = { id: sectionId, title, kind: "native", status: "ready", fields: [] };
  result.sections.push(section);
  try {
    await withinInstall(path, installDir);
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 256 * 1024) throw new Error("Unsupported settings file");
    const originalBuffer = await readFile(path);
    let values: Map<string, number>;
    if (format === "launcher-json") {
      const doc = parseLauncher(originalBuffer);
      values = new Map(specs.map(spec => {
        const index = doc.keyList.indexOf(spec.id);
        return [spec.id, index < 0 ? spec.defaultValue : readInteger(doc.valueList[index]!)];
      }));
    } else {
      const decoded = decodeUsersv(originalBuffer);
      values = new Map(specs.map(spec => [spec.id, decoded.readInt32LE(16 + spec.index! * 4)]));
    }
    section.fields = specs.filter(spec => !["HiresoTexture", "WindowSizeW", "WindowSizeH"].includes(spec.id))
      .map(spec => nativeField(spec, values.get(spec.id) ?? spec.defaultValue));
    if (gameId === "mgs2" || gameId === "mgs3") {
      const order = ["HiresoRender", "HiresoUpScale", "HiresoMovie", "WindowMode"];
      section.fields.sort((a, b) => (order.includes(a.id) ? order.indexOf(a.id) : -1) - (order.includes(b.id) ? order.indexOf(b.id) : -1));
    }
    result.sources.push({ gameId, sectionId, path: resolve(path), format, originalBuffer, specs, fields: section.fields });
  } catch (error) {
    section.status = (error as NodeJS.ErrnoException).code === "ENOENT" ? "needsSetup" : "unsupported";
    section.message = section.status === "needsSetup" ? "Open the original launcher once to create its settings." : `Native settings cannot be edited: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export async function readNativeSettings(gameId: NativeGameId, installDir: string, accountId?: string, display?: NativeDisplayContext, steamRoot?: string): Promise<NativeSettingsResult> {
  const result: NativeSettingsResult = { sections: [], accounts: [], sources: [] };
  if (gameId === "mgs1") return readMgs1Settings(installDir, accountId, steamRoot);
  const saveDir = join(installDir, SAVE_FOLDERS[gameId]);
  try {
    await withinInstall(saveDir, installDir);
    const directories = await readdir(saveDir, { withFileTypes: true });
    result.accounts = directories.filter(entry => entry.isDirectory() && !entry.isSymbolicLink() && /^\d{17}$/.test(entry.name))
      .map(entry => ({ id: entry.name, label: `Steam ${entry.name}` })).sort((a, b) => a.id.localeCompare(b.id));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (accountId && !result.accounts.some(account => account.id === accountId)) throw new Error("The selected Steam account has no native settings for this game");
  const selected = accountId ?? (result.accounts.length === 1 ? result.accounts[0]!.id : undefined);
  if (!selected) {
    result.sections.push({ id: "native-launcher", title: "Native settings", kind: "native", status: "needsSetup", fields: [],
      message: result.accounts.length ? "Choose a Steam account to edit its settings." : "Open the original launcher while signed in to Steam to create native settings." });
    return result;
  }
  result.accountId = selected;
  const accountDir = join(saveDir, selected);
  await withinInstall(accountDir, installDir);
  await loadSource(result, gameId, installDir, "native-launcher", "Launcher", join(accountDir, "launcher", "launcher_sv"), "launcher-json", launcherFields(gameId));
  await loadSource(result, gameId, installDir, "native-game", "Game", isVolumeTwo(gameId) ? join(accountDir, "usersv") : join(accountDir, "launcher", "usersv"), "usersv", usersvFields(gameId));
  const launcher = result.sources.find((source): source is UnitySource => source.format === "launcher-json");
  const game = result.sources.find((source): source is UnitySource => source.format === "usersv");
  for (const source of [launcher, game]) if (source) source.display = display;
  if (launcher && !display) {
    const preset = launcher.fields.find(field => field.id === "HiresoPreset");
    if (preset) preset.description = "Automatic presets require a single identified display. Individual graphics options can still be changed and select Custom when saved.";
  }
  if (launcher && display && (gameId === "mgspw" || game)) {
    const preset = launcher.specs.find(spec => spec.id === "HiresoPreset");
    if (preset) {
      preset.readOnly = false;
      if (gameId !== "mgspw") preset.options = preset.options!.filter(option => option.value !== 3);
      const field = launcher.fields.find(field => field.id === preset.id)!;
      Object.assign(field, nativeField(preset, Number(field.value)), { description: "Uses the connected display's resolution. Changing an individual resolution option selects Custom." });
    }
  }
  if (display) {
    const level = displayResolutionLevel(display);
    const textureEnabled = game && (gameId === "mgs2" || gameId === "mgs3") ? decodeUsersv(game.originalBuffer).readInt32LE(72) === 1 : false;
    for (const source of [launcher, game]) for (const spec of source?.specs ?? []) {
      const render = spec.id === "HiresoRender" || spec.id === "CustomResolution";
      const upscale = spec.id === "HiresoUpScale" || spec.id === "CustomUpscale";
      if (!render && !upscale) continue;
      const maximum = render ? Math.min(level, gameId === "mgspw" || !textureEnabled ? 1 : 3) : level;
      spec.options = spec.options!.filter(option => Number(option.value) <= maximum);
      const field = source!.fields.find(field => field.id === spec.id)!;
      Object.assign(field, nativeField(spec, Number(field.value)));
    }
    if (gameId === "mgspw" && game) {
      const sizes = [[1280, 720], [1920, 1080], [2560, 1440], [3840, 2160]];
      const spec = game.specs.find(spec => spec.id === "WindowSizeMode")!;
      spec.options = spec.options!.filter(option => Number(option.value) === 0 || (sizes[Number(option.value) - 1]![0]! <= display.width && sizes[Number(option.value) - 1]![1]! <= display.height));
      const field = game.fields.find(field => field.id === spec.id)!;
      Object.assign(field, nativeField(spec, Number(field.value)));
    }
  }
  if (launcher?.display) {
    const preset = launcher.fields.find(field => field.id === "HiresoPreset");
    if (preset && !preset.readOnly) for (const option of preset.options ?? []) {
      try { option.fieldValues = presetFieldValues(launcher, game, Number(option.value)); }
      catch { /* Unknown remembered custom values remain unprojected and are rejected on save. */ }
    }
  }
  if (gameId === "mgs4" && launcher && game && display) {
    const decoded = decodeUsersv(game.originalBuffer);
    const windowed = decoded.readInt32LE(28) === 1;
    const doc = parseLauncher(launcher.originalBuffer);
    const value = (key: string, fallback: number) => {
      const index = doc.keyList.indexOf(key);
      return index < 0 ? fallback : readInteger(doc.valueList[index]!);
    };
    const width = value(windowed ? "ResolutionWindowW" : "ResolutionFullW", windowed ? 1280 : display.width);
    const height = value(windowed ? "ResolutionWindowH" : "ResolutionFullH", windowed ? 720 : display.height);
    const options = mgs4ResolutionOptions(display, windowed);
    const spec: NativeFieldSpec = { id: "ScreenResolution", label: "Resolution", category: "Screen", kind: "choice", defaultValue: 0,
      options: [{ value: 0, label: `Current (${width} × ${height})` }, ...options.map(({ value, label }) => ({ value, label }))] };
    const current = options.find(option => option.width === width && option.height === height)?.value ?? 0;
    spec.defaultValue = options.at(-1)?.value ?? 0;
    launcher.specs.push(spec);
    launcher.fields.push(nativeField(spec, current));
  }
  if (isVolumeTwo(gameId) && game && display) {
    const monitor: NativeFieldSpec = { id: "MonitorIndex", label: "Select Display", category: "Screen", kind: "choice", defaultValue: 0, index: 17,
      options: [{ value: 0, label: "Display 1" }] };
    game.specs.push(monitor);
    game.fields.push(nativeField(monitor, decodeUsersv(game.originalBuffer).readInt32LE(84)));
  }
  // These native fields are mirrored into launcher_sv on save. Both source files
  // must be available so one missing/corrupt file cannot produce a partial edit.
  if (!result.sources.some(source => source.format === "launcher-json")) {
    const game = result.sources.find(source => source.format === "usersv");
    for (const field of game?.fields ?? []) if (isMirrored(gameId, field.id)) {
      field.readOnly = true;
      field.description = "The original launcher settings file is missing or cannot be read. Open the original launcher to repair it, then reload these settings.";
    }
  }
  return result;
}

function setLauncherValue(doc: LauncherDocument, key: string, value: number): void {
  const index = doc.keyList.indexOf(key);
  if (index < 0) { doc.keyList.push(key); doc.valueList.push(String(value)); }
  else doc.valueList[index] = String(value);
}

function editLauncher(original: Buffer, values: Map<string, number>): Buffer {
  const doc = parseLauncher(original);
  for (const [key, value] of values) setLauncherValue(doc, key, value);
  const text = original.toString("utf8");
  const indent = /\n([ \t]+)"/.exec(text)?.[1];
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const output = JSON.stringify(doc, null, indent).replace(/\n/g, newline);
  return Buffer.from((text.startsWith("\uFEFF") ? "\uFEFF" : "") + output + (/\r?\n$/.test(text) ? newline : ""), "utf8");
}

export function prepareNativeEdits(sources: NativeSource[], changes: SettingsChange[]): PreparedSettingsWrite[] {
  if (sources.some(source => source.gameId === "mgs1")) {
    if (sources.some(source => source.gameId !== "mgs1")) throw new Error("Mixed native game sources");
    return prepareMgs1Edits(sources as Mgs1Source[], changes);
  }
  const unitySources = sources as UnitySource[];
  const pending = new Map<UnitySource, Map<string, number>>();
  for (const change of changes) {
    const source = unitySources.find(item => item.sectionId === change.sectionId);
    if (!source) throw new Error("Unknown or unavailable native settings section");
    const spec = source.specs.find(item => item.id === change.fieldId);
    if (!spec || source.fields.find(item => item.id === change.fieldId)?.readOnly) throw new Error("Unknown or read-only native setting");
    const values = pending.get(source) ?? new Map<string, number>();
    if (values.has(change.fieldId)) throw new Error("Duplicate native settings change");
    values.set(change.fieldId, validateNativeValue(spec, change.value));
    pending.set(source, values);
  }
  for (const [source, values] of [...pending]) {
    if (source.format !== "launcher-json") continue;
    const preset = values.get("HiresoPreset");
    if (preset !== undefined && preset !== 2) {
      if (!source.display) throw new Error("The connected display is required for this preset");
      const graphics = presetGraphics(source.gameId, preset, source.display);
      if (source.gameId === "mgspw") {
        for (const [suffix, value] of [["Resolution", graphics.render], ["Upscale", graphics.upscale], ["Movie", graphics.movie]] as const) {
          values.set(`Game${suffix}`, value);
        }
      } else {
        const game = unitySources.find(item => item.format === "usersv");
        if (!game) throw new Error("Native game settings are required for this preset");
        const gameValues = pending.get(game) ?? new Map<string, number>();
        for (const [key, value] of [["HiresoRender", graphics.render], ["HiresoUpScale", graphics.upscale], ["HiresoMovie", graphics.movie], ["HiresoTexture", graphics.texture]] as const) {
          if (gameValues.has(key)) values.set(key, gameValues.get(key)!);
          gameValues.set(key, value);
        }
        pending.set(game, gameValues);
      }
    } else if (preset === 2 && source.gameId !== "mgspw") {
      const game = unitySources.find(item => item.format === "usersv");
      if (!game) throw new Error("Native game settings are required for this preset");
      const gameValues = pending.get(game) ?? new Map<string, number>();
      const doc = parseLauncher(source.originalBuffer);
      for (const key of ["HiresoRender", "HiresoUpScale", "HiresoMovie", "HiresoTexture"]) {
        if (gameValues.has(key)) continue;
        const index = doc.keyList.indexOf(key);
        let value = index < 0 ? 0 : readInteger(doc.valueList[index]!);
        const originalSpec = usersvFields(game.gameId).find(spec => spec.id === key)!;
        validateNativeValue({ ...originalSpec, readOnly: false }, value);
        const spec = game.specs.find(spec => spec.id === key)!;
        if (key === "HiresoRender" || key === "HiresoUpScale") value = Math.min(value, Math.max(...spec.options!.map(option => Number(option.value))));
        if (key === "HiresoTexture" && decodeUsersv(game.originalBuffer).readInt32LE(72) !== 1) value = 0;
        gameValues.set(key, value);
      }
      pending.set(game, gameValues);
    }
    if (source.gameId === "mgs4" && values.has("ScreenResolution")) {
      const selected = values.get("ScreenResolution")!;
      values.delete("ScreenResolution");
      if (selected === 0) continue;
      if (!source.display) throw new Error("The connected display is required for this resolution");
      const game = unitySources.find(item => item.format === "usersv")!;
      const gameValues = pending.get(game) ?? new Map<string, number>();
      const windowed = (gameValues.get("WindowMode") ?? decodeUsersv(game.originalBuffer).readInt32LE(28)) === 1;
      const size = mgs4ResolutionOptions(source.display, windowed).find(option => option.value === selected);
      if (!size) throw new Error("This resolution is unavailable for the selected window mode or display");
      values.set(windowed ? "ResolutionWindowW" : "ResolutionFullW", size.width);
      values.set(windowed ? "ResolutionWindowH" : "ResolutionFullH", size.height);
      if (windowed) {
        gameValues.set("WindowSizeW", size.width);
        gameValues.set("WindowSizeH", size.height);
        pending.set(game, gameValues);
      }
    }
  }
  for (const [source, values] of [...pending]) {
    if (source.gameId === "mgspw" && source.format === "launcher-json" && (values.has("HiresoPreset") || [...values.keys()].some(key => key.startsWith("Custom")))) {
      if (values.has("HiresoPreset") && values.get("HiresoPreset") !== 2) continue;
      const doc = parseLauncher(source.originalBuffer);
      const current = (key: string) => {
        const index = doc.keyList.indexOf(key);
        let value = values.get(key) ?? (index < 0 ? 0 : readInteger(doc.valueList[index]!));
        validateNativeValue(launcherFields(source.gameId).find(spec => spec.id === key)!, value);
        if (key !== "CustomMovie") value = Math.min(value, Math.max(...source.specs.find(spec => spec.id === key)!.options!.map(option => Number(option.value))));
        return value;
      };
      const resolution = current("CustomResolution");
      const upscale = current("CustomUpscale");
      if (upscale !== 0 && upscale < resolution) throw new Error("Upscaling must be Default or at least the internal resolution");
      const level = source.display ? displayResolutionLevel(source.display) : 3;
      for (const suffix of ["Resolution", "Upscale", "Movie"]) {
        const value = suffix === "Movie" ? current(`Custom${suffix}`) : Math.min(level, current(`Custom${suffix}`));
        values.set(`Game${suffix}`, value);
        values.set(`Custom${suffix}`, value);
      }
      if (!values.has("HiresoPreset")) values.set("HiresoPreset", 2);
    }
    if (source.format !== "usersv") continue;
    const mirrored = [...values.keys()].some(key => isMirrored(source.gameId, key));
    if (!mirrored) continue;
    const launcher = unitySources.find(item => item.format === "launcher-json" && item.gameId === source.gameId);
    if (!launcher) throw new Error("The native launcher settings are required for this edit");
    const jsonValues = pending.get(launcher) ?? new Map<string, number>();
    if (isVolumeTwo(source.gameId)) {
      const sizeMode = values.get("WindowSizeMode");
      if (source.gameId === "mgspw" && sizeMode !== undefined && sizeMode > 0) {
        const size = [[1280, 720], [1920, 1080], [2560, 1440], [3840, 2160]][sizeMode - 1]!;
        values.set("WindowSizeW", size[0]!);
        values.set("WindowSizeH", size[1]!);
      }
      for (const [key, value] of values) if (VOLUME_TWO_MIRRORS[key]) {
        const mirror = source.gameId === "mgs4" && key.startsWith("WindowSize") ? key.replace("WindowSize", "ResolutionWindow") : VOLUME_TWO_MIRRORS[key]!;
        jsonValues.set(mirror, value);
      }
    } else if (source.gameId === "mg12") {
      for (const [key, value] of values) if (key === "WallType" || key === "WallAlign") jsonValues.set(key, key === "WallAlign" && value < 2 ? 1 - value : value);
    } else {
      const decoded = decodeUsersv(source.originalBuffer);
      const read = (key: string) => {
        const spec = source.specs.find(spec => spec.id === key)!;
        const value = values.get(key) ?? decoded.readInt32LE(16 + spec.index! * 4);
        validateNativeValue({ ...spec, readOnly: false }, value);
        return value;
      };
      const render = read("HiresoRender");
      const upscale = read("HiresoUpScale");
      if (upscale !== 0 && upscale < render) throw new Error("Upscaling must be Default or at least the internal resolution");
      if (render > 1 && read("HiresoTexture") !== 1) throw new Error("WQHD and 4K internal resolution require the native high-resolution texture setting");
      for (const key of ["HiresoRender", "HiresoUpScale", "HiresoMovie", "HiresoTexture"]) {
        const value = read(key);
        if (!jsonValues.has("HiresoPreset") || jsonValues.get("HiresoPreset") === 2) jsonValues.set(key, value);
      }
      if (!jsonValues.has("HiresoPreset")) jsonValues.set("HiresoPreset", 2);
    }
    pending.set(launcher, jsonValues);
  }
  return [...pending].map(([source, values]) => {
    const updated = source.format === "usersv"
      ? editUsersv(source.originalBuffer, new Map([...values].map(([key, value]) => [source.specs.find(spec => spec.id === key)!.index!, value])))
      : editLauncher(source.originalBuffer, values);
    return { path: source.path, original: source.originalBuffer, updated };
  }).filter(write => !write.updated.equals(write.original));
}

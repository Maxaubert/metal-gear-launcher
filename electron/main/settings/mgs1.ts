import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import type { SettingField, SettingsChange, SettingsSection, SettingValue } from "@shared/settings";
import type { PreparedSettingsWrite } from "./types";
import { findSteamRoot } from "../steam/library";
import { decodeMgs1Save, MGS1_PAYLOAD_SIZE, updateMgs1Save } from "./mgs1Codec";

type FieldSpec = Omit<SettingField, "value"> & { offset: number; width: 1 | 4 };
const choice = (id: string, label: string, category: string, offset: number, values: [number, string][], width: 1 | 4 = 4): FieldSpec =>
  ({ id, label, category, offset, width, kind: "choice", options: values.map(([value, text]) => ({ value, label: text })) });
const toggle = (id: string, label: string, category: string, offset: number, width: 1 | 4 = 4): FieldSpec =>
  ({ id, label, category, offset, width, kind: "toggle" });

// All fields below are explicitly copied with COMMON by native Squirrel code.
// BGM/SE volumes and resume-state flags are deliberately absent: they are not
// functioning controls in this native Options menu.
const specs: FieldSpec[] = [
  choice("languageLauncher", "Launcher language", "Language", 4636, [[0, "Japanese"], [1, "English"], [2, "French"], [3, "Italian"], [4, "German"], [5, "Spanish"]]),
  choice("resolution", "Resolution Settings", "Screen", 4233, [[0, "Original"], [1, "High"], [2, "Maximum"]], 1),
  toggle("smoothing", "Smoothing", "Screen", 4192),
  choice("screenSize", "Game Screen Settings", "Screen", 4160, [[2, "Standard"], [4, "Pixel perfect"], [7, "Widescreen"], [3, "Full screen"]]),
  choice("screenPosition", "Display Area", "Screen", 4234, [[0, "Left"], [1, "Center"], [2, "Right"]], 1),
  choice("wallpaper", "Wallpaper", "Screen", 4196, Array.from({ length: 8 }, (_, i) => [i, i === 0 ? "None" : `Wallpaper ${i}`])),
  toggle("scanlines", "Screen Filter", "Screen", 4188),
  { id: "volumeUi", label: "Volume(Main Menu)", category: "Audio", kind: "range", offset: 4432, width: 4, min: 0, max: 100, step: 10 },
  toggle("muteUi", "Mute launcher", "Audio", 4446, 1),
  { id: "volumeGame", label: "Volume(Game)", category: "Audio", kind: "range", offset: 4428, width: 4, min: 0, max: 100, step: 10 },
  toggle("muteGame", "Mute game", "Audio", 4445, 1),
  toggle("confirmButtonSwap", "Confirmation Button", "Button Settings", 4641, 1),
];
const defaults: Record<string, SettingValue> = {
  resolution: 0, smoothing: true, screenSize: 2, screenPosition: 1,
  wallpaper: 1, scanlines: false, volumeUi: 100, muteUi: false,
  volumeGame: 100, muteGame: false, confirmButtonSwap: false,
};

export type Mgs1Source = {
  gameId: "mgs1";
  sectionId: string;
  path: string;
  originalBuffer: Buffer;
  format: "mgs1-save" | "mgs1-window" | "mgs1-metadata";
  fields: SettingField[];
};
type Result = { sections: SettingsSection[]; accounts: { id: string; label: string }[]; accountId?: string; sources: Mgs1Source[] };
const STEAM_BASE = 76561197960265728n;

async function containedFile(path: string, root: string, maxSize: number): Promise<Buffer> {
  const [actual, actualRoot, stat] = await Promise.all([realpath(path), realpath(root), lstat(path)]);
  const rel = relative(actualRoot, actual);
  if (isAbsolute(rel) || rel === ".." || rel.startsWith(`..${sep}`) || !stat.isFile() || stat.isSymbolicLink() || stat.size > maxSize) throw new Error("MGS1 settings path is outside its allowed directory or has an unsupported size");
  return readFile(path);
}

function windowValue(buffer: Buffer): boolean {
  const matches = [...buffer.toString("utf8").matchAll(/^\s*BOOT_FULLSCREEN[ \t]*=[ \t]*([01])[ \t]*\r?$/gm)];
  if (matches.length !== 1) throw new Error("Invalid MGS1 fullscreen setting");
  return matches[0]![1] === "1";
}

function fieldsForSave(buffer: Buffer): SettingField[] {
  const { payload } = decodeMgs1Save(buffer);
  if (payload[4444] !== 1) throw new Error("MGS1 sound settings need native initialization");
  return specs.map(({ offset, width, ...field }) => {
    const stored = payload.readUIntLE(offset, width);
    const valid = field.kind === "toggle" ? stored <= 1 : field.options ? field.options.some(option => option.value === stored) : stored >= 0 && stored <= 100;
    return { ...field, value: field.kind === "toggle" ? stored !== 0 : stored,
      ...(field.id in defaults ? { defaultValue: defaults[field.id] } : {}),
      ...(!valid ? { readOnly: true, description: "This native value is not supported by the hub." } : {}) };
  });
}

export async function readMgs1Settings(installDir: string, accountId?: string, steamRootOverride?: string): Promise<Result> {
  const result: Result = { sections: [], accounts: [], sources: [] };
  const window: SettingsSection = { id: "native-window", title: "Window", kind: "native", status: "ready", fields: [] };
  result.sections.push(window);
  try {
    const path = join(installDir, "winbackup", "savecfg.txt");
    const originalBuffer = await containedFile(path, installDir, 64 * 1024);
    window.fields = [{ id: "BOOT_FULLSCREEN", label: "Window Mode", category: "Screen", kind: "toggle", options: [{ value: false, label: "On" }, { value: true, label: "Off" }], value: windowValue(originalBuffer) }];
    result.sources.push({ gameId: "mgs1", sectionId: window.id, path: resolve(path), originalBuffer, format: "mgs1-window", fields: window.fields });
  } catch (error) {
    window.status = (error as NodeJS.ErrnoException).code === "ENOENT" ? "needsSetup" : "unsupported";
    window.message = "Open the original launcher once to create valid window settings.";
  }
  const section: SettingsSection = { id: "native-game", title: "Native settings", kind: "native", status: "needsSetup", fields: [] };
  result.sections.push(section);
  const steamRoot = steamRootOverride ?? await findSteamRoot();
  if (!steamRoot) { section.message = "Steam could not be located."; return result; }
  const userdata = join(steamRoot, "userdata");
  const accounts = new Map<string, string>();
  try {
    for (const entry of await readdir(userdata, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.isSymbolicLink() || !/^\d{1,10}$/.test(entry.name) || BigInt(entry.name) > 0xffffffffn) continue;
      const id = (STEAM_BASE + BigInt(entry.name)).toString();
      const path = join(userdata, entry.name, "2131630", "remote", "data_008_0000.bin");
      try { await containedFile(path, userdata, MGS1_PAYLOAD_SIZE + 65544); accounts.set(id, path); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  result.accounts = [...accounts.keys()].sort().map(id => ({ id, label: `Steam ${id}` }));
  if (accountId && !accounts.has(accountId)) throw new Error("The selected Steam account has no MGS1 settings");
  const selected = accountId ?? (accounts.size === 1 ? [...accounts.keys()][0] : undefined);
  if (!selected) {
    section.message = accounts.size ? "Choose a Steam account to edit its settings." : "Open the original launcher while signed in to Steam to create settings.";
    return result;
  }
  result.accountId = selected;
  try {
    const path = accounts.get(selected)!;
    const originalBuffer = await containedFile(path, userdata, MGS1_PAYLOAD_SIZE + 65544);
    section.fields = fieldsForSave(originalBuffer);
    section.status = "ready";
    result.sources.push({ gameId: "mgs1", sectionId: section.id, path: resolve(path), originalBuffer, format: "mgs1-save", fields: section.fields });
    const mirrorPath = join(installDir, "winbackup", "meta_008_0000.bin");
    try {
      const mirror = await containedFile(mirrorPath, installDir, 65536);
      if (mirror.equals(decodeMgs1Save(originalBuffer).metadata)) result.sources.push({ gameId: "mgs1", sectionId: "native-metadata", path: resolve(mirrorPath), originalBuffer: mirror, format: "mgs1-metadata", fields: [] });
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  } catch (error) {
    result.sources = result.sources.filter(source => source.format === "mgs1-window");
    section.fields = [];
    section.status = "unsupported";
    section.message = `Native settings cannot be edited: ${error instanceof Error ? error.message : String(error)}`;
  }
  return result;
}

function validate(spec: FieldSpec, value: SettingValue): number {
  if (spec.kind === "toggle") { if (typeof value !== "boolean") throw new Error("MGS1 toggle requires a boolean"); return Number(value); }
  if (typeof value !== "number" || !Number.isInteger(value)) throw new Error("MGS1 setting requires an integer");
  if (spec.options ? !spec.options.some(option => option.value === value) : value < 0 || value > 100 || value % 10 !== 0) throw new Error("MGS1 setting is outside its native range");
  return value;
}

export function prepareMgs1Edits(sources: Mgs1Source[], changes: SettingsChange[]): PreparedSettingsWrite[] {
  const pending = new Map<Mgs1Source, Map<string, SettingValue>>();
  for (const change of changes) {
    const source = sources.find(item => item.sectionId === change.sectionId);
    const field = source?.fields.find(item => item.id === change.fieldId);
    if (!source || !field || field.readOnly) throw new Error("Unknown or read-only MGS1 setting");
    const values = pending.get(source) ?? new Map();
    if (values.has(change.fieldId)) throw new Error("Duplicate MGS1 settings change");
    values.set(change.fieldId, change.value);
    pending.set(source, values);
  }
  const writes: PreparedSettingsWrite[] = [];
  for (const [source, values] of pending) {
    let updated: Buffer;
    if (source.format === "mgs1-window") {
      const value = values.get("BOOT_FULLSCREEN");
      if (typeof value !== "boolean") throw new Error("MGS1 fullscreen requires a boolean");
      windowValue(source.originalBuffer);
      updated = Buffer.from(source.originalBuffer.toString("utf8").replace(/(^|\n)([ \t]*BOOT_FULLSCREEN[ \t]*=[ \t]*)[01]([ \t]*\r?)(?=\n|$)/,
        (_match, start: string, prefix: string, end: string) => `${start}${prefix}${Number(value)}${end}`));
    } else if (source.format === "mgs1-save") {
      updated = updateMgs1Save(source.originalBuffer, [...values].map(([id, value]) => {
        const spec = specs.find(item => item.id === id)!;
        return { offset: spec.offset, width: spec.width, value: validate(spec, value) };
      }));
      const { payload, metadata } = decodeMgs1Save(updated);
      if (payload.readUInt32LE(4160) === 4 && payload[4233] !== 0) throw new Error("Pixel-perfect screen size requires Original resolution.");
      const mirror = sources.find(item => item.format === "mgs1-metadata");
      if (mirror && mirror.originalBuffer.equals(decodeMgs1Save(source.originalBuffer).metadata) && !metadata.equals(mirror.originalBuffer))
        writes.push({ path: mirror.path, original: mirror.originalBuffer, updated: Buffer.from(metadata) });
    } else throw new Error("MGS1 metadata is not directly editable");
    if (!updated.equals(source.originalBuffer)) writes.push({ path: source.path, original: source.originalBuffer, updated });
  }
  return writes;
}

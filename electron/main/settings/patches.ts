import { readFile, lstat, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { SettingsChange, SettingsSection, SettingValue } from "../../../shared/settings";
import { IniDocument, unquoteIni } from "./ini";
import { isHdHotkey, patchSchemas, type PatchFieldSchema, type PatchSchema } from "./patchSchemas";
import type { PreparedSettingsWrite } from "./types";

export type PatchSource = {
  sectionId: string;
  path: string;
  original: Buffer | null;
  schemaId: string;
  version?: string;
  gameId: string;
  writable: boolean;
};
type Candidate = { id: string; schemaId?: string; title?: string; binaries: string[]; config?: string };

function candidates(gameId: string): Candidate[] {
  if (gameId === "mgs1") return [m2Candidate("")];
  if (["mg12", "mgs2", "mgs3"].includes(gameId)) return [
    { id: "mgshdfix", schemaId: "mgshdfix", binaries: ["plugins/MGSHDFix.asi"], config: "plugins/MGSHDFix.settings" },
    ...(["mgs2", "mgs3"].includes(gameId) ? [{ id: `${gameId}-community`, schemaId: `${gameId}-community`, binaries: [`plugins/${gameId.toUpperCase()}-Community-Bugfix-Compilation.asi`], config: `plugins/${gameId.toUpperCase()}-Community-Bugfix-Compilation.ini` }] : []),
    { id: "mgsfpsunlock", title: "MGSFPSUnlock", binaries: ["MGSFPSUnlock.asi", "plugins/MGSFPSUnlock.asi"], config: "MGSFPSUnlock.ini" },
  ];
  if (gameId === "mgs4" || gameId === "mgspw") {
    const gameFolder = gameId === "mgs4" ? "MGS4" : "mgspw";
    return [
      { id: "mgspatriotfix", schemaId: "mgspatriotfix", binaries: [`${gameFolder}/scripts/MGSPatriotFix.asi`, "Launcher/scripts/MGSPatriotFix.asi"], config: "MGSPatriotFix.settings" },
      ...(gameId === "mgs4" ? [
        { id: "sunnysideup", schemaId: "sunnysideup", binaries: ["MGS4/scripts/SunnySideUp.asi"], config: "MGS4/scripts/SunnySideUp.ini" },
        { id: "mgsfpsunlock", title: "MGSFPSUnlock", binaries: ["MGS4/MGSFPSUnlock.asi", "MGS4/scripts/MGSFPSUnlock.asi"], config: "MGS4/MGSFPSUnlock.ini" },
        m2Candidate("MGS1/"),
      ] : [{ id: "pw-passcode-restoration", title: "PW Passcode Restoration", binaries: ["mgspw/PWPasscodeRestoration.asi"] }]),
    ];
  }
  return [];
}

function m2Candidate(prefix: string): Candidate {
  return { id: prefix ? "mgsm2fix-flashback" : "mgsm2fix", schemaId: "mgsm2fix", title: prefix ? "MGSM2Fix (MGS1 flashback)" : undefined,
    binaries: ["", "plugins/", "scripts/", "update/"].flatMap(folder => ["64", "32", ""].map(suffix => `${prefix}${folder}MGSM2Fix${suffix}.asi`)) };
}

async function optionalFile(path: string, root: string, maxBytes: number): Promise<Buffer | null> {
  try {
    const info = await lstat(path);
    const target = await realpath(path);
    const rel = relative(root, target);
    if (info.isSymbolicLink() || rel.startsWith("..") || isAbsolute(rel) || !info.isFile()) throw new Error("Settings files must be ordinary files inside the game folder.");
    if (info.size > maxBytes) throw new Error("The settings file exceeds the supported size.");
    return await readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      // A missing config can still sit beneath a junction that points outside the game.
      // Validate the nearest existing ancestor before allowing initialization.
      let ancestor = dirname(path);
      for (;;) {
        try {
          const target = await realpath(ancestor);
          const rel = relative(root, target);
          if (rel.startsWith("..") || isAbsolute(rel)) throw new Error("Settings paths must stay inside the game folder.");
          return null;
        } catch (ancestorError) {
          if ((ancestorError as NodeJS.ErrnoException).code !== "ENOENT" || dirname(ancestor) === ancestor) throw ancestorError;
          ancestor = dirname(ancestor);
        }
      }
    }
    throw error;
  }
}

/** Read the fixed file-version resource without invoking an executable or a shell. */
export function patchBinaryVersion(bytes: Buffer): string | undefined {
  const marker = bytes.indexOf(Buffer.from("VS_VERSION_INFO\0", "utf16le"));
  if (marker >= 0) {
    const signature = bytes.indexOf(Buffer.from([0xbd, 0x04, 0xef, 0xfe]), marker);
    if (signature >= 0 && signature < marker + 64 && signature + 16 <= bytes.length) {
      const majorMinor = bytes.readUInt32LE(signature + 8);
      const patchRevision = bytes.readUInt32LE(signature + 12);
      return [majorMinor >>> 16, majorMinor & 0xffff, patchRevision >>> 16, patchRevision & 0xffff].join(".").replace(/\.0$/, "");
    }
  }
  return /SunnySideUp (\d+\.\d+\.\d+)\0/.exec(bytes.toString("latin1"))?.[1];
}

function visibleFields(schema: PatchSchema, gameId: string): PatchFieldSchema[] {
  return schema.fields.filter(field => !field.hidden && (!field.games || field.games.includes(gameId)));
}

export function parsePatchValue(field: PatchFieldSchema, raw: string): SettingValue {
  const value = unquoteIni(raw);
  if (typeof field.defaultValue === "boolean") {
    if (/^(true|1)$/i.test(value)) return true;
    if (/^(false|0)$/i.test(value)) return false;
    throw new Error(`Invalid boolean for ${field.label}.`);
  }
  if (typeof field.defaultValue === "number") {
    if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) throw new Error(`Invalid number for ${field.label}.`);
    return Number(value);
  }
  return value;
}

function validateValue(field: PatchFieldSchema, value: SettingValue): void {
  if (typeof value !== typeof field.defaultValue) throw new Error(`Invalid value type for ${field.label}.`);
  if (field.options && !field.options.includes(value)) throw new Error(`Unsupported choice for ${field.label}.`);
  if (typeof value === "number") {
    if (!Number.isFinite(value) || (field.min !== undefined && value < field.min) || (field.max !== undefined && value > field.max) || (field.step === 1 && !Number.isInteger(value))) throw new Error(`Value outside the supported range for ${field.label}.`);
  }
  if (typeof value === "string") {
    if (value.length > 256 || /[\r\n\0]/.test(value)) throw new Error(`Invalid text for ${field.label}.`);
    if (field.validation === "hdHotkey" && !isHdHotkey(value)) throw new Error(`Unsupported key name for ${field.label}.`);
    if (field.validation === "fov" || field.validation === "cutsceneFov") {
      const [min, max] = field.validation === "fov" ? [30, 140] : [0.5, 2];
      if (!["AUTO", "OFF"].includes(value) && (!/^\d+(?:\.\d+)?$/.test(value) || Number(value) < min! || Number(value) > max!)) throw new Error(`Invalid field of view for ${field.label}.`);
    }
  }
}

function serializeValue(value: SettingValue, schema: PatchSchema): string {
  if (typeof value === "boolean") return schema.format === "ini" ? String(value) : value ? "1" : "0";
  if (typeof value === "string" && schema.format === "settings") return `"${value.replace(/"/g, '\\"')}"`;
  return String(value);
}

export async function readPatchSettings(gameId: string, installDir: string): Promise<{ sections: SettingsSection[]; sources: PatchSource[] }> {
  const root = await realpath(installDir);
  const sections: SettingsSection[] = [];
  const sources: PatchSource[] = [];
  for (const candidate of candidates(gameId)) {
    const schema = candidate.schemaId ? patchSchemas[candidate.schemaId] : undefined;
    const section: SettingsSection = { id: candidate.id, title: candidate.title ?? schema?.title ?? candidate.id, kind: "patch", status: "unsupported", fields: [] };
    try {
      let binaryPath: string | undefined;
      let binary: Buffer | null = null;
      for (const path of candidate.binaries) {
        binary = await optionalFile(join(root, path), root, 32 * 1024 * 1024);
        if (binary) { binaryPath = path; break; }
      }
      if (!binary || !binaryPath) continue;
      const version = patchBinaryVersion(binary);
      section.version = version;
      sections.push(section);
      const configPath = candidate.config ?? (schema?.id === "mgsm2fix" ? binaryPath.replace(/MGSM2Fix(?:32|64)?\.asi$/, "MGSM2Fix.ini") : undefined);
      if (!configPath) { section.message = "Detected. This patch has no configurable settings."; continue; }
      const path = resolve(root, configPath);
      const original = await optionalFile(path, root, 1024 * 1024);
      const source: PatchSource = { sectionId: candidate.id, path, original, schemaId: candidate.schemaId ?? candidate.id, version, gameId, writable: false };
      sources.push(source);
      if (!schema || !version || !schema.versions.includes(version)) {
        section.message = "Detected. This patch version's settings have not been verified; use its original configuration tool.";
        continue;
      }
      const document = new IniDocument(original ?? Buffer.alloc(0));
      section.fields = visibleFields(schema, gameId).map(field => {
        const raw = document.get(field.section, field.key);
        let value = field.defaultValue;
        let readOnly = field.readOnly;
        let description = field.description;
        if (raw !== undefined) {
          try { value = parsePatchValue(field, raw); validateValue(field, value); }
          catch { value = unquoteIni(raw); readOnly = true; description = "Unrecognized existing value. Preserved unchanged; edit it in the patch's original tool."; }
        } else if (original) description = [description, "Not stored in this file; the configuration tool's default is shown."].filter(Boolean).join(" ");
        return { id: field.id, label: field.label, category: field.category, value, kind: field.kind, description, readOnly, options: field.options?.map(option => ({ value: option, label: option === "" ? "None" : String(option) })), min: field.min, max: field.max, step: field.step };
      });
      source.writable = true;
      section.status = original ? "ready" : "needsSetup";
      section.message = original ? schema.message : "Installed, but its settings file is missing. Initialize explicitly to create the verified defaults; opening this screen changes nothing.";
    } catch (error) {
      if (!sections.includes(section)) sections.push(section);
      section.status = "unsupported";
      section.fields = [];
      section.message = error instanceof Error ? error.message : "Unable to read this patch's settings.";
    }
  }
  return { sections, sources };
}

/** Pure preparation only. The caller owns revision checks, backups and atomic writes. */
export function preparePatchEdits(sources: PatchSource[], changes: SettingsChange[], initializeSectionIds: string[] = []): PreparedSettingsWrite[] {
  const requested = new Set([...changes.map(change => change.sectionId), ...initializeSectionIds]);
  const writes: PreparedSettingsWrite[] = [];
  for (const id of requested) {
    const source = sources.find(item => item.sectionId === id);
    const schema = source ? patchSchemas[source.schemaId] : undefined;
    if (!source || !schema || !source.writable) throw new Error(`Unsupported patch settings section: ${id}`);
    const initialize = initializeSectionIds.includes(id);
    if (source.original === null && !initialize) throw new Error("Initialize this patch's settings explicitly before saving changes.");
    if (source.original !== null && initialize) throw new Error("This patch already has a settings file. Reload before initializing.");
    const document = new IniDocument(source.original ?? Buffer.alloc(0));
    const editable = visibleFields(schema, source.gameId);
    const values = new Map<PatchFieldSchema, SettingValue>();
    if (initialize) for (const field of schema.fields) {
      // The official tool selects the first region/language pair for this game.
      const defaultValue = schema.id === "mgshdfix" && source.gameId === "mgs3" && field.id === "Region" ? "us" : field.defaultValue;
      values.set(field, defaultValue);
    }
    const seen = new Set<string>();
    for (const change of changes.filter(item => item.sectionId === id)) {
      if (seen.has(change.fieldId)) throw new Error("Duplicate patch setting change.");
      seen.add(change.fieldId);
      const field = editable.find(item => item.id === change.fieldId);
      if (!field || field.readOnly) throw new Error(`Unsupported patch setting: ${change.fieldId}`);
      // Unknown values are intentionally read-only until the original tool repairs them.
      const raw = document.get(field.section, field.key);
      if (raw !== undefined) validateValue(field, parsePatchValue(field, raw));
      validateValue(field, change.value);
      values.set(field, change.value);
    }
    if (schema.id === "sunnysideup") {
      const dimension = (key: string): number => {
        const field = schema.fields.find(item => item.key === key)!;
        return Number(values.get(field) ?? parsePatchValue(field, document.get(field.section, field.key) ?? String(field.defaultValue)));
      };
      if ((dimension("Width") === 0) !== (dimension("Height") === 0)) throw new Error("Set both render dimensions, or set both to zero.");
    }
    const updates = [...values].map(([field, value]) => ({ section: field.section, key: field.key, value: serializeValue(value, schema) }));
    const updated = document.edit(updates);
    // Reparse before handing bytes to the transactional writer.
    new IniDocument(updated);
    if (!source.original?.equals(updated)) writes.push({ path: source.path, original: source.original, updated });
  }
  return writes;
}

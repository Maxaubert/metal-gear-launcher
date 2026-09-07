import type { SettingField, SettingValue } from "@shared/settings";

export type NativeGameId = "mg12" | "mgs1" | "mgs2" | "mgs3" | "mgs4" | "mgspw";
export type NativeFieldSpec = Omit<SettingField, "value" | "defaultValue"> & { defaultValue: number; index?: number };

const choice = (id: string, label: string, category: string, labels: string[], defaultValue = 0, index?: number): NativeFieldSpec => ({
  id, label, category, kind: "choice", defaultValue, index, options: labels.map((label, value) => ({ value, label })),
});
const volume = (id: string, label: string, defaultValue: number, index?: number): NativeFieldSpec => ({
  id, label, category: "Audio", kind: "range", min: 0, max: 10, step: 1, defaultValue, index,
});
const toggle = (id: string, label: string, category: string, index?: number): NativeFieldSpec => ({
  id, label, category, kind: "toggle", defaultValue: 0, index,
});
const raw = (id: string, label: string, category: string, index: number): NativeFieldSpec => ({
  id, label, category, kind: "text", defaultValue: 0, index, readOnly: true,
  description: "Stored native value. Its editable range or option mapping has not been verified.",
});

export const isVolumeTwo = (gameId: NativeGameId): boolean => gameId === "mgs4" || gameId === "mgspw";

export function launcherFields(gameId: NativeGameId): NativeFieldSpec[] {
  const languages = ["Japanese", "English", "French", "Italian", "German", "Spanish"];
  if (isVolumeTwo(gameId)) languages.push("Portuguese (Brazil)");
  const fields = [choice("languageLauncher", "Launcher language", "Language", languages, 1)];
  if (!isVolumeTwo(gameId)) fields.push(volume("launcherMasterVolume", "Main Menu Volume", 10), toggle("launcherMute", "Mute launcher", "Sound"));
  if (gameId === "mgs2" || gameId === "mgs3") fields.push({
    ...choice("HiresoPreset", "Resolution Settings", "Screen", ["Original Mode", "Adjusted Mode", "Custom", "High Resolution Mode"]),
    readOnly: true, description: "Changing a graphics option below selects Custom. Automatic presets depend on the native launcher's display and DLC checks.",
  });
  if (gameId === "mgspw") fields.push(
    { ...choice("HiresoPreset", "Resolution Settings", "Screen", ["Original Mode", "Adjusted Mode", "Custom", "High Resolution Mode"]),
      readOnly: true, description: "Changing a resolution option selects Custom. The original launcher applies the active display's limits." },
    choice("CustomResolution", "Internal Resolution", "Screen", ["Original", "FHD"]),
    { ...choice("CustomUpscale", "Internal Upscaling", "Screen", ["Default", "FHD", "WQHD", "4K"]),
      description: "The original launcher limits upscaling to the active display's resolution." },
    choice("CustomMovie", "Cutscenes", "Screen", ["Original", "High Resolution"]),
  );
  return fields;
}

export function usersvFields(gameId: NativeGameId): NativeFieldSpec[] {
  if (isVolumeTwo(gameId)) {
    const controllers = ["PlayStation 5", "PlayStation 4", "Xbox", "Nintendo Switch", "Keyboard"];
    if (gameId === "mgs4") controllers.push("Automatic");
    const fields = [
    volume("SndMasterVol", "Master Volume", 5, 1), toggle("SndMute", "Mute master", "Sound", 6),
    choice("CtrlType", "Control Type", "Controls", controllers, gameId === "mgs4" ? 5 : 2, 0),
    { ...toggle("WindowMode", "Windowed Mode", "Screen", 3),
      options: [{ value: false, label: "Borderless Window" }, { value: true, label: "Windowed" }],
    },
    raw("WindowSizeW", "Window width", "Screen", 4), raw("WindowSizeH", "Window height", "Screen", 5),
    ];
    if (gameId === "mgspw") fields.push(choice("WindowSizeMode", "Window Size", "Screen", ["Auto", "1280 x 720", "1920 x 1080", "2560 x 1440", "3840 x 2160"], 1, 19));
    if (gameId === "mgs4") fields.push(
    volume("SndVolBGM", "BGM Volume", 5, 9), toggle("SndMuteBGM", "Mute music", "Sound", 10),
    volume("SndVolSE", "Sound Effect Volume", 5, 13), toggle("SndMuteSE", "Mute sound effects", "Sound", 14),
    volume("SndVolVoise", "Voice Volume", 5, 11),
    );
    return fields;
  }
  const fields: NativeFieldSpec[] = [
    choice("CtrlType", "Control Type", "Controls", ["PlayStation 5", "PlayStation 4", "Xbox", "Nintendo Switch", "Keyboard"], 2, 2),
    volume("SndMasterVol", "Game Volume", 10, 3), toggle("SndMute", "Mute game", "Sound", 8),
    toggle("WindowMode", "Windowed Mode", "Screen", 5),
    raw("WindowSizeW", "Window width", "Screen", 6), raw("WindowSizeH", "Window height", "Screen", 7),
  ];
  if (gameId === "mg12") fields.push(
    choice("WallType", "Wallpaper", "Screen", ["Off", "Type 1", "Type 2", "Type 3", "Type 4", "Type 5", "Type 6"], 1, 0),
    choice("WallAlign", "Screen position", "Screen", ["Center", "Align Left", "Align Right"], 0, 1),
  );
  if (gameId === "mgs2" || gameId === "mgs3") fields.push(
    { ...choice("HiresoRender", "Internal Resolution", "Screen", ["Original", "FHD", "WQHD", "4K"], 0, 11),
      description: "Sets Custom preset. WQHD and 4K require the native high-resolution texture DLC. Keep Original when MGSHDFix manages rendering." },
    choice("HiresoUpScale", "Internal Upscaling", "Screen", ["Default", "FHD", "WQHD", "4K"], 0, 12),
    choice("HiresoMovie", "Movie", "Screen", ["Original", "High Resolution"], 0, 13),
    { ...choice("HiresoTexture", "Texture resolution", "Screen", ["Original", "High Resolution"], 0, 14),
      readOnly: true, description: "Requires the native launcher's DLC availability check." },
  );
  return fields;
}

export const mgs1WindowFields: NativeFieldSpec[] = [toggle("BOOT_FULLSCREEN", "Start fullscreen", "Screen")];

export function validateNativeValue(spec: NativeFieldSpec, value: SettingValue): number {
  if (spec.readOnly) throw new Error(`${spec.label} is read-only`);
  if (spec.kind === "toggle") {
    if (typeof value !== "boolean") throw new Error(`${spec.label} requires a boolean`);
    return value ? 1 : 0;
  }
  if (typeof value !== "number" || !Number.isInteger(value)) throw new Error(`${spec.label} requires an integer`);
  if (spec.options && !spec.options.some(option => option.value === value)) throw new Error(`Invalid ${spec.label} choice`);
  if (spec.min !== undefined && value < spec.min || spec.max !== undefined && value > spec.max) throw new Error(`${spec.label} is out of range`);
  return value;
}

export function nativeField(spec: NativeFieldSpec, value: number): SettingField {
  const field = {
    id: spec.id, label: spec.label, category: spec.category === "Sound" ? "Audio" : spec.category === "Controls" ? "Button Icons" : spec.category,
    kind: spec.kind, description: spec.description, options: spec.options,
    min: spec.min, max: spec.max, step: spec.step, readOnly: spec.readOnly,
  };
  const supported = Number.isInteger(value) && (spec.kind !== "toggle" || value === 0 || value === 1)
    && (!spec.options || spec.options.some(option => option.value === (spec.kind === "toggle" ? value === 1 : value)))
    && (spec.min === undefined || value >= spec.min) && (spec.max === undefined || value <= spec.max);
  if (!supported) return { ...field, kind: "text", value: String(value), readOnly: true, description: "This native value is outside the verified choices. It will be preserved." };
  return { ...field, value: spec.kind === "toggle" ? value === 1 : value,
    defaultValue: spec.readOnly ? undefined : spec.kind === "toggle" ? spec.defaultValue === 1 : spec.defaultValue };
}

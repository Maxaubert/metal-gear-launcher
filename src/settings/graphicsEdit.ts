import type { GameSettings, SettingField, SettingsChange, SettingsSection, SettingValue } from "@shared/settings";

const key = (section: string, field: string) => `${section}\n${field}`;

/** Preserve explicit preset intent and the displayed values when an edit selects Custom. */
export function graphicsEdit(settings: GameSettings | null, changes: Record<string, SettingsChange>, section: SettingsSection,
  field: SettingField, value: SettingValue, selectCustom = true): Record<string, SettingsChange> | undefined {
  if (section.kind !== "native" || field.readOnly) return undefined;
  const presetSection = settings?.sections.find(source => source.kind === "native" && source.fields.some(item => item.id === "HiresoPreset"));
  const preset = presetSection?.fields.find(item => item.id === "HiresoPreset");
  if (!preset || !presetSection || preset.readOnly) return undefined;
  if (section.id === presetSection.id && field.id === preset.id) {
    const graphicsIds = new Set(preset.options?.flatMap(option => Object.keys(option.fieldValues ?? {})));
    const nativeIds = new Set(settings!.sections.filter(source => source.kind === "native").map(source => source.id));
    if (!selectCustom || Object.values(changes).some(change => nativeIds.has(change.sectionId) && graphicsIds.has(change.fieldId))) {
      // Child-only requests select Custom in the backend. Retain the chosen preset,
      // including a return to the saved value. Restore Defaults also needs this
      // intent before it stages the individual defaults in subsequent updates.
      return { ...changes, [key(section.id, field.id)]: { sectionId: section.id, fieldId: field.id, value } };
    }
    return undefined;
  }
  if (!selectCustom) return undefined;
  const selected = changes[key(presetSection.id, preset.id)]?.value ?? preset.value;
  if (selected === 2) return undefined;
  const projection = preset.options?.find(option => option.value === selected)?.fieldValues;
  if (!projection || projection[field.id] === undefined) return undefined;
  const next = { ...changes, [key(presetSection.id, preset.id)]: { sectionId: presetSection.id, fieldId: preset.id, value: 2 } };
  for (const source of settings!.sections.filter(item => item.kind === "native")) {
    for (const item of source.fields) {
      if (item.readOnly || projection[item.id] === undefined) continue;
      next[key(source.id, item.id)] = { sectionId: source.id, fieldId: item.id, value: projection[item.id]! };
    }
  }
  next[key(section.id, field.id)] = { sectionId: section.id, fieldId: field.id, value };
  return next;
}

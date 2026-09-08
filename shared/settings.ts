import { z } from "zod";

export const settingsGameId = z.enum(["mg12", "mgs1", "mgs2", "mgs3", "mgs4", "mgspw"]);
export const settingValue = z.union([z.string().max(256), z.number().finite(), z.boolean()]);
export type SettingValue = z.infer<typeof settingValue>;
export type SettingField = {
  id: string;
  label: string;
  description?: string;
  category: string;
  value: SettingValue;
  defaultValue?: SettingValue;
  kind: "choice" | "range" | "toggle" | "text";
  options?: { value: SettingValue; label: string; fieldValues?: Record<string, SettingValue> }[];
  min?: number;
  max?: number;
  step?: number;
  readOnly?: boolean;
};
export type SettingsSection = {
  id: string;
  title: string;
  kind: "native" | "patch";
  status: "ready" | "needsSetup" | "unsupported";
  message?: string;
  version?: string;
  fields: SettingField[];
};
export type GameSettings = {
  gameId: z.infer<typeof settingsGameId>;
  accountId?: string;
  accounts: { id: string; label: string }[];
  revision: string;
  sections: SettingsSection[];
};
export const settingsReadRequest = z.object({
  gameId: settingsGameId,
  accountId: z.string().regex(/^\d{17}$/).optional(),
}).strict();
export const settingsChange = z.object({
  sectionId: z.string().min(1).max(100),
  fieldId: z.string().min(1).max(200),
  value: settingValue,
}).strict();
export type SettingsChange = z.infer<typeof settingsChange>;
export const saveSettingsRequest = settingsReadRequest.extend({
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  changes: z.array(settingsChange).max(500),
  initializeSectionIds: z.array(z.string().min(1).max(100)).max(20).optional(),
}).strict();
export type SaveSettingsRequest = z.infer<typeof saveSettingsRequest>;

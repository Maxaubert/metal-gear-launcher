export type PreparedSettingsWrite = {
  path: string;
  original: Buffer | null;
  updated: Buffer;
};

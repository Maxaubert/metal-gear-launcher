export type BonusVolume = "vol1" | "vol2";

export interface BonusPresentation {
  volume: BonusVolume | null;
  artwork: Record<string, string>;
}

export interface BonusTrack {
  id: string;
  title: string;
  volume: BonusVolume;
  url: string;
  artworkUrl?: string;
  duration: number;
}

export interface BonusVideo extends BonusTrack {
  chapters: number[];
  language: "en" | "jp";
}

export interface BonusLibrary {
  volumes: { id: BonusVolume; installed: boolean }[];
  tracks: BonusTrack[];
  videos: BonusVideo[];
  artwork: Record<string, string>;
  warnings: string[];
}

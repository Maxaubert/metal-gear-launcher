import type { AssetRole } from "@shared/packs";
import type { SettingValue } from "@shared/settings";
import "./mg12ScreenPreview.css";

const wallpapers: AssetRole[] = ["wallpaper1", "wallpaper2", "wallpaper3", "wallpaper4", "wallpaper5", "wallpaper6"];

export default function Mg12ScreenPreview({ assetUrls, wallpaper, alignment }: {
  assetUrls: Partial<Record<AssetRole, string>>;
  wallpaper: SettingValue;
  alignment: SettingValue;
}) {
  const role = typeof wallpaper === "number" ? wallpapers[wallpaper - 1] : undefined;
  const source = role && assetUrls[role];
  const area = alignment === 1 ? "left" : alignment === 2 ? "right" : "center";
  return <div className="mg12-screen-preview" data-alignment={area} role="img"
    aria-label={`Display area ${area}, ${wallpaper === 0 ? "wallpaper off" : `wallpaper ${wallpaper}`}`}>
    {source && <img className="mg12-screen-preview-wallpaper" src={source} alt="" />}
    {assetUrls.wallpaperDisplayArea && <img className="mg12-screen-preview-area" src={assetUrls.wallpaperDisplayArea} alt="" />}
  </div>;
}

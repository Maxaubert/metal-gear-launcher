import type { GameState } from "@shared/ipc";
import HeaderArtwork from "../screens/HeaderArtwork";
import Mgs2SettingsPattern from "./Mgs2SettingsPattern";
import "./settingsOverview.css";

export default function SettingsOverviewBackdrop({ game }: { game: GameState }) {
  return <>
    {game.pack.id === "mgs1" && game.assetUrls.settingsHeader && <div className="settings-native-mgs1-header" aria-hidden="true">
      <img className="settings-year-subtitle" src={game.assetUrls.settingsHeader} alt="" />
      {game.assetUrls.settingsTimeline && <HeaderArtwork className="settings-header-rule" artwork={{
        src: game.assetUrls.settingsTimeline,
        // Keep the native active tick, barcode and rule without the surrounding timeline dates.
        crop: { x: 0, y: 335, width: 760, height: 127, sourceWidth: 760, sourceHeight: 981 },
      }} />}
    </div>}
    {game.pack.id === "mgs2" ? <Mgs2SettingsPattern
      sources={[game.assetUrls.settingsOverlay, game.assetUrls.settingsPattern2, game.assetUrls.settingsPattern3,
        game.assetUrls.settingsPattern4, game.assetUrls.settingsPattern5, game.assetUrls.settingsPattern6]} /> : game.pack.id !== "mg12" && game.assetUrls.settingsOverlay && <img
      className={`settings-overview-overlay settings-overlay-${game.pack.id}`}
      src={game.assetUrls.settingsOverlay} alt="" aria-hidden="true" />}
  </>;
}

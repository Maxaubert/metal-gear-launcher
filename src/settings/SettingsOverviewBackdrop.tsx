import type { GameState } from "@shared/ipc";
import ScreenBackdrop from "../screens/ScreenBackdrop";
import Mg12SettingsGrid from "./Mg12SettingsGrid";
import Mgs2SettingsPattern from "./Mgs2SettingsPattern";
import "./settingsOverview.css";

export default function SettingsOverviewBackdrop({ game }: { game: GameState }) {
  return <>
    <ScreenBackdrop pack={game.pack} assetUrls={game.assetUrls} />
    {game.pack.id === "mg12" ? <Mg12SettingsGrid mask={game.assetUrls.settingsOverlay}
      coarse={game.assetUrls.settingsGrid} fine={game.assetUrls.settingsGridFine}
      gradation={game.assetUrls.settingsGridBase} /> : game.pack.id === "mgs2" ? <Mgs2SettingsPattern
      sources={[game.assetUrls.settingsOverlay, game.assetUrls.settingsPattern2, game.assetUrls.settingsPattern3,
        game.assetUrls.settingsPattern4, game.assetUrls.settingsPattern5, game.assetUrls.settingsPattern6]} /> : game.assetUrls.settingsOverlay && <img
      className={`settings-overview-overlay settings-overlay-${game.pack.id}`}
      src={game.assetUrls.settingsOverlay} alt="" aria-hidden="true" />}
  </>;
}

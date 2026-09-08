import type { GameState } from "@shared/ipc";
import type { CSSProperties } from "react";
import { layoutVars, themeVars } from "../theme/theme";
import SettingsOverviewBackdrop from "../settings/SettingsOverviewBackdrop";
import ScreenBackdrop from "./ScreenBackdrop";

export default function PersistentBackdrop({ game, view, detail }: {
  game: GameState;
  view: "main" | "selection" | "settings";
  detail: boolean;
}) {
  return <div className={`screen persistent-backdrop${view === "settings" ? " settings-screen" : ""}`}
    data-testid="scene-backdrop" data-game={game.pack.id} data-layout="v2" data-view={view}
    hidden={view === "settings" && detail} aria-hidden="true"
    style={{ ...themeVars(game.pack.theme), ...layoutVars(game.pack.id),
      ...(view === "settings" && game.pack.id === "mgs1" ? { "--divider-x": "62.2vw", "--col-x": "63.5vw", "--col-right": "99.4vw" } : {}),
    } as CSSProperties}>
    <ScreenBackdrop pack={game.pack} assetUrls={game.assetUrls} />
    {view === "settings" && <SettingsOverviewBackdrop game={game} />}
  </div>;
}

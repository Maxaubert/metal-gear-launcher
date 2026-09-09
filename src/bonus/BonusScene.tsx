import type { BonusPresentation } from "@shared/bonus";
import { layoutVars, themeVars } from "../theme/theme";
import BonusArtwork from "./BonusArtwork";
import "./bonus.css";

export const EMPTY_BONUS_PRESENTATION: BonusPresentation = { volume: null, artwork: {} };

export function bonusSceneVars(presentation: BonusPresentation) {
  const dark = presentation.volume !== "vol1";
  return { ...themeVars({ accent: "#756a35", ink: dark ? "#ffffff" : "#111111", paper: dark ? "#050505" : "#ffffff" }), ...layoutVars() };
}

export function BonusBackdrop({ artwork, hero, logo }: { artwork?: Record<string, string>; hero?: string; logo?: string }) {
  return <div className="bonus-backdrop" aria-hidden="true">
    <BonusArtwork className="bonus-main-art" src={hero ?? artwork?.mainVisual} />
    <BonusArtwork className="bonus-logo" src={logo ?? artwork?.logo} />
  </div>;
}

export function BonusHeader({ artwork }: { artwork?: Record<string, string> }) {
  return <><div className="bonus-right-background" aria-hidden="true"><BonusArtwork src={artwork?.rightVisual} /></div>
    <header className="bonus-header"><BonusArtwork className="bonus-header-art" src={artwork?.header} />
      {!artwork?.header && <h1>BONUS CONTENT</h1>}</header></>;
}

export default function BonusScene({ presentation }: { presentation: BonusPresentation }) {
  return <div className="bonus-screen bonus-home bonus-selection-scene" data-art-volume={presentation.volume ?? "none"}>
    <BonusBackdrop artwork={presentation.artwork} />
    {!presentation.artwork.mainVisual && <div className="bonus-empty-art"><span>METAL GEAR</span><strong>BONUS<br />CONTENT</strong></div>}
    <BonusHeader artwork={presentation.artwork} />
  </div>;
}

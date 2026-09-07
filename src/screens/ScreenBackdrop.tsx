import type { CSSProperties } from "react";
import type { GameState } from "@shared/ipc";
import type { Pack } from "@shared/packs";

// D2 (round 5): per-pack override of `.main-visual`'s box so the key art can bleed past the
// bottom edge like the originals (spec 4.7's `visualFit` pack field). `undefined` when the pack
// omits the field, so the shared `.main-visual` CSS rule's own defaults (bottom-anchored,
// 94vh/11vw/50vw) apply unchanged.
function visualFitStyle(fit: Pack["visualFit"]): CSSProperties | undefined {
  if (!fit) return undefined;
  return {
    top: fit.anchor === "top" ? 0 : "auto",
    bottom: fit.anchor === "bottom" ? 0 : "auto",
    height: `${fit.heightVh}vh`,
    left: `${fit.leftVw}vw`,
    width: `${fit.widthVw}vw`,
    objectPosition: fit.anchor === "top" ? "center top" : "center bottom",
  };
}

// D7 (round 5): the header mark block's three "serial" lines are decorative hex digits (spec
// 4.7 doesn't assign them any real meaning) - derived from the pack's own Steam app ID so
// they're stable across renders and distinct per game, rather than re-randomized on every paint.
function hexDigits(seed: number, length: number): string {
  let n = (seed >>> 0) || 1;
  let out = "";
  for (let i = 0; i < length; i++) {
    out += (n & 0xf).toString(16).toUpperCase();
    n = (Math.imul(n, 48271) + 1 + i) >>> 0;
  }
  return out;
}

export type ScreenBackdropProps = {
  pack: Pack;
  assetUrls: GameState["assetUrls"];
};

/**
 * The left-hand art and header block shared by `GameScreen` and `GameSelection` (round 6):
 * ground, background effect, logo strip, main visual (or its fallback), divider, the two ghost
 * layers, and the header (tick/year/subtitle/mark). Extracted so the two screens render the same
 * markup for the same pack/assetUrls and cannot drift apart - `GameScreen` renders it for the
 * current game, `GameSelection` for whichever entry has focus. Each screen still wraps this in
 * its own `.screen` root (different `data-testid`) and supplies whatever comes after it
 * (description+menu, or the Game Selection header+list).
 */
export default function ScreenBackdrop({ pack, assetUrls }: ScreenBackdropProps) {
  const hasLogo = Boolean(assetUrls.logo) && pack.id !== "mg12";
  const hasMainVisual = Boolean(assetUrls.mainVisual);
  // Every pack's assets array is required (min 1) to contain a mainVisual entry (tests/packs.test.ts);
  // the `!` mirrors that guarantee rather than re-checking it at render time.
  const mainVisualAsset = pack.assets.find((a) => a.role === "mainVisual")!;
  const visualStyle = visualFitStyle(pack.visualFit);
  const serialLines = [hexDigits(pack.steam.appId, 24), hexDigits(pack.steam.appId + 1, 24), hexDigits(pack.steam.appId + 2, 24)];

  return (
    <>
      <div className="ground" />

      <div key={pack.id} className="left-zone fade-in">
        {assetUrls.bgEffect && <img className="ghost-effect" src={assetUrls.bgEffect} alt="" />}
        {hasLogo ? (
          <img className="logo-strip" src={assetUrls.logo} alt={pack.title} />
        ) : (
          <div className="logo-text">{pack.shortTitle}</div>
        )}
        {hasMainVisual ? (
          <img
            className={`main-visual edge-${mainVisualAsset.edge}`}
            src={assetUrls.mainVisual}
            alt={pack.title}
            style={visualStyle}
          />
        ) : (
          <div className="main-visual-fallback">
            <span className="fallback-number">{pack.number}</span>
            <span className="fallback-hint">assets incomplete, press Y to retry extraction</span>
          </div>
        )}
      </div>

      <div className="divider" />

      <div key={`${pack.id}-ghosts`} className="fade-in">
        {assetUrls.year && <img className="ghost-timeline" src={assetUrls.year} alt="" />}
        {assetUrls.numbering && <img className="ghost-number" src={assetUrls.numbering} alt="" />}
      </div>

      <div key={`${pack.id}-head`} className="fade-in-fast">
        <header className="head">
          <span className="tick" />
          <h1 className="year">{pack.yearLabel}</h1>
          <p className="subtitle">
            {pack.subtitle.split(" / ").map((line) => (
              <span key={line}>{line}</span>
            ))}
          </p>
          <div className="mark">
            <div className="mark-text">
              <div className="mark-serial" aria-hidden="true">
                {serialLines.map((line, i) => (
                  <span key={i}>{line}</span>
                ))}
              </div>
              <div className="mark-code">
                <span className="barcode" aria-hidden="true" />
                <span className="index">[ {pack.indexLabel} ]</span>
              </div>
            </div>
            <div className="mark-accent">
              <span className="rule" aria-hidden="true" />
              <span className="bang">!</span>
              <span className="rule" aria-hidden="true" />
            </div>
          </div>
        </header>
      </div>
    </>
  );
}

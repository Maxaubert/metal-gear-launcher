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

// Per-pack override of the `.ghost-effect` wash's box (spec 4.7's MGS3 delta: a wider, fainter
// layer that bleeds across the header too). `undefined` when the pack omits `bgEffectFit`, so
// the shared `.ghost-effect` CSS rule's own defaults (2vw/2vh origin, 58vw wide, 18% opacity)
// apply unchanged - every other pack renders exactly as before.
function bgEffectFitStyle(fit: Pack["bgEffectFit"]): CSSProperties | undefined {
  if (!fit) return undefined;
  return { left: `${fit.leftVw}vw`, top: `${fit.topVh}vh`, width: `${fit.widthVw}vw`, opacity: fit.opacity };
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

type HeaderMarkProps = { serialLines: string[]; indexLabel: string };

// The header's serial-lines + barcode + index + accent "!" block (spec 4.7) - shared by the
// single header and each of a `chapters` pack's two headers (defect 4: MG1&2 repeats this mark
// once per chapter, both carrying the same pack-level `indexLabel`).
function HeaderMark({ serialLines, indexLabel }: HeaderMarkProps) {
  return (
    <div className="mark">
      <div className="mark-text">
        <div className="mark-serial" aria-hidden="true">
          {serialLines.map((line, i) => (
            <span key={i}>{line}</span>
          ))}
        </div>
        <div className="mark-code">
          <span className="barcode" aria-hidden="true" />
          <span className="index">[ {indexLabel} ]</span>
        </div>
      </div>
      <div className="mark-accent">
        <span className="rule" aria-hidden="true" />
        <span className="bang">!</span>
        <span className="rule" aria-hidden="true" />
      </div>
    </div>
  );
}

/**
 * The left-hand art and header block shared by `GameScreen` and `GameSelection` (round 6):
 * ground, background effect, logo strip, main visual (or its fallback), divider, the two ghost
 * layers, and the header (tick/year/subtitle/mark). Extracted so the two screens render the same
 * markup for the same pack/assetUrls and cannot drift apart - `GameScreen` renders it for the
 * current game, `GameSelection` for whichever entry has focus. Each screen still wraps this in
 * its own `.screen` root (different `data-testid`) and supplies whatever comes after it
 * (description+menu, or the Game Selection header+list).
 *
 * A pack with `chapters` (defect 4: MG1&2) is structurally different - two stacked key-art
 * panels instead of one logo strip + main visual, and this component also renders both chapters'
 * headers and descriptions (normally `GameScreen`'s job) so the whole two-year block stays one
 * data-driven unit instead of special-casing `pack.id` in two places.
 */
export default function ScreenBackdrop({ pack, assetUrls }: ScreenBackdropProps) {
  const hasChapters = Boolean(pack.chapters);
  const hasLogo = Boolean(assetUrls.logo) && !hasChapters;
  const hasMainVisual = Boolean(assetUrls.mainVisual);
  // Every pack's assets array is required (min 1) to contain a mainVisual entry (tests/packs.test.ts);
  // the `!` mirrors that guarantee rather than re-checking it at render time.
  const mainVisualAsset = pack.assets.find((a) => a.role === "mainVisual")!;
  const visualStyle = visualFitStyle(pack.visualFit);
  const bgEffectStyle = bgEffectFitStyle(pack.bgEffectFit);
  const serialLines = [hexDigits(pack.steam.appId, 24), hexDigits(pack.steam.appId + 1, 24), hexDigits(pack.steam.appId + 2, 24)];

  return (
    <>
      <div className="ground" />

      <div key={pack.id} className="left-zone fade-in">
        {assetUrls.bgEffect && <img className="ghost-effect" src={assetUrls.bgEffect} alt="" style={bgEffectStyle} />}
        {hasChapters ? (
          <>
            {pack.chapters!.map((chapter, i) => {
              const src = i === 0 ? assetUrls.mainVisual : assetUrls.mainVisual2;
              return (
                <div className={`chapter-panel chapter-panel-${i}`} key={chapter.gameTitle}>
                  {src && <img className="chapter-visual" src={src} alt={chapter.gameTitle} />}
                  <div className="chapter-logo">{chapter.gameTitle}</div>
                </div>
              );
            })}
          </>
        ) : (
          <>
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
          </>
        )}
      </div>

      <div className="divider" />

      <div key={`${pack.id}-ghosts`} className="fade-in">
        {assetUrls.year && <img className="ghost-timeline" src={assetUrls.year} alt="" />}
        {assetUrls.numbering && <img className="ghost-number" src={assetUrls.numbering} alt="" />}
      </div>

      {hasChapters ? (
        <div key={`${pack.id}-chapters`} className="chapters fade-in-fast">
          {pack.chapters!.map((chapter) => (
            <div className="chapter-block" key={chapter.gameTitle}>
              <header className="head">
                <span className="tick" />
                <h1 className="year">{chapter.yearLabel}</h1>
                <p className="subtitle">
                  <span>{chapter.title}</span>
                </p>
                <HeaderMark serialLines={serialLines} indexLabel={pack.indexLabel} />
              </header>
              <p className="description chapter-description">{chapter.description}</p>
            </div>
          ))}
        </div>
      ) : (
        <div key={`${pack.id}-head`} className="fade-in-fast">
          <header className="head">
            <span className="tick" />
            <h1 className="year">{pack.yearLabel}</h1>
            <p className="subtitle">
              {pack.subtitle.split(" / ").map((line) => (
                <span key={line}>{line}</span>
              ))}
            </p>
            <HeaderMark serialLines={serialLines} indexLabel={pack.indexLabel} />
          </header>
        </div>
      )}
    </>
  );
}

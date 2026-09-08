import { useEffect, useId, useState, type CSSProperties, type RefObject } from "react";
import type { GameState } from "@shared/ipc";
import "./startupSplash.css";

type Props = {
  games: GameState[];
  error: string;
  actions: string[];
  selectedAction: number;
  buttonRefs: RefObject<(HTMLButtonElement | null)[]>;
  onFocusAction: (index: number) => void;
  onRecover: (index: number) => void;
};

export default function StartupSplash({ games, error, actions, selectedAction, buttonRefs, onFocusAction, onRecover }: Props) {
  const logoInkFilter = useId();
  const brand = games.find(game => game.pack.id === "mgs1" && game.assetUrls.logo)
    ?? games.find(game => game.assetUrls.logo);
  const source = brand?.assetUrls.logo;
  const [logo, setLogo] = useState<{ source: string; width: number; height: number }>();

  useEffect(() => {
    if (!source) return;
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (!cancelled && image.naturalWidth && image.naturalHeight) {
        setLogo({ source, width: image.naturalWidth, height: image.naturalHeight });
      }
    };
    image.src = source;
    return () => { cancelled = true; image.onload = null; };
  }, [source]);

  const loaded = logo?.source === source ? logo : undefined;
  const portrait = Boolean(loaded && loaded.height > loaded.width);
  const logoStyle = loaded ? {
    "--logo-ratio": portrait ? loaded.width / loaded.height : loaded.height / loaded.width,
  } as CSSProperties : undefined;

  return <main className="startup-screen startup-splash" data-testid="startup-screen" data-error={Boolean(error)} aria-busy={!error}>
    <svg className="startup-filters" aria-hidden="true" focusable="false">
      <defs>
        {/* Keep the original red lettering, removing the neutral halo baked into the menu strip. */}
        <filter id={logoInkFilter} colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  1 -1 0 0 0" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
      </defs>
    </svg>
    <div className="startup-frame" aria-hidden="true" />
    <section className="startup-content" aria-label="MGS Master Hub startup">
      <div className="startup-brand" data-loaded={Boolean(loaded)} style={logoStyle}>
        <div className="startup-brand-fallback" aria-hidden="true">METAL GEAR</div>
        {loaded && <img className="startup-logo" data-portrait={portrait} data-original-colors={brand?.pack.id === "mgs1"}
          style={brand?.pack.id === "mgs1" ? { filter: `url("#${logoInkFilter}")` } : undefined}
          src={loaded.source} alt={brand?.pack.title ?? "Metal Gear"} />}
      </div>
      <h1 className="startup-title">MGS MASTER HUB</h1>
      <div className="startup-status">
        <div className="startup-loading-rail" aria-hidden="true"><span /></div>
        <p role={error ? "alert" : "status"}>{error || "Preparing your games"}</p>
        {!error && <p className="startup-detail">Artwork, settings and audio</p>}
      </div>
      {error && <div className="startup-actions">
        {actions.map((label, index) => <button key={label}
          ref={button => { buttonRefs.current[index] = button; }}
          className={selectedAction === index ? "focused" : undefined}
          onFocus={() => onFocusAction(index)} onMouseEnter={() => onFocusAction(index)} onClick={() => onRecover(index)}>{label}</button>)}
      </div>}
    </section>
  </main>;
}

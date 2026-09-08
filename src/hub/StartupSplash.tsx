import { useState, type RefObject } from "react";
import neutralWordmark from "../assets/neutral-wordmark.png";
import "./startupSplash.css";

type Props = {
  exiting: boolean;
  error: string;
  actions: string[];
  selectedAction: number;
  buttonRefs: RefObject<(HTMLButtonElement | null)[]>;
  onFocusAction: (index: number) => void;
  onRecover: (index: number) => void;
};

export default function StartupSplash({ exiting, error, actions, selectedAction, buttonRefs, onFocusAction, onRecover }: Props) {
  const [logoFailed, setLogoFailed] = useState(false);

  return <main className="startup-screen startup-splash" data-testid="startup-screen" data-error={Boolean(error)} data-exiting={exiting} aria-busy={!error}>
    <div className="startup-frame" aria-hidden="true" />
    <section className="startup-content" aria-label="MGS Master Hub startup">
      <div className="startup-brand">
        {logoFailed ? <div className="startup-brand-fallback">METAL GEAR SOLID</div>
          : <img className="startup-logo" src={neutralWordmark} alt="Metal Gear Solid" draggable={false}
            fetchPriority="high" onError={() => setLogoFailed(true)} />}
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

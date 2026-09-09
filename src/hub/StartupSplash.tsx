import { useState, type RefObject } from "react";
import neutralWordmark from "../assets/neutral-wordmark.png";
import "./startupSplash.css";
import type { PreparationProgress } from "@shared/preparation";

type Props = {
  exiting: boolean;
  progress: number;
  error: string;
  actions: string[];
  selectedAction: number;
  buttonRefs: RefObject<(HTMLButtonElement | null)[]>;
  onFocusAction: (index: number) => void;
  onRecover: (index: number) => void;
  preparation?: PreparationProgress;
};

export default function StartupSplash({ exiting, progress, error, actions, selectedAction, buttonRefs, onFocusAction, onRecover, preparation }: Props) {
  const [logoFailed, setLogoFailed] = useState(false);
  const extracting = preparation && preparation.phase !== "ready";
  const determinate = preparation?.phase === "preparing" && preparation.total > 0;
  const percentage = preparation?.phase === "ready" && preparation.total > 0 ? 100
    : determinate ? Math.min(99, Math.floor(preparation.completed / preparation.total * 100)) : progress;

  return <main className="startup-screen startup-splash" data-testid="startup-screen" data-error={Boolean(error)} data-exiting={exiting} aria-busy={!error}>
    <section className="startup-content" aria-label="Metal Gear Launcher startup">
      <div className="startup-brand">
        {logoFailed ? <div className="startup-brand-fallback">METAL GEAR SOLID</div>
          : <img className="startup-logo" src={neutralWordmark} alt="Metal Gear Solid" draggable={false}
            fetchPriority="high" onError={() => setLogoFailed(true)} />}
      </div>
      <h1 className="startup-title">METAL GEAR LAUNCHER</h1>
      <div className="startup-status">
        {!error && <div className="startup-loading-rail" role="progressbar" aria-label={extracting ? "Preparing installed content" : "Hub startup"}
          data-indeterminate={Boolean(extracting && !determinate)} aria-valuetext={extracting ? preparation.label : undefined}
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={extracting && !determinate ? undefined : percentage}>
          <span style={{ transform: `scaleX(${percentage / 100})` }} />
        </div>}
        <p role={error ? "alert" : "status"}>{error || (extracting ? "Preparing your library" : "Preparing your games")}</p>
        {extracting && <div className="startup-preparation-details" data-testid="library-preparation">
          <p className="startup-preparation-item">{preparation.label}</p>
          {determinate && <p className="startup-preparation-count">{preparation.completed.toLocaleString()} / {preparation.total.toLocaleString()} items <strong>{percentage}%</strong></p>}
          {!error && <p className="startup-preparation-note">Preparing installed content before you enter. Completed files are kept if the app is interrupted.</p>}
          {error && preparation.failures.length > 0 && <p className="startup-preparation-failure">{preparation.failures[0]?.error}</p>}
        </div>}
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

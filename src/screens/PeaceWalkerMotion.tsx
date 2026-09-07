import { useEffect, useState } from "react";
import type { GameState } from "@shared/ipc";

const DURATION_SECONDS = 40 + 1 / 60;
const ROLES = ["reticle1", "reticle2", "reticle3"] as const;

/** Original reticle and mecha loops, sharing a clock across menu navigation. */
export default function PeaceWalkerMotion({ assetUrls }: { assetUrls: GameState["assetUrls"] }) {
  const [visible, setVisible] = useState(() => typeof document === "undefined" || !document.hidden);
  const [phase] = useState(() => performance.now() / 1000);
  useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  return <div className="pw-motion" aria-hidden="true" data-paused={!visible}>
    {assetUrls.bgEffect && <div className="mech-backdrop">
      {[0, 1, 2].map(index => <div key={index} className={`mech-frame mech-frame-${index + 1}`}
        style={{ animationDelay: `-${(phase + index * 3) % 9}s` }}>
        <img src={assetUrls.bgEffect} alt="" style={{ animationDelay: `-${(phase + index * 3) % 9}s` }} />
      </div>)}
    </div>}
    <div className="reticle-backdrop">
      {ROLES.map((role, index) => assetUrls[role] && <img
        key={role} className={`reticle reticle-${index + 1}`} src={assetUrls[role]} alt=""
        style={{ animationDuration: `${DURATION_SECONDS}s`, animationDelay: `-${phase % DURATION_SECONDS}s` }}
      />)}
    </div>
  </div>;
}

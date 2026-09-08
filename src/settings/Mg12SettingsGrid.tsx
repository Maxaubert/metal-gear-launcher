import type { CSSProperties } from "react";

/** Original GridUI tiles, clipped by the launcher's separate screen-space alpha mask. */
export default function Mg12SettingsGrid({ mask, coarse, fine, gradation }: {
  mask?: string;
  coarse?: string;
  fine?: string;
  gradation?: string;
}) {
  if (!mask || !coarse || !fine) return null;
  return <>
    {gradation && <img className="mg12-settings-grid-backing" src={gradation} alt="" aria-hidden="true" />}
    <div className="mg12-settings-grid" aria-hidden="true" style={{
      maskImage: `url("${mask}")`,
      "--grid-coarse": `url("${coarse}")`,
      "--grid-fine": `url("${fine}")`,
    } as CSSProperties}>
      <div className="mg12-settings-grid-tiles" />
    </div>
  </>;
}

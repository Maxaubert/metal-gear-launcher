import type { GameState } from "@shared/ipc";

export type ExtractProgress = { completed: number; total: number; failed: number };

export type FirstRunProps = {
  games: GameState[];
  steamPath: string | null;
  progress: Record<string, ExtractProgress>;
  focusIndex: number;
  extracting: boolean;
  onPickFolder: () => void;
  onStart: () => void;
  onFocusItem: (index: number) => void;
};

/**
 * Shown instead of the hub while any installed game has no cached assets yet, or its
 * cache is stale. Lists a progress bar per installed game and a "Start" row that kicks
 * off `extract("all")`; when Steam couldn't be found, a folder-picker row appears above it.
 */
export default function FirstRun({ games, steamPath, progress, focusIndex, extracting, onPickFolder, onStart, onFocusItem }: FirstRunProps) {
  const rows: { label: string; onSelect: () => void }[] = [];
  if (!steamPath) rows.push({ label: "Locate Steam folder", onSelect: onPickFolder });
  rows.push({ label: extracting ? "Extracting..." : "Start", onSelect: onStart });

  const installed = games.filter((g) => g.installed);

  return (
    <div className="screen-root">
      {/* A separate, absolutely-positioned layer: `.dots` carries its own opacity, which
          would otherwise wash out the text if applied to the container that holds it. */}
      <div className="dots" style={{ position: "absolute", inset: 0 }} />
      <div
        style={{
          position: "relative", height: "100%",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "2rem",
        }}
      >
        <h1 style={{ fontSize: "2rem", margin: 0, fontWeight: 700 }}>Preparing your games</h1>
        {!steamPath && (
          <p style={{ fontSize: "1rem", margin: 0, maxWidth: "40rem", textAlign: "center" }}>
            Steam could not be found automatically. Point the hub at your Steam folder to continue.
          </p>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", width: "40rem" }}>
          {installed.map((g) => {
            const p = progress[g.pack.id];
            const pct = p && p.total > 0 ? Math.round((p.completed / p.total) * 100) : g.stale ? 0 : 100;
            return (
              <div key={g.pack.id}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "1rem" }}>
                  <span>{g.pack.shortTitle}</span>
                  <span>{pct}%</span>
                </div>
                <div style={{ height: "0.5rem", background: "color-mix(in srgb, var(--ink) 15%, transparent)" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: "var(--accent)" }} />
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", width: "20rem" }}>
          {rows.map((row, index) => (
            <div
              key={row.label}
              role="button"
              tabIndex={-1}
              aria-current={index === focusIndex ? "true" : undefined}
              className={index === focusIndex ? "focused" : undefined}
              onClick={row.onSelect}
              onPointerMove={(event) => { if (event.pointerType !== "touch") onFocusItem(index); }}
              onFocus={() => onFocusItem(index)}
              style={{
                height: "3rem", display: "flex", alignItems: "center", justifyContent: "center",
                border: "1px solid color-mix(in srgb, var(--ink) 40%, transparent)", cursor: "pointer", fontSize: "1.1rem",
              }}
            >
              {row.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

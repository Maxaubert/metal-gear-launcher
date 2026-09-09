import { useEffect, useState } from "react";
import type { HubState } from "@shared/ipc";
import type { PreparationProgress } from "@shared/preparation";

const incompleteMessage = "Some content could not be prepared. Retry to finish the remaining files.";

/** Menus wait for the persistent preparation pass; quitting the app can safely interrupt it. */
export function useLibraryPreparation(steamPath: string | null | undefined) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ path: string; ready: boolean; progress?: PreparationProgress; error: string; hub?: HubState }>({ path: "", ready: false, error: "" });
  useEffect(() => {
    if (!steamPath) return;
    let active = true;
    const off = window.hub.onPreparationProgress(progress => {
      if (active) setState(previous => progress.phase === "ready" && previous.path === steamPath && previous.ready
        ? { ...previous, progress }
        : { path: steamPath, ready: false, error: progress.phase === "failed" ? incompleteMessage : "", progress });
    });
    void window.hub.prepareLibrary().then(async result => {
      if (!active) return;
      if (!result.ok) throw new Error(result.error);
      if (!result.value.ready) throw new Error(incompleteMessage);
      const refreshed = await window.hub.getState();
      if (!refreshed.ok) throw new Error(refreshed.error);
      if (active) setState(previous => ({ ...previous, path: steamPath, ready: true, error: "", hub: refreshed.value }));
    }).catch(reason => {
      if (active) setState(previous => ({ ...previous, path: steamPath, ready: false, error: reason instanceof Error ? reason.message : String(reason) }));
    });
    return () => { active = false; off(); };
  }, [steamPath, attempt]);
  const current = state.path === steamPath;
  return {
    ready: !steamPath || current && state.ready,
    progress: current ? state.progress : undefined,
    error: current ? state.error : "",
    hub: current ? state.hub : undefined,
    retry() { setState({ path: steamPath ?? "", ready: false, error: "" }); setAttempt(value => value + 1); },
  };
}

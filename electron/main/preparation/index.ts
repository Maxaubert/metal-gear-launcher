import type { PreparationFailure, PreparationProgress, PreparationResult } from "@shared/preparation";
import { getBonusLibrary } from "../bonus/library";
import { planBooks } from "../books/prepare";
import { inspectLibrary, type PreparationInventory } from "./discovery";
import { planGames } from "./games";
import { planBonus } from "./bonus";
import { cacheStamps, changedCacheFiles, readSnapshot, writeSnapshot, type PreparationSnapshot } from "./snapshot";
import type { PreparationTask } from "./types";

interface Plan { tasks: PreparationTask[]; failures: PreparationFailure[] }
interface PreparationDependencies {
  inspect: typeof inspectLibrary;
  plan: (inventory: PreparationInventory, dataDir: string, previous: PreparationSnapshot | undefined, changed: string[], progress: (completed: number, total: number, label: string) => void) => Promise<Plan>;
  finalize: (steamPath: string | null, dataDir: string) => Promise<PreparationFailure[]>;
}
const defaults: PreparationDependencies = {
  inspect: inspectLibrary,
  plan: async (inventory, dataDir, previous, changed, progress) => {
    // Keep bonus preparation sequential with its readers; BonusCache owns each volume's decode work.
    const games = await planGames(inventory, dataDir, previous, changed);
    const books = await planBooks(inventory.books, dataDir, progress);
    const bonus = await planBonus(inventory.bonus, dataDir);
    return { tasks: [...games, ...bonus.tasks, ...books.tasks], failures: [...books.failures, ...bonus.failures] };
  },
  finalize: async (steamPath, dataDir) => (await getBonusLibrary(steamPath, dataDir)).warnings.map((error, index) => ({ id: `bonus:verification:${index}`, label: "Bonus Content", error })),
};
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);

export function createPreparationService(deps: PreparationDependencies = defaults) {
  const running = new Map<string, { promise: Promise<PreparationResult>; listeners: Set<(progress: PreparationProgress) => void>; latest: PreparationProgress }>();
  return function prepare(steamPath: string | null, dataDir: string, onProgress: (progress: PreparationProgress) => void): Promise<PreparationResult> {
    const key = JSON.stringify([steamPath, dataDir]);
    const existing = running.get(key);
    if (existing) {
      existing.listeners.add(onProgress);
      try { onProgress(existing.latest); } catch { /* The prior subscriber can still finish preparation. */ }
      return existing.promise;
    }
    const listeners = new Set([onProgress]);
    let latest: PreparationProgress = { phase: "discovering", completed: 0, total: 0, label: "Checking installed content", failures: [] };
    const emit = (progress: PreparationProgress) => {
      latest = progress;
      const state = running.get(key); if (state) state.latest = progress;
      for (const listener of listeners) { try { listener(progress); } catch { /* A closed window must not interrupt cache preparation. */ } }
    };
    const promise = (async (): Promise<PreparationResult> => {
      let completed = 0; let total = 0; const failures: PreparationFailure[] = [];
      try {
        emit(latest);
        const inventory = await deps.inspect(steamPath, dataDir);
        const previous = await readSnapshot(dataDir);
        const changed = await changedCacheFiles(dataDir, previous);
        if (previous && previous.fingerprint === inventory.fingerprint && !changed.length) {
          const result = { ready: true, warm: true, completed: previous.total, total: previous.total, failures: [] };
          emit({ phase: "ready", completed: result.total, total: result.total, label: "Your library is ready", failures: [] });
          return result;
        }
        emit({ phase: "planning", completed: 0, total: 0, label: "Reading installed content indexes", failures: [] });
        const plan = await deps.plan(inventory, dataDir, previous, changed, (done, count, label) => emit({ phase: "planning", completed: done, total: count, label, failures: [] }));
        failures.push(...plan.failures);
        total = plan.tasks.reduce((count, task) => count + (task.units ?? 1), 0);
        emit({ phase: "preparing", completed, total, label: "Preparing your library", failures: [...failures] });
        let next = 0;
        await Promise.all(Array.from({ length: Math.min(4, plan.tasks.length) }, async () => {
          for (;;) {
            const task = plan.tasks[next++]; if (!task) return;
            const units = task.units ?? 1; let finished = 0;
            const unitDone = () => { if (finished >= units) return; finished++; completed++; emit({ phase: "preparing", completed, total, label: task.label, failures: [...failures] }); };
            try { await task.run(unitDone); }
            catch (error) { failures.push({ id: task.id, label: task.label, error: errorText(error) }); }
            while (finished < units) unitDone();
          }
        }));
        emit({ phase: "verifying", completed, total, label: "Verifying prepared files", failures: [...failures] });
        failures.push(...await deps.finalize(steamPath, dataDir));
        if (!failures.length) {
          const current = await deps.inspect(steamPath, dataDir);
          if (current.fingerprint !== inventory.fingerprint) throw new Error("An installation changed during preparation. Retry to prepare its updated content.");
          const files = await cacheStamps(dataDir, inventory.cacheRoots);
          await writeSnapshot(dataDir, { version: 1, fingerprint: inventory.fingerprint, sources: inventory.sources, files, total });
        }
      } catch (error) { failures.push({ id: "library", label: "Library preparation", error: errorText(error) }); }
      const ready = failures.length === 0;
      emit({ phase: ready ? "ready" : "failed", completed, total, label: ready ? "Your library is ready" : "Some content could not be prepared", failures });
      return { ready, warm: false, completed, total, failures };
    })();
    running.set(key, { promise, listeners, latest });
    void promise.finally(() => running.delete(key)).catch(() => undefined);
    return promise;
  };
}

export const prepareLibrary = createPreparationService();

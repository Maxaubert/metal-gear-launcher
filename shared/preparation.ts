export interface PreparationFailure { id: string; label: string; error: string }
export interface PreparationProgress {
  phase: "discovering" | "planning" | "preparing" | "verifying" | "ready" | "failed";
  completed: number;
  total: number;
  label: string;
  failures: PreparationFailure[];
}
export interface PreparationResult {
  ready: boolean;
  warm: boolean;
  completed: number;
  total: number;
  failures: PreparationFailure[];
}

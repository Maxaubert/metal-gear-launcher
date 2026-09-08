export interface PreparationTask {
  id: string;
  label: string;
  units?: number;
  run: (unitDone: () => void) => Promise<void>;
}

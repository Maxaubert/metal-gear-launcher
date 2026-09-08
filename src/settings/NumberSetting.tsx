import type { SettingField } from "@shared/settings";

export default function NumberSetting({ field, value, disabled, onCommit }: {
  field: SettingField; value: number; disabled: boolean; onCommit: (value: number) => void;
}) {
  return <input type="number" aria-label={field.label} defaultValue={value} disabled={disabled}
    min={field.min} max={field.max} step={field.step}
    onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
    onBlur={(event) => {
      const input = event.currentTarget;
      if (Number.isFinite(input.valueAsNumber) && input.validity.valid) onCommit(input.valueAsNumber);
      else input.value = String(value);
    }} />;
}

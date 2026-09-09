import type { SettingField } from "@shared/settings";

/** Keep partial words local until the user finishes editing the field. */
export default function TextSetting({ field, value, disabled, onCommit }: {
  field: SettingField;
  value: string;
  disabled: boolean;
  onCommit: (value: string) => void;
}) {
  return <input aria-label={field.label} defaultValue={value} disabled={disabled}
    onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }}
    onBlur={event => { if (event.currentTarget.value !== value) onCommit(event.currentTarget.value); }} />;
}

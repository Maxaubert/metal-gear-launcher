import type { SettingValue } from "@shared/settings";

export default function ControllerPreview({ value, label }: { value: SettingValue; label: string }) {
  if (value === 5) return <span>{label === "Automatic" ? "Auto" : label}</span>;
  const playstation = value === 0 || value === 1;
  const keyboard = value === 4;
  const keys = keyboard ? ["Enter", "Q", "E", "Esc"]
    : [playstation ? "×" : "A", playstation ? "L1" : value === 3 ? "L" : "LB", playstation ? "L2" : value === 3 ? "ZL" : "LT", "≡"];
  return <span className="controller-preview" role="img" aria-label={label}>
    {keys.map((key, index) => <span key={index} className={keyboard ? "keyboard-key" : index === 0 || index === 3 ? "round-key" : "shoulder-key"}>{key}</span>)}
  </span>;
}

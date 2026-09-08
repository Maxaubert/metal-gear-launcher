import type { InputKind } from "../input/useNavigation";

type Hint = { glyph: string | readonly string[]; label: string };

export const HINTS_GAMEPAD = [
  { glyph: "L", label: "Move cursor" },
  { glyph: "A", label: "Confirm" },
  { glyph: "B", label: "Back" },
] as const satisfies readonly Hint[];
export const HINTS_OTHER: readonly Hint[] = [
  { glyph: ["↑", "↓"], label: "Move cursor" },
  { glyph: "Enter", label: "Confirm" },
  { glyph: "Esc", label: "Back" },
];

export type FooterHintsProps = { lastInputKind: InputKind };

type ControlHintProps = FooterHintsProps & {
  keyboard: string | readonly string[];
  gamepad: string;
  label: string;
};

/** Key legends use the shape of the active input device, independent of game fonts. */
export function ControlHint({ lastInputKind, keyboard, gamepad, label }: ControlHintProps) {
  const controller = lastInputKind === "gamepad";
  const keys = typeof keyboard === "string" ? [keyboard] : keyboard;
  return <span className="control-hint">
    <span className="control-hint-keys">
      {controller ? <i className="control-gamepad">{gamepad}</i>
        : keys.map((key) => <kbd className="control-keycap" key={key}>{key}</kbd>)}
    </span>
    <span>{label}</span>
  </span>;
}

/** Shared footer keeps game and selection controls on the same baseline. */
export default function FooterHints({ lastInputKind }: FooterHintsProps) {
  return (
    <footer className="hints">
      {HINTS_OTHER.map((hint, index) => (
        <ControlHint key={hint.label} lastInputKind={lastInputKind} keyboard={hint.glyph}
          gamepad={HINTS_GAMEPAD[index]!.glyph} label={hint.label} />
      ))}
    </footer>
  );
}

import type { InputKind } from "../input/useNavigation";

type Hint = { glyph: string; label: string };

export const HINTS_GAMEPAD: readonly Hint[] = [
  { glyph: "L", label: "Move cursor" },
  { glyph: "A", label: "Confirm" },
  { glyph: "B", label: "Back" },
];
export const HINTS_OTHER: readonly Hint[] = [
  { glyph: "↕", label: "Arrows" },
  { glyph: "⏎", label: "Enter" },
  { glyph: "Esc", label: "Back" },
];

export type FooterHintsProps = { lastInputKind: InputKind };

/** The bottom-right control hints (spec 4.7), shared by `GameScreen` and `GameSelection` (round
 * 6) so both stay in sync on the same glyphs/labels. */
export default function FooterHints({ lastInputKind }: FooterHintsProps) {
  const hints = lastInputKind === "gamepad" ? HINTS_GAMEPAD : HINTS_OTHER;
  return (
    <footer className="hints">
      {hints.map((h) => (
        <span key={h.label}>
          <i className="glyph">{h.glyph}</i>
          {h.label}
        </span>
      ))}
    </footer>
  );
}

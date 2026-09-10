export type QuitDialogProps = {
  quitItem: number;
  onQuitSelect: (index: number) => void;
  onHoverQuitItem: (index: number) => void;
};

export default function QuitDialog({ quitItem, onQuitSelect, onHoverQuitItem }: QuitDialogProps) {
  return <div className="overlay">
    <div className="overlay-panel" role="dialog" aria-modal="true" aria-label="Quit game">
      {(["Quit", "Cancel"] as const).map((label, index) => (
        <div
          key={label}
          role="button"
          tabIndex={-1}
          aria-current={quitItem === index ? "true" : undefined}
          className={quitItem === index ? "focused" : undefined}
          onClick={() => onQuitSelect(index)}
          onPointerMove={(event) => { if (event.pointerType !== "touch") onHoverQuitItem(index); }}
          onFocus={() => onHoverQuitItem(index)}
          style={{ height: "3rem", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--ink)", cursor: "pointer" }}
        >
          {label}
        </div>
      ))}
    </div>
  </div>;
}

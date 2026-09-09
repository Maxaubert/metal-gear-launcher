import { useLayoutEffect, useRef } from "react";
import "./unavailableDialog.css";

export default function UnavailableDialog({ title, message, onClose }: { title: string; message: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  return <dialog ref={dialog} className="unavailable-dialog" data-testid="unavailable-dialog" aria-labelledby="unavailable-title" aria-describedby="unavailable-message"
    onCancel={event => { event.preventDefault(); onClose(); }} onKeyDownCapture={event => {
      // Keep menu shortcuts behind the modal inactive while native Tab focus stays inside it.
      event.stopPropagation();
      if (["Enter", "Space", "Escape", "Backspace"].includes(event.code)) { event.preventDefault(); if (!event.repeat) onClose(); }
    }}>
    <h2 id="unavailable-title">{title}</h2>
    <p id="unavailable-message">{message}</p>
    <button onClick={onClose}>OK</button>
  </dialog>;
}

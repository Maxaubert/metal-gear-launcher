import { useLayoutEffect, type MutableRefObject } from "react";
import type { Action } from "../input/navigationReducer";

export type BonusActionRef = MutableRefObject<((action: Action) => void) | null>;

export function useBonusActions(ref: BonusActionRef, action: (value: Action) => void) {
  useLayoutEffect(() => { ref.current = action; return () => { ref.current = null; }; });
}

export function mediaTime(seconds: number) {
  const time = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(time / 60).toString().padStart(2, "0")}:${(time % 60).toString().padStart(2, "0")}`;
}

export function numberedTrack(title: string, index: number) {
  return `${String(index + 1).padStart(2, "0")} ${title.replace(/^\d{1,2}[ ._-]+/, "")}`;
}

export function stopMedia(media: HTMLMediaElement) {
  media.pause();
  media.removeAttribute("src");
  media.load();
}

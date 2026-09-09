import { useCallback, useRef, useState } from "react";
import type { BonusPlaylist } from "@shared/bonusPlaylist";
import { EMPTY_BONUS_PRESENTATION } from "./BonusScene";

async function decodeArtwork(url: string): Promise<void> {
  const image = new Image();
  image.src = url;
  let timer: ReturnType<typeof setTimeout>;
  await Promise.race([image.decode(), new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Bonus artwork could not be decoded")), 15000);
  })]).finally(() => clearTimeout(timer));
}

/** Prepare the selection scene and playlist once, behind the startup screen. */
export function useBonusResources() {
  const [presentation, setPresentation] = useState(EMPTY_BONUS_PRESENTATION);
  const [playlist, setPlaylist] = useState<BonusPlaylist>([]);
  const request = useRef<Promise<void> | null>(null);
  const preload = useCallback(() => {
    request.current ??= Promise.all([
      window.hub.getBonusPresentation().then(async result => {
        if (!result.ok) return;
        const artwork: Record<string, string> = {};
        await Promise.all(Object.entries(result.value.artwork).map(async ([key, url]) => {
          try { await decodeArtwork(url); artwork[key] = url; } catch { /* The neutral scene covers unavailable art. */ }
        }));
        setPresentation({ ...result.value, artwork });
      }).catch(() => {}),
      window.hub.getBonusPlaylist().then(result => { if (result.ok) setPlaylist(result.value); }).catch(() => {}),
    ]).then(() => {});
    return request.current;
  }, []);
  return { presentation, playlist, preload };
}

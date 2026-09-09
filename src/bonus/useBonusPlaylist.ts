import { useEffect, useRef, useState } from "react";
import type { BonusPlaylist } from "../../shared/bonusPlaylist";
import { BonusPlaylistPlayer, type BonusPlaylistState } from "./bonusPlaylistPlayer";

interface Options { playlist: BonusPlaylist; active: boolean; suspended: boolean; volume: number }

export function useBonusPlaylist({ playlist, active, suspended, volume }: Options): BonusPlaylistState {
  const player = useRef<BonusPlaylistPlayer | null>(null);
  const [state, setState] = useState<BonusPlaylistState>({ unavailable: true });
  useEffect(() => {
    const audio = new Audio();
    audio.id = "bonus-playlist";
    audio.hidden = true;
    document.body.appendChild(audio);
    const transport = new BonusPlaylistPlayer(audio, setState);
    player.current = transport;
    return () => { transport.dispose(); audio.remove(); player.current = null; };
  }, []);
  useEffect(() => { player.current?.setPlaylist(playlist); }, [playlist]);
  useEffect(() => { player.current?.setPlayback(active, suspended, volume); }, [active, suspended, volume]);
  return state;
}

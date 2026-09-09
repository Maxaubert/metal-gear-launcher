export type PlayerIconName = "play" | "pause" | "previous" | "next" | "repeat" | "shuffle";
export default function PlayerIcon({ name }: { name: PlayerIconName }) {
  return <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    {name === "play" && <path d="M12 5 43 24 12 43Z" fill="currentColor" />}
    {name === "pause" && <path d="M10 6h10v36H10zm18 0h10v36H28z" fill="currentColor" />}
    {name === "previous" && <path d="M25 8 5 24l20 16V8zm20 0L25 24l20 16V8z" fill="currentColor" />}
    {name === "next" && <path d="m3 8 20 16L3 40V8zm20 0 20 16-20 16V8z" fill="currentColor" />}
    {name === "repeat" && <g fill="none" stroke="currentColor" strokeWidth="5"><path d="M7 23V10h31M41 25v13H10" /><path d="m31 3 9 7-9 7M17 31l-9 7 9 7" /></g>}
    {name === "shuffle" && <g fill="none" stroke="currentColor" strokeWidth="5"><path d="M3 10h7c12 0 12 28 26 28h8M3 38h7c12 0 12-28 26-28h8" /><path d="m35 3 9 7-9 7m0 14 9 7-9 7" /></g>}
  </svg>;
}

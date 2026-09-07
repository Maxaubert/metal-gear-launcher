import { useEffect, useMemo, useState } from "react";

type Frame = { source: string; timeMs: number; visible: boolean };
type Pose = { frame: number; x: number; y: number; scale: number; visible: boolean; cycle: number };
const STILL: Pose = { frame: 6, x: 29, y: 69, scale: .65, visible: true, cycle: 0 };

/** Native line-pattern sprite animation with TitleDNAController's randomized placement. */
export default function Mgs2SettingsPattern({ sources }: { sources: readonly (string | undefined)[] }) {
  const [phase1, phase2, phase3, phase4, phase5, phase6] = sources;
  const frames = useMemo<Frame[]>(() => {
    if (!phase1) return [];
    const images = [phase1, phase2, phase3, phase4, phase5, phase6];
    // DNAtypeL runs at speed 20: source keys 0..60 span 3000 ms.
    return [[0, 0], [50, 1], [100, 2], [150, 3], [200, 4], [250, 5], [300, 6],
      [2700, 5], [2750, 4], [2800, 3], [2850, 2], [2900, 1], [2950, 0]]
      .map(([timeMs, phase]) => ({ timeMs: timeMs!, source: images[Math.max(0, phase! - 1)] ?? phase1, visible: phase !== 0 }));
  }, [phase1, phase2, phase3, phase4, phase5, phase6]);
  const durationMs = 3000;
  const [motion, setMotion] = useState(() => !document.hidden && !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [pose, setPose] = useState<Pose>({ ...STILL, visible: false });
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setMotion(!document.hidden && !media.matches);
    document.addEventListener("visibilitychange", update);
    media.addEventListener("change", update);
    return () => {
      document.removeEventListener("visibilitychange", update);
      media.removeEventListener("change", update);
    };
  }, []);
  useEffect(() => {
    if (!motion || frames.length === 0) return;
    setPose((previous) => ({ ...previous, frame: 0, visible: false, cycle: 0 }));
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const later = (callback: () => void, delay: number) => {
      const timer = setTimeout(() => { timers.delete(timer); callback(); }, delay);
      timers.add(timer);
    };
    let cycle = 0;
    const play = () => {
      const current = ++cycle;
      setPose({ frame: 0, x: Math.random() * 100, y: Math.random() * 100,
        scale: .5 + Math.random() * .5, visible: false, cycle: current });
      frames.forEach((frame, index) => {
        if (index > 0) later(() => setPose((previous) => previous.cycle === current
          ? { ...previous, frame: index, visible: frame.visible } : previous), frame.timeMs);
      });
      later(() => setPose((previous) => previous.cycle === current ? { ...previous, visible: false } : previous), durationMs);
      // Native Line events alternate two families every 2..3 s; this family repeats every 4..6 s.
      later(play, 4000 + Math.random() * 1000 + Math.random() * 1000);
    };
    later(play, 2000);
    return () => { timers.forEach(clearTimeout); };
  }, [motion, frames, durationMs]);
  const shown = motion ? pose : STILL;
  const source = frames[shown.frame]?.source;
  return source && <img className="mgs2-settings-pattern" src={source} alt="" aria-hidden="true"
    data-testid="mgs2-settings-pattern" data-motion={motion ? "running" : "paused"} data-cycle={shown.cycle} data-frame={shown.frame}
    style={{ left: `${shown.x}vw`, top: `${shown.y}vh`,
      transform: `translate(-50%, -50%) scale(${shown.scale})`, opacity: shown.visible ? shown.scale : 0 }} />;
}

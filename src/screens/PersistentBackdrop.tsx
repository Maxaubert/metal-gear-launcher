import { useLayoutEffect, useRef, useState } from "react";
import type { GameState } from "@shared/ipc";
import type { BonusPresentation } from "@shared/bonus";
import BonusScene, { bonusSceneVars } from "../bonus/BonusScene";
import { layoutVars, themeVars } from "../theme/theme";
import SettingsOverviewBackdrop from "../settings/SettingsOverviewBackdrop";
import ScreenBackdrop from "./ScreenBackdrop";
import "./selectionMotion.css";

const WIPE_DURATION = 360;
export type BackdropScene = { kind: "game"; game: GameState } | { kind: "bonus"; presentation: BonusPresentation };
type Layer = { key: number; scene: BackdropScene };
const sceneId = (scene: BackdropScene) => scene.kind === "game" ? `game:${scene.game.pack.id}` : `bonus:${scene.presentation.volume ?? "none"}`;

export default function PersistentBackdrop({ scene, view, detail }: {
  scene: BackdropScene;
  view: "main" | "selection" | "settings";
  detail: boolean;
}) {
  const [layers, setLayers] = useState<Layer[]>([{ key: 0, scene }]);
  const nodes = useRef(new Map<number, HTMLDivElement>());
  const animations = useRef(new Map<number, Animation>());
  const deadline = useRef<number | null>(null);
  const current = layers[layers.length - 1]!;
  if (sceneId(current.scene) !== sceneId(scene)) {
    const next = { key: current.key + 1, scene };
    setLayers(view === "selection" ? [...layers, next] : [next]);
  }

  useLayoutEffect(() => {
    const activeAnimations = animations.current;
    const finish = () => {
      for (const animation of activeAnimations.values()) {
        animation.onfinish = null;
        animation.cancel();
      }
      activeAnimations.clear();
      deadline.current = null;
      setLayers(value => value.length > 1 ? [value[value.length - 1]!] : value);
    };
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (layers.length < 2 || view !== "selection" || media.matches) { finish(); return; }

    // Keep each interrupted layer at its visible wipe position. A new layer starts
    // above that composition, so previously unrevealed artwork cannot flash through.
    for (const animation of activeAnimations.values()) {
      animation.onfinish = null;
      animation.pause();
    }
    deadline.current ??= performance.now() + WIPE_DURATION;
    const remaining = deadline.current - performance.now();
    if (remaining <= 0) { finish(); return; }
    // React can restart this effect for the same layer (for example when pointer
    // input changes the footer). Resume its wipe instead of replacing the map entry
    // and leaving an untracked, paused clip mask behind on the same DOM node.
    const existing = activeAnimations.get(current.key);
    const animation = existing ?? nodes.current.get(current.key)?.animate([
      { clipPath: "inset(0 100% 0 0)" },
      { clipPath: "inset(0 0% 0 0)" },
    ], { duration: remaining, easing: "cubic-bezier(.22,.8,.25,1)", fill: "both" });
    if (!animation) { finish(); return; }
    if (existing) animation.play();
    activeAnimations.set(current.key, animation);
    animation.onfinish = finish;
    // A held key cannot keep old layers alive by restarting the deadline.
    const timer = window.setTimeout(finish, remaining);
    const reduce = () => { if (media.matches) finish(); };
    media.addEventListener("change", reduce);
    return () => {
      animation.onfinish = null;
      if (activeAnimations.get(current.key) === animation) animation.pause();
      window.clearTimeout(timer);
      media.removeEventListener("change", reduce);
    };
  }, [current.key, layers, view]);

  useLayoutEffect(() => {
    const activeAnimations = animations.current;
    return () => { for (const animation of activeAnimations.values()) animation.cancel(); };
  }, []);

  return <>{layers.map(layer => {
    const outgoing = layer.key !== current.key;
    const displayed = outgoing ? layer.scene : scene;
    const game = displayed.kind === "game" ? displayed.game : undefined;
    const layerView = outgoing ? "selection" : view;
    return <div key={layer.key}
      ref={node => { if (node) nodes.current.set(layer.key, node); else nodes.current.delete(layer.key); }}
      className={`screen persistent-backdrop${outgoing ? " scene-outgoing" : ""}${layerView === "settings" ? " settings-screen" : ""}`}
      data-testid={outgoing ? "outgoing-scene" : "scene-backdrop"} data-game={game?.pack.id ?? "bonus"} data-layout="v2" data-view={layerView}
      hidden={outgoing ? view !== "selection" : view === "settings" && detail} aria-hidden="true"
      style={displayed.kind === "bonus" ? bonusSceneVars(displayed.presentation) : { ...themeVars(displayed.game.pack.theme), ...layoutVars(displayed.game.pack.id) }}>
      {displayed.kind === "bonus" ? <BonusScene presentation={displayed.presentation} /> : <ScreenBackdrop pack={displayed.game.pack} assetUrls={displayed.game.assetUrls} />}
      {layerView === "settings" && game && <SettingsOverviewBackdrop game={game} />}
    </div>;
  })}</>;
}

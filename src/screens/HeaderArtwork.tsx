import { useId } from "react";

type Rect = { x: number; y: number; width: number; height: number };
export type HeaderArtworkSource = {
  src: string;
  crop?: Rect & { sourceWidth: number; sourceHeight: number; cutout?: Rect };
};

/** Atlas regions use the same layout boxes as standalone extracted header images. */
export default function HeaderArtwork({ artwork, className, label = "" }: {
  artwork: HeaderArtworkSource; className?: string; label?: string;
}) {
  const maskId = useId();
  const { src, crop } = artwork;
  if (!crop) return <img className={className} src={src} alt={label} />;
  return <svg className={className} viewBox={`${crop.x} ${crop.y} ${crop.width} ${crop.height}`}
    width={crop.width} height={crop.height} role="img" aria-label={label || undefined} aria-hidden={!label || undefined}>
    {crop.cutout && <defs><mask id={maskId} maskUnits="userSpaceOnUse" x={0} y={0} width={crop.sourceWidth} height={crop.sourceHeight}>
      <rect width={crop.sourceWidth} height={crop.sourceHeight} fill="white" />
      <rect {...crop.cutout} fill="black" />
    </mask></defs>}
    <image href={src} width={crop.sourceWidth} height={crop.sourceHeight} mask={crop.cutout ? `url(#${maskId})` : undefined} />
  </svg>;
}

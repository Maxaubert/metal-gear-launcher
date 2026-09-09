import { useState } from "react";

export default function BonusArtwork({ src, className, alt = "" }: { src?: string; className?: string; alt?: string }) {
  const [failed, setFailed] = useState<string>();
  return src && failed !== src ? <img className={className} src={src} alt={alt} draggable={false} onError={() => setFailed(src)} /> : null;
}

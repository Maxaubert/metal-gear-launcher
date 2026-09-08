import type { CSSProperties } from "react";
import type { GameState } from "@shared/ipc";
import { MGS1_LABEL_SPRITES, mgs1Typography } from "./mgs1Typography";
import "./mgs1NativeText.css";

type Props = { assetUrls: GameState["assetUrls"]; text: string; sprite?: string; className?: string; scale?: number; bitmapOnly?: boolean };

/** Original static launcher lettering, or the native English bitmap font for dynamic text. */
export default function Mgs1NativeText({ assetUrls, text, sprite, className = "", scale = 1, bitmapOnly = false }: Props) {
  const typography = mgs1Typography(assetUrls);
  const id = sprite ?? (!bitmapOnly ? MGS1_LABEL_SPRITES[text] : undefined);
  const item = id && typography?.text?.sprites[id];
  if (item && typography?.text && assetUrls.nativeTextAtlas) {
    const unit = scale * 100 / 1920;
    const style = { width: `${item.width * unit}vw`, height: `${item.height * unit}vw`,
      maskImage: `url("${assetUrls.nativeTextAtlas}")`, maskSize: `${typography.text.width * unit}vw ${typography.text.height * unit}vw`,
      maskPosition: `${-item.x * unit}vw ${-item.y * unit}vw` } satisfies CSSProperties;
    return <span className={`mgs1-native-text mgs1-native-sprite ${className}`} data-native-sprite={id} role="img" aria-label={text} style={style} />;
  }
  const font = typography?.font;
  if (!font || !assetUrls.nativeFontAtlas) return <span className={className} data-native-font="fallback">{text}</span>;
  const atlas = assetUrls.nativeFontAtlas;
  return <span className={`mgs1-native-text mgs1-native-bitmap ${className}`} data-native-font="tsukugo" role="img" aria-label={text}>
    {text.split(/(\s+)/u).map((word, wordIndex) => /^\s+$/u.test(word)
      ? <span aria-hidden="true" key={wordIndex}>{[...word].map((space, index) => space === "\n" ? <br key={index} />
        : <span key={index} style={{ display: "inline-block", width: `${(font.glyphs[" "]?.advance ?? font.size / 4) / font.size}em` }} />)}</span>
      : <span className="mgs1-native-word" aria-hidden="true" key={wordIndex}>{[...word].map((character, index) => {
        const glyph = font.glyphs[character];
        if (!glyph) return <span key={index} data-native-font="fallback">{character}</span>;
        return <span className="mgs1-native-advance" key={index} style={{ width: `${glyph.advance / font.size}em` }}>
          <span className="mgs1-native-glyph" style={{ width: `${glyph.width / font.size}em`, height: `${glyph.height / font.size}em`,
            left: `${glyph.bearingX / font.size}em`, bottom: `${(glyph.bearingY - glyph.height) / font.size}em`,
            maskImage: `url("${atlas}")`, maskSize: `${font.width / font.size}em ${font.height / font.size}em`,
            maskPosition: `${-glyph.x / font.size}em ${-glyph.y / font.size}em` }} />
        </span>;
      })}</span>)}
  </span>;
}

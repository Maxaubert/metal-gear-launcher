import { useEffect, useRef, useState, type RefObject } from "react";
import type { BookPage, BookLanguage } from "@shared/books";
import NativeBookText from "./NativeBookText";

export default function BookViewport({ page, zoom, language, viewport }: { page: BookPage; zoom: number; language: BookLanguage; viewport: RefObject<HTMLDivElement | null> }) {
  const [size, setSize] = useState({ width: 1, height: 1 });
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const hasText = page.columns.some(column => column.markup.trim());
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const resize = () => setSize({ width: element.clientWidth, height: element.clientHeight });
    const observer = new ResizeObserver(resize);
    observer.observe(element); resize();
    return () => observer.disconnect();
  }, [viewport]);
  useEffect(() => { if (viewport.current) viewport.current.scrollTo(0, 0); }, [page.page, viewport]);
  const leaves = Array.from({ length: 4 }, (_, index) => ({
    index,
    columns: [page.columns.find(column => column.id === `TextAreaA${index}`), page.columns.find(column => column.id === `TextAreaB${index}`)],
  })).filter(leaf => leaf.index < 2 || leaf.columns.some(column => column?.markup));
  return <div className="book-viewport" ref={viewport} data-testid="book-page" tabIndex={0} aria-label={`Book page ${page.page + 1}`}
    onPointerDown={event => {
      if (zoom <= 1 || event.button !== 0 || event.target instanceof HTMLButtonElement) return;
      drag.current = { x: event.clientX, y: event.clientY, left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop };
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={event => {
      if (!drag.current) return;
      event.currentTarget.scrollLeft = drag.current.left - (event.clientX - drag.current.x);
      event.currentTarget.scrollTop = drag.current.top - (event.clientY - drag.current.y);
    }}
    onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
    style={{ cursor: zoom > 1 ? "grab" : undefined }}>
    {hasText ? <article className="book-screenplay" lang={language === "jp" ? "ja" : "en"} style={{ width: zoom === 1 ? "100%" : size.width * zoom, minHeight: size.height, paddingInline: size.width * zoom * .07, fontSize: `${Math.max(18, size.width / 90) * zoom}px`, backgroundImage: page.imageUrl ? `url("${page.imageUrl}")` : undefined }}>
      <h2>{page.title}</h2>
      <div className="book-script-leaves">{leaves.map(leaf => <section className="book-script-leaf" key={leaf.index} aria-label={`${leaf.index % 2 ? "Right" : "Left"} page`}>
        {page.artworkUrls[leaf.index] && <img className="book-script-art" src={page.artworkUrls[leaf.index]} alt="" draggable={false} />}
        <div className="book-script-columns">{leaf.columns.map((column, index) => <div className="book-script-column" key={column?.id ?? index}><NativeBookText markup={column?.markup ?? ""} /></div>)}</div>
      </section>)}</div>
    </article> : <div className="book-image-canvas" style={{ width: size.width * zoom, height: size.height * zoom }}>
      {page.imageUrl && <img className="book-spread" src={page.imageUrl} alt={page.title || `Page ${page.page + 1}`} draggable={false} />}
      {page.artworkUrls.some(Boolean) && <div className="book-art-spread">{page.artworkUrls.map((url, index) => url ? <img key={`${index}-${url}`} src={url} alt={`${index ? "Right" : "Left"} page`} draggable={false} /> : <div key={index} />)}</div>}
    </div>}
  </div>;
}

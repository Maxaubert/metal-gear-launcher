import { useEffect, useRef, useState } from "react";
import type { BonusLibrary, BonusVideo } from "@shared/bonus";
import { BonusHints, type BonusContentScreenProps } from "./BonusContentScreen";
import { BonusBackdrop, BonusHeader } from "./BonusScene";
import { playMenuSound } from "../audio/menuSounds";
import { mediaTime, useBonusActions } from "./bonusMedia";
import BonusArtwork from "./BonusArtwork";
import BonusVideoPlayer from "./BonusVideoPlayer";

export default function BonusVideos(props: BonusContentScreenProps & { library: BonusLibrary }) {
  const { library, actionRef, onClose, lastInputKind } = props;
  const [focus, setFocus] = useState(0);
  const [selected, setSelected] = useState<BonusVideo>();
  const [chapter, setChapter] = useState<number>();
  if (selected && chapter !== undefined) return <BonusVideoPlayer {...props} video={selected} startTime={chapter} onClose={() => setChapter(undefined)} />;
  if (selected) return <BonusChapters {...props} video={selected} onClose={() => setSelected(undefined)} onPlay={setChapter} />;
  return <BonusVideoList library={library} actionRef={actionRef} onClose={onClose} lastInputKind={lastInputKind} volume={props.volume}
    focus={focus} setFocus={setFocus} select={setSelected} />;
}

function videoKeys(library: BonusLibrary, video: BonusVideo | undefined) {
  const ordinal = video?.id.includes("BD2") ? 2 : 1;
  const suffix = `${ordinal}${video?.language ?? "en"}`;
  return { hero: library.artwork[`video${ordinal}`], logo: library.artwork[`videoLogo${suffix}`], banner: library.artwork[`banner${suffix}`] };
}

function BonusVideoList({ library, actionRef, onClose, lastInputKind, focus, setFocus, select }: BonusContentScreenProps & {
  library: BonusLibrary; focus: number; setFocus: (index: number) => void; select: (video: BonusVideo) => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  const focusRef = useRef(focus);
  const focused = library.videos[focus];
  const { hero, logo } = videoKeys(library, focused);
  const move = (index: number) => { if (index !== focusRef.current) { void playMenuSound("navigate"); focusRef.current = index; setFocus(index); } };
  const open = (index: number) => { const video = library.videos[index]; if (video) { void playMenuSound("select"); select(video); } };
  useBonusActions(actionRef, action => {
    if (action === "back") { void playMenuSound("back"); onClose(); }
    else if (action === "up" || action === "down") move((focusRef.current + (action === "up" ? -1 : 1) + library.videos.length) % library.videos.length);
    else if (action === "confirm") open(focusRef.current);
  });
  useEffect(() => { list.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "nearest" }); }, [focus]);
  return <main className="bonus-screen bonus-videos" data-testid="bonus-videos-screen">
    <BonusBackdrop artwork={library.artwork} hero={hero} logo={logo} />
    <BonusHeader artwork={library.artwork} />
    <h1 className="bonus-video-heading">Video</h1>
    <div className="bonus-video-list" ref={list} aria-label="Videos">
      {library.videos.map((video, index) => <button key={video.id} data-testid={`bonus-video-${video.id}`} aria-label={video.title}
        aria-current={focus === index ? "true" : undefined} onPointerMove={() => move(index)} onFocus={() => move(index)} onClick={() => open(index)}>
        <BonusArtwork src={videoKeys(library, video).banner} />
        {!videoKeys(library, video).banner && <span>{video.title}</span>}
      </button>)}
      {!library.videos.length && <p>No installed videos were found.</p>}
    </div>
    <BonusHints lastInputKind={lastInputKind} onBack={() => { void playMenuSound("back"); onClose(); }} />
  </main>;
}

function BonusChapters({ library, video, actionRef, lastInputKind, onClose, onPlay }: BonusContentScreenProps & {
  library: BonusLibrary; video: BonusVideo; onPlay: (seconds: number) => void;
}) {
  const [focus, setFocus] = useState(0);
  const focusRef = useRef(0);
  const list = useRef<HTMLDivElement>(null);
  const chapters = [...new Set([0, ...video.chapters])].filter(time => time >= 0 && time < video.duration).sort((a, b) => a - b);
  const { hero, logo } = videoKeys(library, video);
  const move = (index: number) => { if (index !== focusRef.current) { void playMenuSound("navigate"); focusRef.current = index; setFocus(index); } };
  const open = (index: number) => { void playMenuSound("select"); onPlay(chapters[index] ?? 0); };
  useBonusActions(actionRef, action => {
    if (action === "back") { void playMenuSound("back"); onClose(); }
    else if (action === "up" || action === "down") move((focusRef.current + (action === "up" ? -1 : 1) + chapters.length) % chapters.length);
    else if (action === "confirm") open(focusRef.current);
  });
  useEffect(() => { list.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "nearest" }); }, [focus]);
  return <main className="bonus-screen bonus-videos bonus-chapters" data-testid="bonus-chapters-screen">
    <BonusBackdrop artwork={library.artwork} hero={hero} logo={logo} /><BonusHeader artwork={library.artwork} />
    <h1 className="bonus-video-heading">Chapters</h1>
    <div className="bonus-chapter-list" ref={list} aria-label={`${video.title} chapters`}>
      {chapters.map((time, index) => <button key={time} aria-current={focus === index ? "true" : undefined}
        onPointerMove={() => move(index)} onFocus={() => move(index)} onClick={() => open(index)}>
        <span>{index === 0 ? "Start from beginning" : `Chapter ${String(index + 1).padStart(2, "0")}`}</span><time>{mediaTime(time)}</time>
      </button>)}
    </div><BonusHints lastInputKind={lastInputKind} onBack={() => { void playMenuSound("back"); onClose(); }} />
  </main>;
}

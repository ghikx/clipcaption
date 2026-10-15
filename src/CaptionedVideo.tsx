import { useMemo } from "react";
import {
  AbsoluteFill,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import "./fonts";
import { remapCaptions, type Segment } from "./segments";
import { STYLES, type CaptionStyle, type StyleName } from "./styles";
import { paginate, type Page, type Word } from "./words";

export type CaptionedVideoProps = {
  // Chemin relatif au dossier public/. Vide = fond dégradé (aperçu sans vidéo).
  videoSrc: string;
  // Timestamps dans le temps de la vidéo source.
  captions: Word[];
  // Portions gardées (silences coupés), alignées sur les frames. null = vidéo entière.
  segments: Segment[] | null;
  style: StyleName;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
};

export const CaptionedVideo: React.FC<CaptionedVideoProps> = ({ videoSrc, captions, segments, style }) => {
  const { fps } = useVideoConfig();
  const s: CaptionStyle = STYLES[style];

  const pages = useMemo(
    () =>
      paginate(segments ? remapCaptions(captions, segments) : captions, {
        combineWithinMs: s.combineWithinMs,
        maxWords: s.maxWords,
      }),
    [captions, segments, s.combineWithinMs, s.maxWords],
  );

  return (
    <AbsoluteFill style={{ background: "linear-gradient(160deg, #1e293b 0%, #0f172a 55%, #312e81 100%)" }}>
      {videoSrc ? <Footage src={staticFile(videoSrc)} segments={segments} /> : null}
      {pages.map((page, i) => {
        const next = pages[i + 1];
        const startFrame = Math.floor((page.startMs / 1000) * fps);
        // Un écran reste affiché jusqu'au suivant, sans dépasser 1,5 s après son dernier mot.
        const endMs = Math.min(next ? next.startMs : Infinity, page.endMs + 1500);
        const endFrame = Math.ceil((endMs / 1000) * fps);
        if (endFrame <= startFrame) return null;
        return (
          <Sequence key={i} from={startFrame} durationInFrames={endFrame - startFrame} layout="none">
            <PageView page={page} s={s} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

// Monte les segments bout à bout : chaque segment est un extrait de la source placé
// juste après le précédent.
const Footage: React.FC<{ src: string; segments: Segment[] | null }> = ({ src, segments }) => {
  const { fps } = useVideoConfig();
  if (!segments) return <OffthreadVideo src={src} />;
  let outFrame = 0;
  return (
    <>
      {segments.map((seg, i) => {
        const trimBefore = Math.round((seg.fromMs / 1000) * fps);
        const length = Math.round((seg.toMs / 1000) * fps) - trimBefore;
        const from = outFrame;
        outFrame += length;
        return (
          <Sequence key={i} from={from} durationInFrames={length}>
            <OffthreadVideo src={src} trimBefore={trimBefore} />
          </Sequence>
        );
      })}
    </>
  );
};

// Pseudo-aléatoire déterministe : le même mot obtient toujours le même angle et la
// même couleur, d'une frame à l'autre et d'un rendu à l'autre.
const rand = (seed: number) => {
  let t = (seed * 2654435761) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const PageView: React.FC<{ page: Page; s: CaptionStyle }> = ({ page, s }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  // Dans une Sequence, le frame repart de 0 au début de l'écran.
  const timeMs = page.startMs + (frame / fps) * 1000;

  // Les styles où les mots arrivent un par un n'animent pas l'écran entier.
  const enter =
    s.reveal === "page" ? spring({ frame, fps, config: { damping: 14, stiffness: 220 }, durationInFrames: 8 }) : 1;
  const pageScale = interpolate(enter, [0, 1], [0.8, 1]);
  const fontSize = width * s.fontSizeRatio;

  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: height * s.verticalPosition,
          transform: `translateY(-50%) scale(${pageScale})`,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            maxWidth: width * 0.88,
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            alignItems: "center",
            // Plus d'air quand les mots grossissent, pivotent ou ont une pastille,
            // pour qu'ils ne mordent pas sur leurs voisins.
            columnGap: fontSize * (s.activeBackground || s.activeScale > 1.08 ? 0.38 : 0.25),
            rowGap: fontSize * (s.chaos ? 0.35 : 0.08),
            fontFamily: s.fontFamily,
            fontWeight: s.fontWeight,
            fontSize,
            lineHeight: 1.15,
            textAlign: "center",
            textTransform: s.uppercase ? "uppercase" : "none",
            ...(s.box
              ? {
                  backgroundColor: s.box.color,
                  borderRadius: fontSize * s.box.radiusRatio,
                  padding: `${fontSize * 0.35}px ${fontSize * 0.55}px`,
                }
              : {}),
          }}
        >
          {page.words.map((w, i) => (
            <WordView key={i} word={w} s={s} timeMs={timeMs} pageStartMs={page.startMs} fontSize={fontSize} />
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const WordView: React.FC<{ word: Word; s: CaptionStyle; timeMs: number; pageStartMs: number; fontSize: number }> = ({
  word,
  s,
  timeMs,
  pageStartMs,
  fontSize,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const text = word.text.trim();
  const state = timeMs < word.startMs ? "future" : timeMs < word.endMs ? "active" : "spoken";
  const sinceStart = frame - ((word.startMs - pageStartMs) / 1000) * fps;
  const em = word.emphasis && s.emphasis ? s.emphasis : null;

  let color = state === "future" ? s.color : state === "active" ? s.activeColor : (s.spokenColor ?? s.color);
  if (em?.color) color = em.color;

  let fontFamily: string | undefined = em?.fontFamily;
  let italic = em?.italic ?? false;
  let rotate = 0;
  let offsetY = 0;
  if (s.chaos) {
    const r = (k: number) => rand(Math.round(word.startMs) * 7 + k);
    rotate = (r(1) * 2 - 1) * s.chaos.maxRotateDeg;
    offsetY = (r(2) * 2 - 1) * 0.12;
    if (word.emphasis) {
      color = s.chaos.palette[Math.floor(r(3) * s.chaos.palette.length)];
      fontFamily = s.chaos.fonts[Math.floor(r(4) * s.chaos.fonts.length)];
      italic = fontFamily === "Instrument Serif";
    }
  }
  const serif = fontFamily === "Instrument Serif";

  // Mot prononcé : petit rebond de mise en avant.
  const pop = spring({ frame: sinceStart, fps, config: { damping: 12, stiffness: 300 }, durationInFrames: 6 });
  let scale = state === "active" ? interpolate(pop, [0, 1], [1, s.activeScale]) : 1;

  // Arrivée mot par mot (styles "spoken") : le mot surgit avec un léger dépassement.
  let visible = true;
  if (s.reveal === "spoken") {
    visible = state !== "future";
    const arrive = spring({ frame: sinceStart, fps, config: { damping: 9, stiffness: 260 }, durationInFrames: 10 });
    scale *= interpolate(arrive, [0, 1], [0.3, 1]);
    rotate *= interpolate(arrive, [0, 1], [3, 1]);
  }

  // Machine à écrire : nombre de lettres affichées proportionnel au temps écoulé dans le mot.
  let typed = text.length;
  if (s.reveal === "typewriter") {
    const progress = (timeMs - word.startMs) / Math.max(1, word.endMs - word.startMs);
    typed = state === "future" ? 0 : Math.min(text.length, Math.ceil(progress * text.length));
  }

  return (
    <span
      style={{
        display: "inline-block",
        visibility: visible ? "visible" : "hidden",
        color,
        fontFamily,
        fontWeight: em?.fontWeight ?? (serif ? 400 : undefined),
        fontStyle: italic ? "italic" : "normal",
        // Le serif italique est plus petit à corps égal : on compense.
        fontSize: `${(em?.scale ?? 1) * (serif ? 1.15 : 1)}em`,
        textTransform: em?.uppercase === undefined ? undefined : em.uppercase ? "uppercase" : "none",
        backgroundColor: state === "active" && s.activeBackground ? s.activeBackground : "transparent",
        borderRadius: fontSize * 0.18,
        padding: `0 ${fontSize * 0.12}px`,
        WebkitTextStroke: s.stroke ? `${s.stroke.ratio}em ${s.stroke.color}` : undefined,
        paintOrder: "stroke fill",
        textShadow: s.shadow ?? undefined,
        transform: `translateY(${offsetY}em) rotate(${rotate}deg) scale(${scale})`,
      }}
    >
      {typed >= text.length ? (
        text
      ) : (
        <>
          {text.slice(0, typed)}
          <span style={{ visibility: "hidden" }}>{text.slice(typed)}</span>
        </>
      )}
    </span>
  );
};

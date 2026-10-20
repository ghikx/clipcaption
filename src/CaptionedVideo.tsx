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
import { STYLES, applyOverrides, isPreset, type Animation, type CaptionStyle, type StyleName, type StyleOverrides } from "./styles";
import { paginate, type Page, type Word } from "./words";

export type CaptionedVideoProps = {
  // URL http(s) ou chemin relatif au dossier public/. Vide = fond dégradé (aperçu sans vidéo).
  videoSrc: string;
  // Timestamps dans le temps de la vidéo source.
  captions: Word[];
  // Portions gardées (silences coupés), alignées sur les frames. null = vidéo entière.
  segments: Segment[] | null;
  // Nom du style. Pour un style perso, sa définition complète est passée dans styleDef.
  style: StyleName;
  styleDef?: CaptionStyle;
  overrides?: StyleOverrides;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
};

export const CaptionedVideo: React.FC<CaptionedVideoProps> = ({ videoSrc, captions, segments, style, styleDef, overrides }) => {
  const { fps } = useVideoConfig();
  const s: CaptionStyle = useMemo(
    () => applyOverrides(styleDef ?? (isPreset(style) ? STYLES[style] : STYLES.chenek), overrides),
    [style, styleDef, overrides],
  );

  const { pages, hiddenStarts } = useMemo(() => {
    const kept = captions.filter((w) => !w.cut);
    const timed = segments ? remapCaptions(kept, segments) : kept;
    // Un mot masqué coupe le texte en morceaux paginés séparément : un écran ne regroupe
    // jamais des mots situés de part et d'autre d'un mot masqué.
    const runs: Word[][] = [[]];
    for (const w of timed) {
      if (w.hidden) runs.push([]);
      else runs[runs.length - 1].push(w);
    }
    const options = { combineWithinMs: s.combineWithinMs, maxWords: s.maxWords };
    return {
      pages: runs.flatMap((run) => (run.length ? paginate(run, options) : [])),
      hiddenStarts: timed.filter((w) => w.hidden).map((w) => w.startMs),
    };
  }, [captions, segments, s.combineWithinMs, s.maxWords]);

  return (
    <AbsoluteFill style={{ background: "linear-gradient(160deg, #1e293b 0%, #0f172a 55%, #312e81 100%)" }}>
      {videoSrc ? <Footage src={/^https?:/.test(videoSrc) ? videoSrc : staticFile(videoSrc)} segments={segments} /> : null}
      {pages.map((page, i) => {
        const next = pages[i + 1];
        const startFrame = Math.floor((page.startMs / 1000) * fps);
        // Un écran reste affiché jusqu'au suivant, sans dépasser 1,5 s après son dernier mot,
        // et disparaît dès qu'un mot masqué est prononcé (sinon il resterait à sa place).
        const hidden = hiddenStarts.find((ms) => ms >= page.endMs);
        const endMs = Math.min(next ? next.startMs : Infinity, page.endMs + 1500, hidden ?? Infinity);
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
  // La vidéo remplit le cadre : l'aperçu de l'interface est un proxy plus petit que la source.
  const fill = { width: "100%", height: "100%", objectFit: "cover" as const };
  if (!segments) return <OffthreadVideo src={src} style={fill} />;
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
            <OffthreadVideo src={src} trimBefore={trimBefore} style={fill} />
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

// Effet d'entrée, de 0 (début) à 1 (installé). Rend scale, décalage vertical (em),
// opacité et flou (px) à appliquer.
const entrance = (animation: Animation, frame: number, fps: number) => {
  if (animation === "none") return { scale: 1, y: 0, opacity: 1, blur: 0 };
  const bouncy = animation === "bounce";
  const p = spring({
    frame,
    fps,
    config: bouncy ? { damping: 7, stiffness: 220 } : { damping: 14, stiffness: 220 },
    durationInFrames: bouncy ? 14 : 9,
  });
  const fadeIn = interpolate(frame, [0, 5], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  switch (animation) {
    case "pop":
      return { scale: interpolate(p, [0, 1], [0.75, 1]), y: 0, opacity: 1, blur: 0 };
    case "bounce":
      return { scale: interpolate(p, [0, 1], [0.4, 1]), y: 0, opacity: 1, blur: 0 };
    case "fade":
      return { scale: 1, y: 0, opacity: fadeIn, blur: 0 };
    case "slide-up":
      return { scale: 1, y: interpolate(p, [0, 1], [0.6, 0]), opacity: fadeIn, blur: 0 };
    case "blur":
      return { scale: interpolate(p, [0, 1], [1.08, 1]), y: 0, opacity: fadeIn, blur: interpolate(p, [0, 1], [14, 0]) };
  }
};

const PageView: React.FC<{ page: Page; s: CaptionStyle }> = ({ page, s }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  // Dans une Sequence, le frame repart de 0 au début de l'écran.
  const timeMs = page.startMs + (frame / fps) * 1000;
  const fontSize = width * s.fontSizeRatio;
  const align = s.align ?? "center";
  // Les styles où les mots arrivent un par un animent les mots, pas l'écran.
  const e = s.reveal === "page" ? entrance(s.animation ?? "pop", frame, fps) : entrance("none", 0, fps);
  const justify = align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center";
  const margin = width * ((1 - (s.maxWidthRatio ?? 0.88)) / 2);

  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: margin,
          right: margin,
          top: height * s.verticalPosition,
          transform: `translateY(-50%) translateY(${e.y}em) scale(${e.scale})`,
          transformOrigin: align === "left" ? "left center" : align === "right" ? "right center" : "center",
          opacity: e.opacity,
          filter: e.blur ? `blur(${e.blur}px)` : undefined,
          display: "flex",
          justifyContent: justify,
          fontSize,
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: justify,
            alignItems: "center",
            // Plus d'air quand les mots grossissent, pivotent ou ont une pastille,
            // pour qu'ils ne mordent pas sur leurs voisins.
            columnGap:
              fontSize *
              (0.22 + (s.activeBackground || s.wordBackground ? 0.08 : 0) + (s.stroke ? s.stroke.ratio * 0.6 : 0) + (s.shadow ? 0.04 : 0)),
            rowGap: fontSize * (s.chaos ? 0.35 : s.wordBackground ? 0.16 : 0.08),
            fontFamily: s.fontFamily,
            fontWeight: s.fontWeight,
            fontStyle: s.italic ? "italic" : "normal",
            fontSize,
            letterSpacing: s.letterSpacing,
            lineHeight: s.lineHeight ?? 1.15,
            textAlign: align,
            textTransform: s.uppercase ? "uppercase" : "none",
            ...(s.box
              ? {
                  backgroundColor: s.box.color,
                  borderRadius: fontSize * s.box.radiusRatio,
                  padding: `${fontSize * 0.35}px ${fontSize * 0.55}px`,
                  backdropFilter: s.box.blur ? `blur(${s.box.blur}px)` : undefined,
                  WebkitBackdropFilter: s.box.blur ? `blur(${s.box.blur}px)` : undefined,
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
  const active = state === "active";
  const sinceStart = frame - ((word.startMs - pageStartMs) / 1000) * fps;
  const em = word.emphasis && s.emphasis ? s.emphasis : null;

  let color = state === "future" ? s.color : active ? s.activeColor : (s.spokenColor ?? s.color);
  if (em?.color) color = em.color;

  let fontFamily: string | undefined = em?.fontFamily;
  let italic = em?.italic ?? s.italic ?? false;
  let rotate = (active ? (s.activeRotate ?? 0) : 0) + (em?.rotate ?? 0);
  let offsetY = 0;
  if (s.chaos) {
    const r = (k: number) => rand(Math.round(word.startMs) * 7 + k);
    rotate += (r(1) * 2 - 1) * s.chaos.maxRotateDeg;
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
  let scale = active ? interpolate(pop, [0, 1], [1, s.activeScale]) : 1;
  // Le grossissement (transform) ne pousse pas les voisins : on ajoute une marge
  // proportionnelle à la longueur du mot (~0,6 em par lettre, moitié de chaque côté).
  const grow = Math.max(0, scale - 1) * text.length * 0.3 + (active && s.activeRotate ? 0.06 : 0);
  let opacity = state === "future" && s.reveal === "page" ? (s.futureOpacity ?? 1) : 1;
  let blur = 0;

  // Arrivée mot par mot (spoken / typewriter) : l'effet d'entrée s'applique au mot.
  let visible = true;
  if (s.reveal !== "page") {
    visible = state !== "future";
    const e = entrance(s.animation ?? (s.reveal === "spoken" ? "bounce" : "none"), sinceStart, fps);
    scale *= e.scale;
    offsetY += e.y;
    opacity *= e.opacity;
    blur = e.blur;
    if (s.chaos) rotate *= interpolate(e.scale, [0.4, 1], [3, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  }

  // Machine à écrire : nombre de lettres affichées proportionnel au temps écoulé dans le mot.
  let typed = text.length;
  if (s.reveal === "typewriter") {
    const progress = (timeMs - word.startMs) / Math.max(1, word.endMs - word.startMs);
    typed = state === "future" ? 0 : Math.min(text.length, Math.ceil(progress * text.length));
  }

  const background = active && s.activeBackground ? s.activeBackground : (em?.background ?? s.wordBackground ?? "transparent");
  const gradient = s.gradient && (s.gradient.target === "all" || active) ? s.gradient : null;
  const radius = fontSize * (s.wordRadiusRatio ?? 0.18);
  const padded = background !== "transparent";

  return (
    <span
      style={{
        display: "inline-block",
        visibility: visible ? "visible" : "hidden",
        color,
        opacity,
        filter: blur ? `blur(${blur}px)` : undefined,
        fontFamily,
        fontWeight: em?.fontWeight ?? (serif ? 400 : undefined),
        fontStyle: italic ? "italic" : "normal",
        // Le serif italique est plus petit à corps égal : on compense.
        fontSize: `${(em?.scale ?? 1) * (serif ? 1.15 : 1)}em`,
        textTransform: em?.uppercase === undefined ? undefined : em.uppercase ? "uppercase" : "none",
        backgroundColor: gradient ? undefined : background,
        borderRadius: radius,
        marginInline: grow ? `${grow}em` : undefined,
        padding: padded ? `0 ${fontSize * 0.14}px` : `0 ${fontSize * 0.04}px`,
        WebkitTextStroke: s.stroke ? `${s.stroke.ratio}em ${s.stroke.color}` : undefined,
        paintOrder: "stroke fill",
        textShadow: gradient ? undefined : (s.shadow ?? undefined),
        textDecoration: active && s.activeDecoration === "underline" ? "underline" : undefined,
        textDecorationThickness: "0.07em",
        textUnderlineOffset: "0.14em",
        textDecorationColor: s.activeColor,
        ...(gradient
          ? {
              backgroundImage: `linear-gradient(100deg, ${gradient.from}, ${gradient.to})`,
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
              // Le contour natif recouvrirait le dégradé (texte noir sur une police fine) :
              // on le simule avec des ombres nettes, dessinées sous le remplissage.
              WebkitTextStroke: undefined,
              filter:
                [
                  blur ? `blur(${blur}px)` : "",
                  s.stroke
                    ? [[1, 0], [-1, 0], [0, 1], [0, -1]]
                        .map(([x, y]) => `drop-shadow(${x * s.stroke!.ratio * 0.5}em ${y * s.stroke!.ratio * 0.5}em 0 ${s.stroke!.color})`)
                        .join(" ")
                    : "",
                  s.shadow ? "drop-shadow(0 0.05em 0.12em rgba(0,0,0,0.5))" : "",
                ]
                  .join(" ")
                  .trim() || undefined,
            }
          : {}),
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

import type { Caption } from "@remotion/captions";
import { createTikTokStyleCaptions, type TikTokPage } from "@remotion/captions";
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
import { STYLES, type CaptionStyle, type StyleName } from "./styles";

export type CaptionedVideoProps = {
  // Chemins relatifs au dossier public/.
  videoSrc: string;
  captions: Caption[];
  style: StyleName;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
};

export const CaptionedVideo: React.FC<CaptionedVideoProps> = ({ videoSrc, captions, style }) => {
  const { fps } = useVideoConfig();
  const s = STYLES[style];

  const pages = useMemo(
    () =>
      createTikTokStyleCaptions({
        captions,
        combineTokensWithinMilliseconds: s.combineWithinMs,
        breakOnSilenceAfterMilliseconds: 400,
      }).pages,
    [captions, s.combineWithinMs],
  );

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {videoSrc ? <OffthreadVideo src={staticFile(videoSrc)} /> : null}
      {pages.map((page, i) => {
        const next = pages[i + 1];
        const startFrame = Math.floor((page.startMs / 1000) * fps);
        // Une page reste affichée jusqu'à la suivante, sans dépasser 1,5 s après son dernier mot.
        const lastWordEnd = page.startMs + page.durationMs;
        const endMs = Math.min(next ? next.startMs : Infinity, lastWordEnd + 1500);
        const endFrame = Math.ceil((endMs / 1000) * fps);
        if (endFrame <= startFrame) return null;
        return (
          <Sequence key={i} from={startFrame} durationInFrames={endFrame - startFrame} layout="none">
            <Page page={page} s={s} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

const Page: React.FC<{ page: TikTokPage; s: CaptionStyle }> = ({ page, s }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  // Dans une Sequence, le frame repart de 0 au début de la page.
  const timeMs = page.startMs + (frame / fps) * 1000;

  const enter = spring({ frame, fps, config: { damping: 14, stiffness: 220 }, durationInFrames: 8 });
  const pageScale = interpolate(enter, [0, 1], [0.8, 1]);

  const fontSize = width * s.fontSizeRatio;

  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: width * 0.06,
          right: width * 0.06,
          top: height * s.verticalPosition,
          transform: `translateY(-50%) scale(${pageScale})`,
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          alignItems: "center",
          columnGap: fontSize * 0.25,
          rowGap: fontSize * 0.1,
          fontFamily: s.fontFamily,
          fontWeight: s.fontWeight,
          fontSize,
          lineHeight: 1.15,
          textAlign: "center",
          textTransform: s.uppercase ? "uppercase" : "none",
        }}
      >
        {page.tokens.map((t, i) => {
          const active = t.fromMs <= timeMs && timeMs < t.toMs;
          const startFrame = ((t.fromMs - page.startMs) / 1000) * fps;
          const pop = spring({
            frame: frame - startFrame,
            fps,
            config: { damping: 12, stiffness: 300 },
            durationInFrames: 6,
          });
          const wordScale = active ? interpolate(pop, [0, 1], [1, 1.12]) : 1;
          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                color: active ? s.activeColor : s.color,
                backgroundColor: active && s.activeBackground ? s.activeBackground : "transparent",
                borderRadius: fontSize * 0.18,
                padding: `0 ${fontSize * 0.12}px`,
                WebkitTextStroke: `${fontSize * s.strokeRatio}px ${s.strokeColor}`,
                paintOrder: "stroke fill",
                transform: `scale(${wordScale})`,
                textShadow: `0 ${fontSize * 0.06}px ${fontSize * 0.15}px rgba(0,0,0,0.45)`,
              }}
            >
              {t.text.trim()}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

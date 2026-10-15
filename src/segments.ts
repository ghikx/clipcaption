import type { Caption } from "@remotion/captions";

// Portion de la vidéo source conservée, en ms dans le temps source.
export type Segment = { fromMs: number; toMs: number };

// Garde la parole, coupe les blancs entre mots plus longs que minGapMs.
// padMs de marge autour de chaque mot pour ne pas couper les attaques et les fins de syllabe.
export const computeSegments = (
  captions: Caption[],
  { minGapMs, padMs, totalMs }: { minGapMs: number; padMs: number; totalMs: number },
): Segment[] => {
  const segments: Segment[] = [];
  for (const c of captions) {
    const fromMs = Math.max(0, c.startMs - padMs);
    const toMs = Math.min(totalMs, c.endMs + padMs);
    const last = segments[segments.length - 1];
    if (last && fromMs - last.toMs < minGapMs) {
      last.toMs = Math.max(last.toMs, toMs);
    } else {
      segments.push({ fromMs, toMs });
    }
  }
  return segments;
};

export const totalDurationMs = (segments: Segment[]) =>
  segments.reduce((sum, s) => sum + (s.toMs - s.fromMs), 0);

// Convertit un instant source en instant de la vidéo montée.
const toOutputMs = (segments: Segment[], sourceMs: number): number => {
  let offset = 0;
  for (const s of segments) {
    if (sourceMs < s.fromMs) return offset;
    if (sourceMs <= s.toMs) return offset + (sourceMs - s.fromMs);
    offset += s.toMs - s.fromMs;
  }
  return offset;
};

export const remapCaptions = <T extends Caption>(captions: T[], segments: Segment[]): T[] =>
  captions.map((c) => ({
    ...c,
    startMs: toOutputMs(segments, c.startMs),
    endMs: toOutputMs(segments, c.endMs),
    timestampMs: c.timestampMs === null ? null : toOutputMs(segments, c.timestampMs),
  }));

// Aligne les bornes sur des frames entières : le montage vidéo et le recalage des
// sous-titres utilisent alors exactement les mêmes instants.
export const snapToFrames = (segments: Segment[], fps: number): Segment[] =>
  segments
    .map((s) => ({
      fromMs: (Math.round((s.fromMs / 1000) * fps) * 1000) / fps,
      toMs: (Math.round((s.toMs / 1000) * fps) * 1000) / fps,
    }))
    .filter((s) => s.toMs > s.fromMs);

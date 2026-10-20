import { computeSegments, snapToFrames, type Segment } from "./segments";
import type { Word } from "./words";

export type EditSettings = { cutSilences: boolean; minSilenceMs: number };

// Marge gardée avant/après chaque mot pour ne pas manger les attaques ni les fins de mot.
const PAD_MS = 100;

export type Edit = {
  // Mots affichés en sous-titres (les mots coupés en sont retirés), en temps source.
  captions: Word[];
  // Portions gardées de la source. null = vidéo entière, sans coupe.
  segments: Segment[] | null;
  durationInFrames: number;
};

const framesOf = (segments: Segment[], fps: number) =>
  segments.reduce(
    (n, s) => n + Math.round((s.toMs / 1000) * fps) - Math.round((s.fromMs / 1000) * fps),
    0,
  );

// Passages des mots coupés : de la fin du mot gardé précédent (+ marge) au début du
// suivant (- marge), pour que le blanc autour d'un mot coupé parte avec lui.
const cutRanges = (words: Word[], totalMs: number): Segment[] => {
  const removed: Segment[] = [];
  for (let i = 0; i < words.length; i++) {
    if (!words[i].cut) continue;
    let j = i;
    while (j + 1 < words.length && words[j + 1].cut) j++;
    const prevEnd = i > 0 ? words[i - 1].endMs : 0;
    const nextStart = j + 1 < words.length ? words[j + 1].startMs : totalMs;
    removed.push({
      fromMs: Math.min(words[i].startMs, i > 0 ? prevEnd + PAD_MS : 0),
      toMs: Math.max(words[j].endMs, j + 1 < words.length ? nextStart - PAD_MS : totalMs),
    });
    i = j;
  }
  return removed;
};

// Retire des plages d'une liste de segments triés.
const subtract = (segments: Segment[], removed: Segment[]): Segment[] => {
  let out = segments;
  for (const r of removed) {
    out = out.flatMap((s) => {
      if (r.toMs <= s.fromMs || r.fromMs >= s.toMs) return [s];
      const parts: Segment[] = [];
      if (r.fromMs > s.fromMs) parts.push({ fromMs: s.fromMs, toMs: r.fromMs });
      if (r.toMs < s.toMs) parts.push({ fromMs: r.toMs, toMs: s.toMs });
      return parts;
    });
  }
  return out;
};

// Calcule le montage : quels passages de la source garder et quels mots afficher.
// - coupe des silences : on ne garde que la parole des mots non coupés ;
// - sinon : toute la vidéo ;
// puis, dans les deux cas, on retire les passages des mots coupés à la main (même un
// « euh » plus court que le silence minimum).
export const buildEdit = (words: Word[], settings: EditSettings, totalMs: number, fps: number): Edit => {
  const kept = words.filter((w) => !w.cut);
  const hasCuts = kept.length !== words.length;
  const silences = settings.cutSilences && kept.length > 0;
  if (!silences && !hasCuts) {
    return { captions: kept, segments: null, durationInFrames: Math.max(1, Math.floor((totalMs / 1000) * fps)) };
  }
  const base = silences
    ? computeSegments(kept, { minGapMs: Math.max(0, settings.minSilenceMs - 2 * PAD_MS), padMs: PAD_MS, totalMs })
    : [{ fromMs: 0, toMs: totalMs }];
  const segments = snapToFrames(subtract(base, cutRanges(words, totalMs)), fps);
  // Les mots masqués restent dans `captions` : CaptionedVideo ne les affiche pas mais s'en
  // sert pour retirer l'écran précédent pendant qu'ils sont prononcés.
  return { captions: kept, segments, durationInFrames: Math.max(1, framesOf(segments, fps)) };
};

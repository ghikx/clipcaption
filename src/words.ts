import type { Caption } from "@remotion/captions";

// Un mot transcrit. `emphasis` marque les mots importants (mis en avant par les styles
// keyword, aesthetic, chaos…) : calculé automatiquement, modifiable à la main dans le JSON.
export type Word = Caption & { emphasis?: boolean };

export type Page = { startMs: number; endMs: number; words: Word[] };

// Regroupe les mots en écrans : un nouvel écran commence quand le mot arrive plus de
// combineWithinMs après le début de l'écran, après un blanc de plus de breakOnSilenceMs,
// ou quand l'écran contient déjà maxWords mots.
export const paginate = (
  words: Word[],
  { combineWithinMs, maxWords, breakOnSilenceMs = 400 }: { combineWithinMs: number; maxWords: number; breakOnSilenceMs?: number },
): Page[] => {
  const pages: Page[] = [];
  for (const w of words) {
    const page = pages[pages.length - 1];
    const prev = page?.words[page.words.length - 1];
    const startsNew =
      !page ||
      w.startMs - page.startMs >= combineWithinMs ||
      w.startMs - prev!.endMs > breakOnSilenceMs ||
      page.words.length >= maxWords;
    if (startsNew) {
      pages.push({ startMs: w.startMs, endMs: w.endMs, words: [w] });
    } else {
      page.words.push(w);
      page.endMs = w.endMs;
    }
  }
  return pages;
};

const STOPWORDS = new Set(
  (
    // Français
    "le la les un une des du de d l au aux et ou mais donc or ni car que qui quoi dont où ce cet cette ces " +
    "je tu il elle on nous vous ils elles me te se moi toi lui leur leurs mon ma mes ton ta tes son sa ses notre nos votre vos " +
    "est suis es sommes êtes sont ai as a avons avez ont été être avoir fait faire va vais vas allons allez vont " +
    "pas ne plus très bien aussi comme avec sans pour par sur sous dans en entre vers chez y là ici alors puis " +
    "c'est j'ai qu'il qu'on d'un d'une n'est l'on s'il ça cela ceci tout tous toute toutes même quand comment parce " +
    "voilà bon ben euh donc enfin juste vraiment quelque chose truc " +
    // Anglais
    "the a an and or but so of to in on at by for with from as is are was were be been being am " +
    "i you he she it we they me him her us them my your his its our their this that these those " +
    "do does did have has had will would can could should not no yes just really very then than there here " +
    "what which who when where how why all some any about into out up down if because like know think going"
  ).split(" "),
);

const normalize = (text: string) =>
  text
    .trim()
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");

// Heuristique locale, sans LLM : un mot est important s'il contient un chiffre
// (prix, %, dates) ou s'il est long et absent des mots-outils. Deux mots mis en avant
// sont séparés d'au moins minSpacingMs pour que l'effet reste rare.
export const markEmphasis = (words: Word[], minSpacingMs = 1200): Word[] => {
  const score = (w: Word) => {
    const t = normalize(w.text);
    if (!t || STOPWORDS.has(t)) return 0;
    if (/\p{N}/u.test(t)) return 100;
    const letters = t.replace(/[^\p{L}]/gu, "").length;
    return letters >= 6 ? letters : 0;
  };
  const scores = words.map(score);
  const chosen = new Set<number>();
  // Les meilleurs scores d'abord, en refusant ceux trop proches d'un mot déjà choisi.
  const order = scores
    .map((s, i) => [s, i] as const)
    .filter(([s]) => s > 0)
    .sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) {
    const close = [...chosen].some((j) => Math.abs(words[j].startMs - words[i].startMs) < minSpacingMs);
    if (!close) chosen.add(i);
  }
  return words.map((w, i) => ({ ...w, emphasis: chosen.has(i) }));
};

// Installation de polices Google Fonts en local : les fichiers woff2 (sous-ensemble latin)
// sont téléchargés dans public/fonts/google/ et listés dans public/fonts/manifest.json,
// que la composition charge au rendu comme dans l'aperçu de l'interface.
import fs from "node:fs";
import path from "node:path";
import { PUBLIC_DIR } from "./paths";
import { invalidateBundle } from "./render";

export type FontEntry = { family: string; file: string; weight: string; style: "normal" | "italic" };

const FONTS_DIR = path.join(PUBLIC_DIR, "fonts");
const MANIFEST = path.join(FONTS_DIR, "manifest.json");
// Google sert du woff2 seulement aux navigateurs récents.
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export const readManifest = (): FontEntry[] => {
  try {
    return JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  } catch {
    return [];
  }
};

export const fontFamilies = () => [...new Set(readManifest().map((f) => f.family))].sort();

const normalize = (family: string) => family.trim().replace(/\s+/g, " ");
export const hasFont = (family: string) =>
  readManifest().some((f) => f.family.toLowerCase() === normalize(family).toLowerCase());

// Les polices n'ont pas toutes les mêmes axes : on essaie du plus complet au plus simple.
const RANGES = ["100..900", "200..800", "200..900", "300..900", "300..800", "100..800", "400..900", "400..800"];
const STATIC = [
  [100, 200, 300, 400, 500, 600, 700, 800, 900],
  [300, 400, 500, 600, 700, 800],
  [400, 500, 600, 700],
  [400, 700],
];
const VARIANTS = [
  ...RANGES.flatMap((r) => [`ital,wght@0,${r};1,${r}`, `wght@${r}`]),
  ...STATIC.flatMap((ws) => [
    `ital,wght@${[...ws.map((w) => `0,${w}`), ...ws.map((w) => `1,${w}`)].join(";")}`,
    `wght@${ws.join(";")}`,
  ]),
  "",
];

const fetchCss = async (family: string) => {
  const name = encodeURIComponent(family).replace(/%20/g, "+");
  for (const v of VARIANTS) {
    const url = `https://fonts.googleapis.com/css2?family=${name}${v ? `:${v}` : ""}&display=swap`;
    const res = await fetch(url, { headers: { "User-Agent": UA } }).catch((e) => {
      throw new Error(`Impossible de joindre Google Fonts (${e.cause?.code ?? e.message}).`);
    });
    if (res.ok) return res.text();
  }
  throw new Error(`Police « ${family} » introuvable sur Google Fonts. Vérifie l'orthographe sur fonts.google.com.`);
};

// Télécharge une famille Google Fonts (toutes graisses et italiques disponibles).
export const installGoogleFont = async (rawFamily: string, { force = false } = {}): Promise<FontEntry[]> => {
  const family = normalize(rawFamily);
  if (!family || family.length > 60 || !/^[\p{L}\p{N} ]+$/u.test(family)) throw new Error(`Nom de police invalide : ${rawFamily}`);
  const existing = readManifest().filter((f) => f.family.toLowerCase() === family.toLowerCase());
  if (existing.length && !force) return existing;

  const css = await fetchCss(family);
  const blocks = css.split("@font-face").filter((b) => /\/\* latin \*\//.test(b) || b.includes("U+0000-00FF"));
  const faces = (blocks.length ? blocks : css.split("@font-face").slice(1))
    .map((b) => ({
      family: /font-family:\s*'([^']+)'/.exec(b)?.[1] ?? family,
      style: (/font-style:\s*(\w+)/.exec(b)?.[1] === "italic" ? "italic" : "normal") as FontEntry["style"],
      weight: /font-weight:\s*([\d ]+);/.exec(b)?.[1]?.trim() ?? "400",
      url: /src:\s*url\(([^)]+)\)/.exec(b)?.[1],
    }))
    .filter((f) => f.url && (f.url.endsWith(".woff2") || f.url.includes(".woff2")));
  if (!faces.length) throw new Error(`Aucun fichier woff2 pour « ${family} ».`);

  // Une seule entrée par style + graisse (le CSS répète parfois la même face).
  const unique = [...new Map(faces.map((f) => [`${f.style}-${f.weight}`, f])).values()];
  const dir = path.join(FONTS_DIR, "google");
  fs.mkdirSync(dir, { recursive: true });
  const slug = family.replace(/\s+/g, "");
  const entries: FontEntry[] = [];
  for (const f of unique) {
    const res = await fetch(f.url!);
    if (!res.ok) throw new Error(`Téléchargement de ${family} échoué (${res.status}).`);
    const file = `google/${slug}-${f.style}-${f.weight.replace(/\s+/g, "_")}.woff2`;
    fs.writeFileSync(path.join(FONTS_DIR, file), Buffer.from(await res.arrayBuffer()));
    entries.push({ family: f.family, file, weight: f.weight, style: f.style });
  }
  const manifest = readManifest().filter((m) => m.family.toLowerCase() !== family.toLowerCase());
  fs.writeFileSync(MANIFEST, JSON.stringify([...manifest, ...entries], null, 2) + "\n");
  // Le bundle Remotion contient une copie de public/ : il faut le reconstruire.
  invalidateBundle();
  return entries;
};

// Installe les polices utilisées par un style si elles manquent.
export const ensureFonts = async (families: (string | undefined)[]) => {
  for (const f of new Set(families.filter((x): x is string => !!x))) {
    if (!hasFont(f)) await installGoogleFont(f);
  }
};

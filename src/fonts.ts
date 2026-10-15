import { loadFont } from "@remotion/fonts";
import { continueRender, delayRender, staticFile } from "remotion";

// Polices locales listées dans public/fonts/manifest.json (Google Fonts, licence OFL) :
// le rendu ne dépend pas du réseau. De nouvelles polices s'installent depuis
// l'interface ou par Claude (core/fonts.ts), d'où le chargement à l'exécution.
type FontEntry = { family: string; file: string; weight: string; style: "normal" | "italic" };

const loaded = new Set<string>();

export const refreshFonts = async () => {
  const res = await fetch(staticFile("fonts/manifest.json"), { cache: "no-store" });
  const manifest: FontEntry[] = await res.json();
  await Promise.all(
    manifest
      .filter((f) => !loaded.has(f.file))
      .map(async (f) => {
        loaded.add(f.file);
        await loadFont({ family: f.family, url: staticFile(`fonts/${f.file}`), weight: f.weight, style: f.style }).catch(() =>
          loaded.delete(f.file),
        );
      }),
  );
  return manifest;
};

const handle = delayRender("Chargement des polices");
refreshFonts()
  .catch((e) => console.error("Polices :", e))
  .finally(() => continueRender(handle));

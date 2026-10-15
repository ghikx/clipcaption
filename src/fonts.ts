import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

// Polices embarquées dans public/fonts (sous-ensemble latin de Google Fonts, licence OFL) :
// le rendu ne dépend pas du réseau.
const FONTS = [
  { family: "Montserrat", file: "Montserrat-900.woff2", weight: "900" },
  { family: "Anton", file: "Anton-400.woff2", weight: "400" },
  { family: "Inter", file: "Inter-800.woff2", weight: "800" },
] as const;

for (const f of FONTS) {
  loadFont({ family: f.family, url: staticFile(`fonts/${f.file}`), weight: f.weight });
}

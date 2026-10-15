import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

// Polices embarquées dans public/fonts (sous-ensemble latin de Google Fonts, licence OFL) :
// le rendu ne dépend pas du réseau. Montserrat et Inter sont des polices variables.
const FONTS = [
  { family: "Montserrat", file: "Montserrat.woff2", weight: "100 900", style: "normal" },
  { family: "Inter", file: "Inter.woff2", weight: "100 900", style: "normal" },
  { family: "Anton", file: "Anton-400.woff2", weight: "400", style: "normal" },
  { family: "Instrument Serif", file: "InstrumentSerif-Italic.woff2", weight: "400", style: "italic" },
  { family: "Space Mono", file: "SpaceMono-700.woff2", weight: "700", style: "normal" },
] as const;

for (const f of FONTS) {
  loadFont({ family: f.family, url: staticFile(`fonts/${f.file}`), weight: f.weight, style: f.style });
}

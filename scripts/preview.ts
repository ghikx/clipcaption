// Aperçu du catalogue de styles, sans vidéo ni transcription.
// Usage : npm run preview              -> out/styles/<style>.png + out/styles/catalogue.png
//         npm run preview -- --video   -> en plus, une démo MP4 de 8 s par style
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import type { CaptionedVideoProps } from "../src/CaptionedVideo";
import sample from "../src/sample-captions.json";
import { STYLES, type PresetName } from "../src/styles";
import { markEmphasis } from "../src/words";
import { ROOT } from "../core/paths";

const { values } = parseArgs({ options: { video: { type: "boolean", default: false } } });

const outDir = path.join(ROOT, "out", "styles");
const THUMBS_DIR = path.join(ROOT, "app", "public", "styles");
fs.mkdirSync(outDir, { recursive: true });

const captions = markEmphasis(sample);
// Instant de l'aperçu : au milieu d'un mot important, pour montrer tous les effets.
const shown = captions.find((w) => w.emphasis && w.startMs > 1500) ?? captions[Math.floor(captions.length / 2)];
const atMs = (shown.startMs + shown.endMs) / 2;

const serveUrl = await bundle({ entryPoint: path.join(ROOT, "src/index.ts") });
const browserExecutable = process.env.REMOTION_BROWSER ?? null;
const fps = 30;
const lastMs = captions[captions.length - 1].endMs;

const stills: string[] = [];
for (const style of Object.keys(STYLES) as PresetName[]) {
  const inputProps: CaptionedVideoProps = {
    videoSrc: "",
    captions,
    segments: null,
    style,
    width: 1080,
    height: 1920,
    fps,
    durationInFrames: Math.ceil(((lastMs + 800) / 1000) * fps),
  };
  const composition = await selectComposition({ serveUrl, id: "Captioned", inputProps, browserExecutable });
  const still = path.join(outDir, `${style}.png`);
  await renderStill({
    serveUrl,
    composition,
    inputProps,
    frame: Math.round((atMs / 1000) * fps),
    output: still,
    browserExecutable,
  });
  stills.push(still);
  // Vignette 16:9 centrée sur les sous-titres, pour l'interface web.
  const centerY = Math.round(1920 * STYLES[style].verticalPosition);
  const top = Math.max(0, Math.min(1920 - 608, centerY - 304));
  fs.mkdirSync(THUMBS_DIR, { recursive: true });
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error", "-i", still,
    "-vf", `crop=1080:608:0:${top},scale=480:-2`, "-q:v", "3",
    path.join(THUMBS_DIR, `${style}.jpg`),
  ]);
  console.log(`${style.padEnd(11)} ${STYLES[style].label}`);
  if (values.video) {
    await renderMedia({
      serveUrl,
      composition,
      inputProps,
      codec: "h264",
      outputLocation: path.join(outDir, `${style}.mp4`),
      browserExecutable,
    });
  }
}

// Planche de tous les styles, légendée, par rangées de 6.
const COLS = 6;
const cells = stills.map(
  (s, i) =>
    `[${i}]scale=360:-1,crop=360:400:0:${Math.round(640 * 0.62 - 200)},` +
    `drawbox=y=ih-36:w=iw:h=36:color=black@0.7:t=fill,` +
    `drawtext=text='${path.basename(s, ".png")}':fontcolor=white:fontsize=22:x=(w-tw)/2:y=h-29[v${i}]`,
);
const pads = (COLS - (stills.length % COLS)) % COLS;
const padCells = Array.from({ length: pads }, (_, i) => `color=c=black:s=360x400[pad${i}]`);
const ids = [...stills.map((_, i) => `[v${i}]`), ...padCells.map((_, i) => `[pad${i}]`)];
const rows: string[] = [];
for (let r = 0; r * COLS < ids.length; r++) rows.push(`${ids.slice(r * COLS, (r + 1) * COLS).join("")}hstack=${COLS}[row${r}]`);
const layout = rows.length > 1 ? `${rows.map((_, r) => `[row${r}]`).join("")}vstack=${rows.length}` : "[row0]null";
execFileSync("ffmpeg", [
  "-y",
  "-loglevel",
  "error",
  ...stills.flatMap((s) => ["-i", s]),
  "-filter_complex",
  [...cells, ...padCells, ...rows, layout].join(";"),
  "-frames:v",
  "1",
  path.join(outDir, "catalogue.png"),
]);
console.log(`\nAperçus : ${outDir}/ (catalogue.png = tous les styles)`);

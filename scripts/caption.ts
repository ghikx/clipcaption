// Usage : npm run caption -- <video> [--lang fr|en|auto] [--style submagic|hormozi|minimal]
//                                  [--model large-v3-turbo] [--reuse] [--no-render]
//
// 1. copie la vidéo dans public/input/
// 2. transcrit l'audio mot par mot avec whisper.cpp -> public/input/<nom>.captions.json
// 3. rend out/<nom>.<style>.mp4 avec les sous-titres animés
//
// --reuse saute la transcription et réutilise le JSON existant : corrige le texte
// dans le JSON, puis relance avec --reuse pour re-rendre.
import type { Caption } from "@remotion/captions";
import { bundle } from "@remotion/bundler";
import { transcribe, toCaptions } from "@remotion/install-whisper-cpp";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import type { CaptionedVideoProps } from "../src/CaptionedVideo";
import { STYLES, isStyleName } from "../src/styles";
import { WHISPER_PATH, WHISPER_VERSION, parseModel } from "./whisper";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    lang: { type: "string", default: "auto" },
    style: { type: "string", default: "submagic" },
    model: { type: "string" },
    reuse: { type: "boolean", default: false },
    "no-render": { type: "boolean", default: false },
  },
});

const input = positionals[0];
if (!input || !fs.existsSync(input)) {
  console.error("Usage : npm run caption -- <video> [--lang fr|en|auto] [--style submagic|hormozi|minimal]");
  process.exit(1);
}
if (!["fr", "en", "auto"].includes(values.lang)) {
  throw new Error(`--lang doit valoir fr, en ou auto (reçu "${values.lang}")`);
}
const style = values.style;
if (!isStyleName(style)) {
  throw new Error(`Style inconnu "${style}". Choix : ${Object.keys(STYLES).join(", ")}`);
}

const ext = path.extname(input);
const name = path.basename(input, ext).replace(/[^\w-]+/g, "_");
const publicDir = path.join(process.cwd(), "public");
const inputDir = path.join(publicDir, "input");
const videoRel = `input/${name}${ext.toLowerCase()}`;
const captionsPath = path.join(inputDir, `${name}.captions.json`);
fs.mkdirSync(inputDir, { recursive: true });
fs.mkdirSync("out", { recursive: true });
fs.copyFileSync(input, path.join(publicDir, videoRel));

const probe = (): Pick<CaptionedVideoProps, "width" | "height" | "fps" | "durationInFrames"> => {
  const raw = execFileSync("ffprobe", [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=width,height,r_frame_rate:stream_side_data=rotation:stream_tags=rotate:format=duration",
    "-of", "json",
    input,
  ]).toString();
  const info = JSON.parse(raw);
  const stream = info.streams[0];
  const rotation = Math.abs(
    Number(stream.side_data_list?.find((d: { rotation?: number }) => d.rotation !== undefined)?.rotation ??
      stream.tags?.rotate ??
      0),
  );
  // Les vidéos verticales de téléphone sont souvent stockées en paysage avec un tag de rotation.
  const swap = rotation === 90 || rotation === 270;
  const [num, den] = String(stream.r_frame_rate).split("/").map(Number);
  const fps = Math.round((num / (den || 1)) * 1000) / 1000;
  const duration = Number(info.format.duration);
  return {
    width: swap ? stream.height : stream.width,
    height: swap ? stream.width : stream.height,
    fps,
    durationInFrames: Math.max(1, Math.floor(duration * fps)),
  };
};

// whisper.cpp peut couper un mot en plusieurs tokens (" aujourd" + "'hui") : un token
// qui ne commence pas par une espace est recollé au précédent. Les annotations
// comme [Musique] ou (rires) sont retirées.
const cleanCaptions = (captions: Caption[]): Caption[] => {
  const out: Caption[] = [];
  for (const c of captions) {
    const text = c.text;
    if (!text.trim() || /^\s*[[(].*[\])]\s*$/.test(text)) continue;
    const prev = out[out.length - 1];
    if (prev && !/^\s/.test(text)) {
      prev.text += text;
      prev.endMs = c.endMs;
    } else {
      out.push({ ...c, text: out.length === 0 ? text.trimStart() : text });
    }
  }
  return out;
};

const transcribeVideo = async (): Promise<Caption[]> => {
  const model = parseModel(values.model);
  const wav = path.join(os.tmpdir(), `${name}-${Date.now()}.wav`);
  // whisper.cpp exige du WAV 16 kHz mono.
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", input, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wav]);
  try {
    console.log(`Transcription (${model}, langue : ${values.lang})…`);
    const whisperCppOutput = await transcribe({
      inputPath: wav,
      whisperPath: WHISPER_PATH,
      whisperCppVersion: WHISPER_VERSION,
      model,
      modelFolder: WHISPER_PATH,
      tokenLevelTimestamps: true,
      splitOnWord: true,
      language: values.lang as "fr" | "en" | "auto",
      printOutput: false,
      onProgress: (p) => process.stdout.write(`\r  ${Math.round(p * 100)} %`),
    });
    process.stdout.write("\n");
    return cleanCaptions(toCaptions({ whisperCppOutput }).captions);
  } finally {
    fs.rmSync(wav, { force: true });
  }
};

let captions: Caption[];
if (values.reuse) {
  if (!fs.existsSync(captionsPath)) throw new Error(`--reuse : ${captionsPath} introuvable, lance d'abord sans --reuse`);
  captions = JSON.parse(fs.readFileSync(captionsPath, "utf8"));
  console.log(`Sous-titres réutilisés : ${captionsPath}`);
} else {
  captions = await transcribeVideo();
  fs.writeFileSync(captionsPath, JSON.stringify(captions, null, 2) + "\n");
  console.log(`${captions.length} mots -> ${captionsPath}`);
}

if (!values["no-render"]) {
  const inputProps: CaptionedVideoProps = { videoSrc: videoRel, captions, style, ...probe() };
  console.log("Préparation du rendu…");
  const serveUrl = await bundle({ entryPoint: path.join(process.cwd(), "src/index.ts"), publicDir });
  const browserExecutable = process.env.REMOTION_BROWSER ?? null;
  const composition = await selectComposition({ serveUrl, id: "Captioned", inputProps, browserExecutable });
  const outputLocation = path.join("out", `${name}.${style}.mp4`);
  await renderMedia({
    serveUrl,
    composition,
    inputProps,
    codec: "h264",
    outputLocation,
    browserExecutable,
    onProgress: ({ progress }) => process.stdout.write(`\r  Rendu ${Math.round(progress * 100)} %`),
  });
  process.stdout.write("\n");
  console.log(`Terminé : ${outputLocation}`);
}

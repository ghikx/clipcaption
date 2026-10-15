// Usage : npm run caption -- <video> [--lang fr|en|auto] [--style <style>]
//                                  [--model large-v3-turbo] [--reuse] [--no-render]
//                                  [--cut-silences] [--min-silence 500]
//
// 1. transcrit l'audio mot par mot avec whisper.cpp -> public/input/<nom>.captions.json
// 2. rend out/<nom>.<style>.mp4 avec les sous-titres animés
//
// --reuse saute la transcription et réutilise le JSON existant : corrige le texte
// dans le JSON (ou supprime des mots pour couper leur passage), puis relance avec --reuse.
//
// --cut-silences supprime les blancs de plus de --min-silence ms entre deux mots
// (jump cuts), en se basant sur les timestamps de la transcription.
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { probe } from "../core/media";
import { PUBLIC_DIR, ROOT } from "../core/paths";
import { renderEdit } from "../core/render";
import { transcribeFile, type Language } from "../core/transcribe";
import { parseModel } from "../core/whisper";
import { STYLES, isStyleName } from "../src/styles";
import { markEmphasis, type Word } from "../src/words";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    lang: { type: "string", default: "auto" },
    style: { type: "string", default: "chenek" },
    model: { type: "string" },
    reuse: { type: "boolean", default: false },
    "no-render": { type: "boolean", default: false },
    "cut-silences": { type: "boolean", default: false },
    "min-silence": { type: "string", default: "500" },
  },
});

const input = positionals[0];
if (!input || !fs.existsSync(input)) {
  console.error(`Usage : npm run caption -- <video> [--lang fr|en|auto] [--style ${Object.keys(STYLES).join("|")}]`);
  process.exit(1);
}
if (!["fr", "en", "auto"].includes(values.lang)) {
  throw new Error(`--lang doit valoir fr, en ou auto (reçu "${values.lang}")`);
}
const style = values.style;
if (!isStyleName(style)) {
  throw new Error(`Style inconnu "${style}". Choix : ${Object.keys(STYLES).join(", ")}`);
}
const minSilenceMs = Number(values["min-silence"]);
if (!Number.isFinite(minSilenceMs) || minSilenceMs < 100) {
  throw new Error(`--min-silence doit être un nombre de ms >= 100 (reçu "${values["min-silence"]}")`);
}

const name = path.basename(input, path.extname(input)).replace(/[^\w-]+/g, "_");
const captionsPath = path.join(PUBLIC_DIR, "input", `${name}.captions.json`);
fs.mkdirSync(path.dirname(captionsPath), { recursive: true });

let words: Word[];
if (values.reuse) {
  if (!fs.existsSync(captionsPath)) throw new Error(`--reuse : ${captionsPath} introuvable, lance d'abord sans --reuse`);
  words = JSON.parse(fs.readFileSync(captionsPath, "utf8"));
  // JSON produit avant l'ajout des mots importants : on les calcule une fois.
  if (!words.some((w) => "emphasis" in w)) {
    words = markEmphasis(words);
    fs.writeFileSync(captionsPath, JSON.stringify(words, null, 2) + "\n");
  }
  console.log(`Sous-titres réutilisés : ${captionsPath}`);
} else {
  const model = parseModel(values.model);
  console.log(`Transcription (${model}, langue : ${values.lang})…`);
  words = await transcribeFile(input, {
    lang: values.lang as Language,
    model,
    onProgress: (p) => process.stdout.write(`\r  ${Math.round(p * 100)} %`),
  });
  process.stdout.write("\n");
  fs.writeFileSync(captionsPath, JSON.stringify(words, null, 2) + "\n");
  console.log(`${words.length} mots -> ${captionsPath}`);
}

if (!values["no-render"]) {
  const media = await probe(input);
  const cut = values["cut-silences"];
  if (cut && words.length === 0) console.warn("Aucun mot transcrit : --cut-silences ignoré.");
  console.log("Rendu…");
  const outPath = path.join(ROOT, "out", `${name}.${style}${cut ? ".cut" : ""}.mp4`);
  const result = await renderEdit({
    videoPath: path.resolve(input),
    media,
    words,
    style,
    settings: { cutSilences: cut && words.length > 0, minSilenceMs },
    outPath,
    onProgress: (p) => process.stdout.write(`\r  Rendu ${Math.round(p * 100)} %`),
  });
  process.stdout.write("\n");
  if (cut) {
    console.log(`Durée : ${(media.durationMs / 1000).toFixed(1)} s -> ${(result.durationMs / 1000).toFixed(1)} s`);
  }
  console.log(`Terminé : ${path.relative(process.cwd(), outPath)}`);
}

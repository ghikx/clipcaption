// Installe whisper.cpp et télécharge le modèle. À lancer une fois : npm run setup [-- --model small]
// Relancer après une mise à jour de clipcaption : une ancienne version de whisper.cpp est
// remplacée, et les modèles déjà téléchargés (plusieurs Go) sont conservés.
import { downloadWhisperModel, installWhisperCpp } from "@remotion/install-whisper-cpp";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { ROOT } from "../core/paths";
import { WHISPER_BINARY, WHISPER_PATH, WHISPER_VERSION, parseModel } from "../core/whisper";

const { values } = parseArgs({ options: { model: { type: "string" } } });
const model = parseModel(values.model);

const has = (bin: string) => {
  try {
    execFileSync(bin, ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

if (process.platform !== "win32" && !fs.existsSync(WHISPER_BINARY)) {
  // whisper.cpp >= 1.7 se compile avec cmake.
  if (!has("cmake")) {
    console.error("\ncmake est nécessaire pour compiler whisper.cpp. Installe-le avec :\n\n  brew install cmake\n\npuis relance.");
    process.exit(1);
  }
}

// Ancienne installation (dossier présent sans le binaire de cette version) : on met les
// modèles de côté, on supprime le dossier, on réinstalle, puis on remet les modèles.
const KEEP = path.join(ROOT, ".whisper-models");
if (fs.existsSync(WHISPER_PATH) && !fs.existsSync(WHISPER_BINARY)) {
  console.log(`Mise à jour de whisper.cpp vers ${WHISPER_VERSION} (les modèles téléchargés sont conservés)…`);
  fs.mkdirSync(KEEP, { recursive: true });
  for (const f of fs.readdirSync(WHISPER_PATH).filter((f) => /^ggml-.*\.bin$/.test(f))) {
    fs.renameSync(path.join(WHISPER_PATH, f), path.join(KEEP, f));
  }
  fs.rmSync(WHISPER_PATH, { recursive: true, force: true });
}

await installWhisperCpp({ to: WHISPER_PATH, version: WHISPER_VERSION });

// Windows : l'archive officielle range l'exécutable (et ses DLL) dans Release/, alors que la
// transcription le cherche dans build/bin/ comme sur Mac et Linux. On l'y déplace.
const RELEASE = path.join(WHISPER_PATH, "Release");
if (process.platform === "win32" && !fs.existsSync(WHISPER_BINARY) && fs.existsSync(RELEASE)) {
  fs.mkdirSync(path.dirname(WHISPER_BINARY), { recursive: true });
  for (const f of fs.readdirSync(RELEASE)) fs.renameSync(path.join(RELEASE, f), path.join(path.dirname(WHISPER_BINARY), f));
  fs.rmSync(RELEASE, { recursive: true, force: true });
}
if (!fs.existsSync(WHISPER_BINARY)) {
  console.error(`\nInstallation de whisper.cpp incomplète : ${WHISPER_BINARY} introuvable. Supprime le dossier ${WHISPER_PATH} et relance.`);
  process.exit(1);
}

if (fs.existsSync(KEEP)) {
  for (const f of fs.readdirSync(KEEP)) fs.renameSync(path.join(KEEP, f), path.join(WHISPER_PATH, f));
  fs.rmSync(KEEP, { recursive: true, force: true });
}

await downloadWhisperModel({ model, folder: WHISPER_PATH });

console.log(`\nPrêt : whisper.cpp ${WHISPER_VERSION} + modèle ${model} dans ${WHISPER_PATH}`);

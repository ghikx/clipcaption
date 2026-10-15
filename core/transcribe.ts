import { toCaptions, transcribe } from "@remotion/install-whisper-cpp";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { markEmphasis, type Word } from "../src/words";
import { extractWav } from "./media";
import { DEFAULT_MODEL, WHISPER_PATH, WHISPER_VERSION } from "./whisper";
import type { WhisperModel } from "@remotion/install-whisper-cpp";

export type Language = "fr" | "en" | "auto";

// whisper.cpp peut couper un mot en plusieurs tokens (" aujourd" + "'hui") : un token
// qui ne commence pas par une espace est recollé au précédent. Les annotations
// comme [Musique] ou (rires) sont retirées.
export const cleanWords = (captions: Word[]): Word[] => {
  const out: Word[] = [];
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

export const whisperStatus = (model: WhisperModel = DEFAULT_MODEL) => ({
  installed: fs.existsSync(path.join(WHISPER_PATH, process.platform === "win32" ? "main.exe" : "main")),
  model,
  modelReady: fs.existsSync(path.join(WHISPER_PATH, `ggml-${model}.bin`)),
});

export const assertWhisperInstalled = (model: WhisperModel) => {
  // Mêmes chemins que @remotion/install-whisper-cpp (non exportés par le paquet).
  const binary = path.join(WHISPER_PATH, process.platform === "win32" ? "main.exe" : "main");
  if (!fs.existsSync(binary)) {
    throw new Error("whisper.cpp n'est pas installé : lance `npm run setup` dans le dossier clipcaption.");
  }
  if (!fs.existsSync(path.join(WHISPER_PATH, `ggml-${model}.bin`))) {
    throw new Error(`Modèle ${model} absent : lance \`npm run setup -- --model ${model}\`.`);
  }
};

export const transcribeFile = async (
  input: string,
  { lang = "auto", model = DEFAULT_MODEL, onProgress }: { lang?: Language; model?: WhisperModel; onProgress?: (p: number) => void } = {},
): Promise<Word[]> => {
  assertWhisperInstalled(model);
  const wav = path.join(os.tmpdir(), `clipcaption-${process.pid}-${Date.now()}.wav`);
  await extractWav(input, wav);
  try {
    const whisperCppOutput = await transcribe({
      inputPath: wav,
      whisperPath: WHISPER_PATH,
      whisperCppVersion: WHISPER_VERSION,
      model,
      modelFolder: WHISPER_PATH,
      tokenLevelTimestamps: true,
      splitOnWord: true,
      language: lang,
      printOutput: false,
      onProgress,
    });
    return markEmphasis(cleanWords(toCaptions({ whisperCppOutput }).captions));
  } finally {
    fs.rmSync(wav, { force: true });
  }
};

// Installe whisper.cpp et télécharge le modèle. À lancer une fois : npm run setup [-- --model small]
import { downloadWhisperModel, installWhisperCpp } from "@remotion/install-whisper-cpp";
import { parseArgs } from "node:util";
import { WHISPER_PATH, WHISPER_VERSION, parseModel } from "../core/whisper";

const { values } = parseArgs({ options: { model: { type: "string" } } });
const model = parseModel(values.model);

await installWhisperCpp({ to: WHISPER_PATH, version: WHISPER_VERSION });
await downloadWhisperModel({ model, folder: WHISPER_PATH });

console.log(`\nPrêt : whisper.cpp ${WHISPER_VERSION} + modèle ${model} dans ${WHISPER_PATH}`);

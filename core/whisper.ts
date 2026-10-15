import path from "node:path";
import type { WhisperModel } from "@remotion/install-whisper-cpp";
import { ROOT } from "./paths";

// 1.7.2+ est nécessaire pour les timestamps mot par mot (DTW) avec large-v3-turbo.
export const WHISPER_VERSION = "1.7.6";
export const WHISPER_PATH = path.join(ROOT, "whisper.cpp");
// Même chemin que @remotion/install-whisper-cpp pour les versions >= 1.7.4 (non exporté).
export const WHISPER_BINARY = path.join(WHISPER_PATH, "build", "bin", process.platform === "win32" ? "whisper-cli.exe" : "whisper-cli");
export const modelFile = (model: WhisperModel) => path.join(WHISPER_PATH, `ggml-${model}.bin`);
// Meilleur compromis vitesse/qualité multilingue (FR/EN). "small" si la machine rame.
export const DEFAULT_MODEL: WhisperModel = "large-v3-turbo";

export const MODELS: readonly WhisperModel[] = [
  "tiny",
  "base",
  "small",
  "medium",
  "large-v3",
  "large-v3-turbo",
];

export const parseModel = (value: string | undefined): WhisperModel => {
  if (!value) return DEFAULT_MODEL;
  if ((MODELS as readonly string[]).includes(value)) return value as WhisperModel;
  throw new Error(`Modèle inconnu "${value}". Choix : ${MODELS.join(", ")}`);
};

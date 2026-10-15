import path from "node:path";
import type { WhisperModel } from "@remotion/install-whisper-cpp";

export const WHISPER_VERSION = "1.5.5";
export const WHISPER_PATH = path.join(process.cwd(), "whisper.cpp");
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

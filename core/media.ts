import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export type MediaInfo = {
  width: number;
  height: number;
  fps: number;
  durationMs: number;
};

export const probe = async (file: string): Promise<MediaInfo> => {
  const { stdout } = await run("ffprobe", [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=width,height,r_frame_rate:stream_side_data=rotation:stream_tags=rotate:format=duration",
    "-of", "json",
    file,
  ]);
  const info = JSON.parse(stdout);
  const stream = info.streams?.[0];
  if (!stream) throw new Error("Aucune piste vidéo trouvée dans ce fichier.");
  const rotation = Math.abs(
    Number(
      stream.side_data_list?.find((d: { rotation?: number }) => d.rotation !== undefined)?.rotation ??
        stream.tags?.rotate ??
        0,
    ),
  );
  // Les vidéos verticales de téléphone sont souvent stockées en paysage avec un tag de rotation.
  const swap = rotation === 90 || rotation === 270;
  const [num, den] = String(stream.r_frame_rate).split("/").map(Number);
  const fps = Math.round((num / (den || 1)) * 1000) / 1000;
  return {
    width: swap ? stream.height : stream.width,
    height: swap ? stream.width : stream.height,
    fps: fps > 0 && fps <= 120 ? fps : 30,
    durationMs: Math.round(Number(info.format.duration) * 1000),
  };
};

// whisper.cpp exige du WAV 16 kHz mono.
export const extractWav = (input: string, output: string) =>
  run("ffmpeg", ["-y", "-loglevel", "error", "-i", input, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", output]);

export const thumbnail = (input: string, output: string, atSeconds = 1) =>
  run("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(atSeconds), "-i", input, "-frames:v", "1", "-vf", "scale=360:-2", "-q:v", "4", output]);

// Proxy d'aperçu pour l'interface : VP9 ≤ 960 px, lisible par tous les navigateurs
// (contrairement au HEVC des iPhone ou au ProRes). Le rendu final utilise la source.
export const makePreview = (input: string, output: string) =>
  run("ffmpeg", [
    "-y", "-loglevel", "error", "-i", input,
    "-vf", "scale='if(gt(iw,ih),min(960,iw),-2)':'if(gt(iw,ih),-2,min(960,ih))'",
    "-c:v", "libvpx-vp9", "-deadline", "realtime", "-cpu-used", "8", "-row-mt", "1", "-b:v", "1500k",
    "-c:a", "libopus", "-b:a", "96k",
    output,
  ]);

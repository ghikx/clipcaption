import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
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

type StreamInfo = { codec_name?: string; pix_fmt?: string; color_transfer?: string };

const streamInfo = async (file: string): Promise<StreamInfo> => {
  const { stdout } = await run("ffprobe", [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=codec_name,pix_fmt,color_transfer", "-of", "json", file,
  ]);
  return JSON.parse(stdout).streams?.[0] ?? {};
};

const HDR_TRANSFERS = ["smpte2084", "arib-std-b67"];

// Le décodeur image par image de Remotion (le « compositor ») est lent et plante sur les
// vidéos lourdes : HEVC 10 bits HDR des iPhone, 4K, 60 i/s. Avant l'export, on fabrique une
// copie simple (H.264 8 bits SDR, petit côté ≤ 1080 px, ≤ 30 i/s). Instagram et TikTok
// redescendent tout en 1080p, donc aucune perte visible. CLIPCAPTION_FULL_RES=1 désactive.
export const renderSource = async (input: string, output: string, media: MediaInfo): Promise<{ file: string; media: MediaInfo }> => {
  if (process.env.CLIPCAPTION_FULL_RES === "1") return { file: input, media };
  const s = await streamInfo(input);
  const hdr = HDR_TRANSFERS.includes(s.color_transfer ?? "");
  const big = Math.min(media.width, media.height) > 1080;
  const fast = media.fps > 31;
  if (!hdr && !big && !fast && s.codec_name === "h264" && s.pix_fmt === "yuv420p") return { file: input, media };

  const fresh = fs.existsSync(output) && fs.statSync(output).mtimeMs > fs.statSync(input).mtimeMs;
  if (!fresh) {
    fs.mkdirSync(path.dirname(output), { recursive: true });
    const filters = [
      "scale='if(lt(iw,ih),min(1080,iw),-2)':'if(lt(iw,ih),-2,min(1080,ih))'",
      // 60 → 30, 59,94 → 29,97, 50 → 25 : on garde un rythme régulier.
      ...(fast ? [`fps=${media.fps / 2}`] : []),
    ];
    const tonemap = "zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv";
    const encode = (vf: string[]) =>
      run("ffmpeg", [
        "-y", "-loglevel", "error",
        // Décodage matériel du HEVC sur Mac (ffmpeg revient au logiciel s'il échoue).
        ...(process.platform === "darwin" ? ["-hwaccel", "videotoolbox"] : []),
        "-i", input,
        "-vf", [...vf, "format=yuv420p"].join(","),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "12",
        "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
        "-c:a", "aac", "-b:a", "320k", "-movflags", "+faststart",
        `${output}.part.mp4`,
      ]);
    try {
      await encode(hdr ? [...filters, tonemap] : filters);
    } catch (e) {
      // ffmpeg sans zscale (zimg) : on convertit sans conversion HDR plutôt que d'échouer.
      if (!hdr) throw e;
      await encode(filters);
    }
    fs.renameSync(`${output}.part.mp4`, output);
  }
  const m = await probe(output);
  return { file: output, media: { ...m, durationMs: media.durationMs } };
};

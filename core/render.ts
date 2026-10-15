import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import type { CaptionedVideoProps } from "../src/CaptionedVideo";
import { buildEdit, type EditSettings } from "../src/edit";
import sample from "../src/sample-captions.json";
import { toOutputMs } from "../src/segments";
import type { CaptionStyle, StyleName, StyleOverrides } from "../src/styles";
import { markEmphasis, type Word } from "../src/words";
import type { MediaInfo } from "./media";
import { engineOptions, withEngine } from "./engines";
import { PUBLIC_DIR, ROOT } from "./paths";

// Le bundle Remotion (composition + polices) est construit une fois par processus.
let bundlePromise: Promise<string> | null = null;
export const invalidateBundle = () => {
  bundlePromise = null;
};
export const getBundle = () => {
  bundlePromise ??= bundle({ entryPoint: path.join(ROOT, "src/index.ts"), publicDir: PUBLIC_DIR }).catch((e) => {
    bundlePromise = null;
    throw e;
  });
  return bundlePromise;
};

const MIME: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".m4v": "video/mp4",
};

// Petit serveur HTTP local qui expose un fichier vidéo (avec Range) au moteur de rendu,
// sans copier la vidéo dans le bundle.
const serveFile = (file: string) =>
  new Promise<{ url: string; close: () => void }>((resolve) => {
    const server = http.createServer((req, res) => {
      const { size } = fs.statSync(file);
      const type = MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream";
      const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? "");
      if (range) {
        const start = range[1] ? Number(range[1]) : size - Number(range[2]);
        const end = range[1] && range[2] ? Number(range[2]) : size - 1;
        res.writeHead(206, {
          "Content-Type": type,
          "Content-Range": `bytes ${start}-${end}/${size}`,
          "Content-Length": end - start + 1,
          "Accept-Ranges": "bytes",
        });
        fs.createReadStream(file, { start, end }).pipe(res);
      } else {
        res.writeHead(200, { "Content-Type": type, "Content-Length": size, "Accept-Ranges": "bytes" });
        fs.createReadStream(file).pipe(res);
      }
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ url: `http://127.0.0.1:${port}/${encodeURIComponent(path.basename(file))}`, close: () => server.close() });
    });
  });

export type RenderOptions = {
  videoPath: string;
  media: MediaInfo;
  words: Word[];
  style: StyleName;
  // Définition complète du style (obligatoire pour un style perso).
  styleDef?: CaptionStyle;
  overrides?: StyleOverrides;
  settings: EditSettings;
  outPath: string;
  onProgress?: (p: number) => void;
};

export const renderEdit = async (o: RenderOptions) => {
  const serveUrl = await getBundle();
  const edit = buildEdit(o.words, o.settings, o.media.durationMs, o.media.fps);
  const media = await serveFile(o.videoPath);
  try {
    const inputProps: CaptionedVideoProps = {
      videoSrc: media.url,
      captions: edit.captions,
      segments: edit.segments,
      style: o.style,
      styleDef: o.styleDef,
      overrides: o.overrides,
      width: o.media.width,
      height: o.media.height,
      fps: o.media.fps,
      durationInFrames: edit.durationInFrames,
    };
    fs.mkdirSync(path.dirname(o.outPath), { recursive: true });
    await withEngine(
      async (engine) => {
        const opts = engineOptions(engine);
        const composition = await selectComposition({ serveUrl, id: "Captioned", inputProps, ...opts });
        await renderMedia({
          serveUrl,
          composition,
          inputProps,
          codec: "h264",
          // Qualité : par défaut Remotion capture les images en JPEG qualité 80 (artefacts
          // visibles sur les détails fins et autour du texte). 100 = quasi sans perte.
          jpegQuality: 100,
          // CRF 17 (défaut 18) : un peu plus fidèle à la source, fichier un peu plus lourd.
          crf: 17,
          // bt709 = espace colorimétrique standard de la vidéo : évite un décalage de couleurs.
          colorSpace: "bt709",
          // Cache des images de la vidéo source limité, pour ne pas saturer la mémoire.
          offthreadVideoCacheSizeInBytes: 512 * 1024 * 1024,
          ...(engine.safe
            ? { concurrency: 1 }
            : process.env.CLIPCAPTION_CONCURRENCY
              ? { concurrency: Number(process.env.CLIPCAPTION_CONCURRENCY) }
              : {}),
          ...opts,
          outputLocation: o.outPath,
          onProgress: ({ progress }) => o.onProgress?.(progress),
        });
      },
      () => o.onProgress?.(0),
    );
    return { outPath: o.outPath, durationMs: (edit.durationInFrames / o.media.fps) * 1000 };
  } finally {
    media.close();
  }
};

// Image d'aperçu d'un style : sur une vidéo de projet si fournie (au moment d'un mot
// important), sinon sur la phrase d'exemple et un fond dégradé. Sert aux vignettes des
// styles perso et à Claude pour voir le style qu'il conçoit.
export const renderStyleStill = async (o: {
  styleDef: CaptionStyle;
  overrides?: StyleOverrides;
  outPath: string;
  scale?: number;
  project?: { videoPath: string; media: MediaInfo; words: Word[]; settings: EditSettings };
}) => {
  const serveUrl = await getBundle();
  const words = o.project?.words.length ? o.project.words : markEmphasis(sample);
  const media = o.project?.media ?? { width: 1080, height: 1920, fps: 30, durationMs: (sample[sample.length - 1]?.endMs ?? 8000) + 800 };
  const settings = o.project?.settings ?? { cutSilences: false, minSilenceMs: 500 };
  const edit = buildEdit(words, settings, media.durationMs, media.fps);
  const kept = edit.captions;
  // Un mot important au-delà du premier écran, sinon un mot vers le tiers.
  const shown = kept.find((w) => w.emphasis && w.startMs > 1500) ?? kept[Math.floor(kept.length / 3)];
  const atMs = shown ? (shown.startMs + shown.endMs) / 2 : 0;
  const outMs = edit.segments ? toOutputMs(edit.segments, atMs) : atMs;
  const server = o.project ? await serveFile(o.project.videoPath) : null;
  try {
    const inputProps: CaptionedVideoProps = {
      videoSrc: server?.url ?? "",
      captions: words,
      segments: edit.segments,
      style: "perso",
      styleDef: o.styleDef,
      overrides: o.overrides,
      width: media.width,
      height: media.height,
      fps: media.fps,
      durationInFrames: edit.durationInFrames,
    };
    fs.mkdirSync(path.dirname(o.outPath), { recursive: true });
    await withEngine(async (engine) => {
      const opts = engineOptions(engine);
      const composition = await selectComposition({ serveUrl, id: "Captioned", inputProps, ...opts });
      await renderStill({
        serveUrl,
        composition,
        inputProps,
        frame: Math.min(edit.durationInFrames - 1, Math.round((outMs / 1000) * media.fps)),
        output: o.outPath,
        imageFormat: "jpeg",
        jpegQuality: 85,
        scale: o.scale ?? 0.5,
        ...opts,
      });
    });
    return o.outPath;
  } finally {
    server?.close();
  }
};

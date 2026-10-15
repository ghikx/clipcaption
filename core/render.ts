import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import type { CaptionedVideoProps } from "../src/CaptionedVideo";
import { buildEdit, type EditSettings } from "../src/edit";
import type { StyleName, StyleOverrides } from "../src/styles";
import type { Word } from "../src/words";
import type { MediaInfo } from "./media";
import { PUBLIC_DIR, ROOT } from "./paths";

// Le bundle Remotion (composition + polices) est construit une fois par processus.
let bundlePromise: Promise<string> | null = null;
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
      overrides: o.overrides,
      width: o.media.width,
      height: o.media.height,
      fps: o.media.fps,
      durationInFrames: edit.durationInFrames,
    };
    const browserExecutable = process.env.REMOTION_BROWSER ?? null;
    const composition = await selectComposition({ serveUrl, id: "Captioned", inputProps, browserExecutable });
    fs.mkdirSync(path.dirname(o.outPath), { recursive: true });
    await renderMedia({
      serveUrl,
      composition,
      inputProps,
      codec: "h264",
      outputLocation: o.outPath,
      browserExecutable,
      onProgress: ({ progress }) => o.onProgress?.(progress),
    });
    return { outPath: o.outPath, durationMs: (edit.durationInFrames / o.media.fps) * 1000 };
  } finally {
    media.close();
  }
};

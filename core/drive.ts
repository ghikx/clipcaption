import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream } from "node:stream/web";

export const parseDriveFileId = (url: string): string | null => {
  const m = /\/file\/d\/([\w-]{10,})/.exec(url) ?? /[?&]id=([\w-]{10,})/.exec(url);
  return m ? m[1] : null;
};

export const isDriveUrl = (s: string) => /^https?:\/\/(drive|docs)\.google\.com\//.test(s);

// Télécharge un fichier Google Drive partagé en « Tous les utilisateurs disposant du lien ».
// Les fichiers privés nécessitent OAuth (voir README).
export const downloadFromDrive = async (url: string): Promise<{ file: string; name: string }> => {
  const id = parseDriveFileId(url);
  if (!id) throw new Error("Lien Google Drive non reconnu. Utilise le lien « Partager » du fichier.");
  const res = await fetch(`https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`).catch((e) => {
    throw new Error(`Impossible de joindre Google Drive (${e.cause?.code ?? e.message}). Vérifie la connexion internet.`);
  });
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok || !res.body || type.includes("text/html")) {
    throw new Error(
      "Google Drive refuse le téléchargement. Vérifie que le partage est sur « Tous les utilisateurs disposant du lien ».",
    );
  }
  const disposition = res.headers.get("content-disposition") ?? "";
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
  const plain = /filename="([^"]+)"/i.exec(disposition)?.[1];
  const name = (encoded ? decodeURIComponent(encoded) : plain) ?? `drive-${id}.mp4`;
  const file = path.join(os.tmpdir(), `clipcaption-drive-${Date.now()}${path.extname(name) || ".mp4"}`);
  await pipeline(Readable.fromWeb(res.body as ReadableStream), fs.createWriteStream(file));
  return { file, name: path.basename(name, path.extname(name)) };
};

// Dossiers Google Drive pour ordinateur (macOS) : ~/Library/CloudStorage/GoogleDrive-<compte>/
// puis « Mon Drive » / « My Drive » (selon la langue du système), « Drive partagés »…
export const driveRoots = () => {
  const base = path.join(os.homedir(), "Library", "CloudStorage");
  if (!fs.existsSync(base)) return [];
  return fs
    .readdirSync(base)
    .filter((d) => d.startsWith("GoogleDrive"))
    .flatMap((d) => {
      const root = path.join(base, d);
      return fs.readdirSync(root).filter((s) => !s.startsWith(".")).map((s) => path.join(root, s));
    });
};

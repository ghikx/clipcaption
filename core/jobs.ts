import fs from "node:fs";
import path from "node:path";
import { styleFonts } from "./style-schema";
import { allStyles, resolveStyle } from "./styles-store";
import { ensureFonts } from "./fonts";
import { DEFAULT_MODEL } from "./whisper";
import { listProjects, projectDir, requireProject, sourcePath, updateProject, type Project } from "./projects";
import { renderEdit } from "./render";
import { transcribeFile, type Language } from "./transcribe";

// File d'attente par processus : une transcription ou un rendu à la fois, sinon la
// machine sature (whisper et Chrome utilisent tous les cœurs).
let queue: Promise<unknown> = Promise.resolve();
const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
  const next = queue.then(task, task);
  queue = next.catch(() => {});
  return next;
};

export const safeName = (name: string) => name.replace(/[\\/:*?"<>|]+/g, "-").trim() || "video";

// Copie l'export dans le dossier de sortie (ex. Google Drive synchronisé). Écrit d'abord un
// fichier temporaire caché puis le renomme, pour que Drive n'envoie jamais un fichier à moitié copié.
export const copyToOutput = (file: string, dir: string, name: string) => {
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, name);
  const tmp = path.join(dir, `.${name}.part`);
  fs.copyFileSync(file, tmp);
  fs.renameSync(tmp, target);
  return target;
};

// Limite les écritures de project.json pendant la progression.
const progressWriter = (id: string, status: Project["status"]) => {
  let last = 0;
  return (p: number) => {
    const now = Date.now();
    if (now - last < 700 && p < 1) return;
    last = now;
    updateProject(id, (proj) => {
      proj.status = status;
      proj.progress = Math.max(0, Math.min(1, p));
    });
  };
};

const fail = (id: string, e: unknown) => {
  const message = e instanceof Error ? e.message : String(e);
  updateProject(id, (p) => {
    p.status = "error";
    p.message = message;
  });
  throw e;
};

export const queueTranscription = (id: string, lang?: Language) => {
  updateProject(id, (p) => {
    p.status = "transcribing";
    p.progress = 0;
    p.message = null;
    p.jobPid = process.pid;
    if (lang) p.lang = lang;
  });
  return enqueue(async () => {
    const p = requireProject(id);
    try {
      const words = await transcribeFile(sourcePath(p), {
        lang: p.lang,
        model: (process.env.CLIPCAPTION_MODEL as typeof DEFAULT_MODEL) || DEFAULT_MODEL,
        onProgress: progressWriter(id, "transcribing"),
      });
      const done = updateProject(id, (proj) => {
        proj.words = words;
        proj.status = "ready";
        proj.progress = 1;
      });
      // Export automatique : mis en file après la transcription, sans attendre ici
      // (sinon la file attendrait sa propre tâche).
      if (done.autoExport) queueMicrotask(() => queueRender(id).catch(() => {}));
      return done;
    } catch (e) {
      return fail(id, e);
    }
  });
};

export const queueRender = (id: string) => {
  const before = requireProject(id);
  if (!before.words) throw new Error("Transcris la vidéo avant de l'exporter.");
  updateProject(id, (p) => {
    p.status = "rendering";
    p.progress = 0;
    p.message = null;
    p.jobPid = process.pid;
  });
  return enqueue(async () => {
    const p = requireProject(id);
    const file = `renders/${p.style}-${new Date().toISOString().replace(/[:.]/g, "-")}.mp4`;
    try {
      const styleDef = resolveStyle(p.style);
      if (!styleDef) throw new Error(`Le style « ${p.style} » n'existe plus : choisis-en un autre.`);
      await ensureFonts(styleFonts(styleDef));
      const result = await renderEdit({
        videoPath: sourcePath(p),
        media: p.media,
        words: p.words!,
        style: p.style,
        styleDef,
        overrides: p.overrides,
        settings: p.settings,
        outPath: path.join(projectDir(id), file),
        onProgress: progressWriter(id, "rendering"),
      });
      const copiedTo = p.outputDir ? copyToOutput(result.outPath, p.outputDir, p.outputName ?? `${safeName(p.name)}.sous-titres.mp4`) : undefined;
      updateProject(id, (proj) => {
        proj.status = "ready";
        proj.progress = 1;
        proj.renders.unshift({ file, style: p.style, createdAt: new Date().toISOString(), durationMs: result.durationMs, copiedTo });
      });
      return { file, absolutePath: result.outPath, copiedTo };
    } catch (e) {
      return fail(id, e);
    }
  });
};

const alive = (pid: number | undefined) => {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

// Un projet resté « en cours » alors que le processus qui le traitait est mort
// (serveur fermé pendant un rendu…) repasse en erreur, pour pouvoir relancer.
export const recoverStaleJobs = () => {
  for (const p of listProjects()) {
    if ((p.status === "transcribing" || p.status === "rendering") && !alive(p.jobPid)) {
      updateProject(p.id, (proj) => {
        proj.status = proj.words ? "ready" : "error";
        proj.message = "Traitement interrompu, relance-le.";
      });
    }
  }
};

export const styleList = () => allStyles().map(({ name, label, custom }) => ({ name, label, custom }));

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { EditSettings } from "../src/edit";
import type { StyleName, StyleOverrides } from "../src/styles";
import { styleExists } from "./styles-store";
import type { Word } from "../src/words";
import { makePreview, probe, thumbnail, type MediaInfo } from "./media";
import { PROJECTS_DIR } from "./paths";
import type { Language } from "./transcribe";

export type ProjectStatus = "uploaded" | "transcribing" | "ready" | "rendering" | "error";

export type RenderInfo = { file: string; style: StyleName; createdAt: string; durationMs: number };

export type Project = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  source: string;
  // Proxy d'aperçu (VP9) pour le lecteur de l'interface, absent tant qu'il n'est pas prêt.
  preview?: string;
  media: MediaInfo;
  lang: Language;
  status: ProjectStatus;
  progress: number;
  message: string | null;
  // Processus qui traite le projet, pour détecter un traitement interrompu.
  jobPid?: number;
  words: Word[] | null;
  style: StyleName;
  overrides: StyleOverrides;
  settings: EditSettings;
  renders: RenderInfo[];
};

export const projectDir = (id: string) => {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`Identifiant de projet invalide : ${id}`);
  return path.join(PROJECTS_DIR, id);
};
const projectFile = (id: string) => path.join(projectDir(id), "project.json");

export const sourcePath = (p: Project) => path.join(projectDir(p.id), p.source);

export const getProject = (id: string): Project | null => {
  try {
    return JSON.parse(fs.readFileSync(projectFile(id), "utf8"));
  } catch {
    return null;
  }
};

export const requireProject = (id: string): Project => {
  const p = getProject(id);
  if (!p) throw new Error(`Projet introuvable : ${id}`);
  return p;
};

// Écriture atomique : le serveur et le MCP peuvent lire le même projet en parallèle.
export const saveProject = (p: Project) => {
  p.updatedAt = new Date().toISOString();
  const tmp = `${projectFile(p.id)}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(p, null, 2));
  fs.renameSync(tmp, projectFile(p.id));
  return p;
};

export const updateProject = (id: string, change: (p: Project) => void) => {
  const p = requireProject(id);
  change(p);
  return saveProject(p);
};

export const listProjects = (): Project[] => {
  if (!fs.existsSync(PROJECTS_DIR)) return [];
  return fs
    .readdirSync(PROJECTS_DIR)
    .map((id) => getProject(id))
    .filter((p): p is Project => p !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};

const slug = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "video";

// Crée un projet à partir d'un fichier vidéo. `move` déplace le fichier (upload temporaire)
// au lieu de le copier.
export const createProject = async (
  file: string,
  { name, lang = "auto", style = "chenek", move = false }: { name?: string; lang?: Language; style?: string; move?: boolean } = {},
): Promise<Project> => {
  const displayName = name ?? path.basename(file, path.extname(file));
  const id = `${slug(displayName)}-${crypto.randomBytes(3).toString("hex")}`;
  const dir = projectDir(id);
  fs.mkdirSync(dir, { recursive: true });
  const source = `source${path.extname(file).toLowerCase() || ".mp4"}`;
  try {
    if (move) fs.renameSync(file, path.join(dir, source));
    else fs.copyFileSync(file, path.join(dir, source));
  } catch {
    // rename échoue entre deux disques : on copie puis on supprime.
    fs.copyFileSync(file, path.join(dir, source));
    if (move) fs.rmSync(file, { force: true });
  }
  try {
    const media = await probe(path.join(dir, source));
    await thumbnail(path.join(dir, source), path.join(dir, "thumb.jpg"), Math.min(1, media.durationMs / 2000)).catch(() => {});
    const now = new Date().toISOString();
    return saveProject({
      id,
      name: displayName,
      createdAt: now,
      updatedAt: now,
      source,
      media,
      lang,
      status: "uploaded",
      progress: 0,
      message: null,
      words: null,
      style: styleExists(style) ? style : "chenek",
      overrides: {},
      settings: { cutSilences: false, minSilenceMs: 500 },
      renders: [],
    });
  } catch (e) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw e;
  }
};

export const deleteProject = (id: string) => fs.rmSync(projectDir(id), { recursive: true, force: true });

// Génère le proxy d'aperçu en arrière-plan, une seule fois par projet et par processus.
const previewsInProgress = new Set<string>();
export const ensurePreview = (id: string) => {
  const p = getProject(id);
  if (!p || p.preview || previewsInProgress.has(id)) return;
  previewsInProgress.add(id);
  const tmp = path.join(projectDir(id), "preview.tmp.webm");
  makePreview(sourcePath(p), tmp)
    .then(() => {
      fs.renameSync(tmp, path.join(projectDir(id), "preview.webm"));
      updateProject(id, (proj) => {
        proj.preview = "preview.webm";
      });
    })
    .catch((e) => console.error(`[aperçu ${id}]`, e instanceof Error ? e.message : e))
    .finally(() => previewsInProgress.delete(id));
};

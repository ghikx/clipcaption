// Traitement par lot : toutes les vidéos d'un dossier avec la même configuration.
// Une vidéo est considérée comme faite si « <nom>.sous-titres.mp4 » existe déjà dans le
// dossier de sortie : on peut relancer un lot sans refaire ce qui est terminé.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { configToProject, expandHome, type Config } from "./configs";
import { queueRender, queueTranscription, safeName } from "./jobs";
import { createProject, saveProject } from "./projects";
import { WORKSPACE } from "./paths";

const VIDEO = /\.(mp4|mov|m4v|webm|mkv)$/i;
export const OUTPUT_SUFFIX = ".sous-titres.mp4";

export const outputNameFor = (file: string) => `${safeName(path.basename(file, path.extname(file)))}${OUTPUT_SUFFIX}`;

// Dossier de sortie par défaut : « Sous-titrées » à côté des vidéos.
export const defaultOutputDir = (inputDir: string) => path.join(inputDir, "Sous-titrées");

export type BatchItem = { file: string; status: "pending" | "done" | "skipped" | "error"; output?: string; projectId?: string; error?: string };

export type Batch = {
  id: string;
  inputDir: string;
  outputDir: string;
  config: string;
  status: "running" | "finished";
  startedAt: string;
  finishedAt?: string;
  items: BatchItem[];
};

const BATCH_DIR = path.join(WORKSPACE, "batches");
const saveBatch = (b: Batch) => {
  fs.mkdirSync(BATCH_DIR, { recursive: true });
  fs.writeFileSync(path.join(BATCH_DIR, `${b.id}.json`), JSON.stringify(b, null, 2));
};

export const getBatch = (id: string): Batch | null => {
  try {
    return JSON.parse(fs.readFileSync(path.join(BATCH_DIR, `${id.replace(/[^a-z0-9-]/g, "")}.json`), "utf8"));
  } catch {
    return null;
  }
};

// Vidéos d'un dossier (non récursif), avec leur état par rapport au dossier de sortie.
export const scanFolder = (inputDir: string, outputDir = defaultOutputDir(inputDir)) => {
  const dir = path.resolve(expandHome(inputDir));
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new Error(`Dossier introuvable : ${dir}`);
  const out = path.resolve(expandHome(outputDir));
  return fs
    .readdirSync(dir)
    .filter((f) => VIDEO.test(f) && !f.startsWith(".") && !f.endsWith(OUTPUT_SUFFIX))
    .sort((a, b) => a.localeCompare(b, "fr"))
    .map((f) => ({ file: path.join(dir, f), done: fs.existsSync(path.join(out, outputNameFor(f))) }));
};

export type BatchEvent =
  | { type: "start"; file: string; index: number; total: number }
  | { type: "done"; file: string; output: string }
  | { type: "skip"; file: string }
  | { type: "error"; file: string; error: string };

// Lance un lot. Les vidéos sont traitées une par une (même file que l'interface).
export const newBatchId = () => `lot-${new Date().toISOString().slice(0, 10)}-${crypto.randomBytes(3).toString("hex")}`;

// Le lot est enregistré avant le premier await : getBatch(id) marche dès le retour de l'appel.
export const runBatch = async ({
  id = newBatchId(),
  inputDir,
  outputDir,
  config,
  onEvent,
}: {
  id?: string;
  inputDir: string;
  outputDir?: string;
  config: Config;
  onEvent?: (e: BatchEvent) => void;
}): Promise<Batch> => {
  const out = path.resolve(expandHome(outputDir ?? config.outputDir ?? defaultOutputDir(path.resolve(expandHome(inputDir)))));
  const files = scanFolder(inputDir, out);
  const batch: Batch = {
    id,
    inputDir: path.resolve(expandHome(inputDir)),
    outputDir: out,
    config: config.name,
    status: "running",
    startedAt: new Date().toISOString(),
    items: files.map(({ file, done }) => ({ file, status: done ? "skipped" : "pending" })),
  };
  saveBatch(batch);
  const todo = batch.items.filter((i) => i.status === "pending");
  let index = 0;
  for (const item of batch.items) {
    if (item.status === "skipped") {
      onEvent?.({ type: "skip", file: item.file });
      continue;
    }
    onEvent?.({ type: "start", file: item.file, index: ++index, total: todo.length });
    try {
      const settings = configToProject(config);
      const project = await createProject(item.file, { lang: settings.lang, style: settings.style });
      item.projectId = project.id;
      saveProject({ ...project, settings: settings.settings, overrides: settings.overrides, outputDir: out, outputName: outputNameFor(item.file) });
      saveBatch(batch);
      await queueTranscription(project.id);
      const result = await queueRender(project.id);
      item.status = "done";
      item.output = result.copiedTo;
      onEvent?.({ type: "done", file: item.file, output: result.copiedTo! });
    } catch (e) {
      item.status = "error";
      item.error = e instanceof Error ? e.message : String(e);
      onEvent?.({ type: "error", file: item.file, error: item.error });
    }
    saveBatch(batch);
  }
  batch.status = "finished";
  batch.finishedAt = new Date().toISOString();
  saveBatch(batch);
  return batch;
};

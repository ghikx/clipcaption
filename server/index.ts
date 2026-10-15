// Serveur local de l'interface : API projets + fichiers + interface web compilée.
// Lancer : npm run app  ->  http://localhost:4321
import express, { type NextFunction, type Request, type Response } from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import multer from "multer";
import { downloadFromDrive } from "../core/drive";
import { queueRender, queueTranscription, recoverStaleJobs, styleList } from "../core/jobs";
import { PUBLIC_DIR, ROOT, UI_PORT } from "../core/paths";
import {
  createProject,
  deleteProject,
  ensurePreview,
  getProject,
  listProjects,
  projectDir,
  requireProject,
  saveProject,
  type Project,
} from "../core/projects";
import { whisperStatus, type Language } from "../core/transcribe";
import { isStyleName } from "../src/styles";
import type { Word } from "../src/words";

const UI_DIR = path.join(ROOT, "dist", "app");
const app = express();
app.use(express.json({ limit: "20mb" }));

const upload = multer({ dest: path.join(os.tmpdir(), "clipcaption-uploads"), limits: { fileSize: 8 * 1024 ** 3 } });

const pid = (req: Request) => String(req.params.id);
const asLang = (v: unknown): Language => (v === "fr" || v === "en" ? v : "auto");

// Les erreurs async remontent en JSON { error } au lieu de faire tomber le serveur.
const route =
  (fn: (req: Request, res: Response) => Promise<unknown> | unknown) => (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res)).catch(next);

// Les jobs tournent en arrière-plan : leur erreur est déjà enregistrée dans le projet.
const background = (p: Promise<unknown>) => p.catch((e) => console.error("[job]", e instanceof Error ? e.message : e));

app.get("/api/info", (_req, res) => {
  const model = (process.env.CLIPCAPTION_MODEL as Parameters<typeof whisperStatus>[0]) || undefined;
  res.json({
    root: ROOT,
    whisper: whisperStatus(model),
    // Chemins absolus : Claude lance le serveur MCP depuis un autre dossier, où `npx tsx`
    // ne trouverait pas tsx (et attendrait une confirmation d'installation).
    mcpCommand: `claude mcp add clipcaption -- node "${path.join(ROOT, "node_modules", "tsx", "dist", "cli.mjs")}" "${path.join(ROOT, "core", "mcp.ts")}"`,
  });
});

app.get("/api/styles", (_req, res) => {
  res.json(styleList());
});

app.get("/api/projects", (_req, res) => {
  res.json(listProjects().map(({ words, ...p }) => ({ ...p, wordCount: words?.length ?? 0 })));
});

app.post(
  "/api/projects",
  upload.single("file"),
  route(async (req, res) => {
    if (!req.file) throw new Error("Aucun fichier reçu.");
    const name = path.basename(req.file.originalname, path.extname(req.file.originalname));
    // multer enregistre sans extension : on la remet pour ffmpeg.
    const withExt = `${req.file.path}${path.extname(req.file.originalname).toLowerCase() || ".mp4"}`;
    fs.renameSync(req.file.path, withExt);
    const project = await createProject(withExt, { name, lang: asLang(req.body.lang), move: true });
    ensurePreview(project.id);
    background(queueTranscription(project.id));
    res.status(201).json(getProject(project.id));
  }),
);

app.post(
  "/api/projects/drive",
  route(async (req, res) => {
    const { file, name } = await downloadFromDrive(String(req.body.url ?? ""));
    const project = await createProject(file, { name, lang: asLang(req.body.lang), move: true });
    ensurePreview(project.id);
    background(queueTranscription(project.id));
    res.status(201).json(getProject(project.id));
  }),
);

app.get("/api/projects/:id", (req, res) => {
  const p = getProject(pid(req));
  if (!p) return void res.status(404).json({ error: "Projet introuvable" });
  // Projets créés par le CLI ou par Claude : l'aperçu est fabriqué à la première ouverture.
  ensurePreview(p.id);
  res.json(p);
});

// Mise à jour depuis l'éditeur (sauvegarde automatique) : seuls les champs éditables.
app.patch(
  "/api/projects/:id",
  route((req, res) => {
    const p = requireProject(pid(req));
    const b = req.body as Partial<Project>;
    if (typeof b.name === "string" && b.name.trim()) p.name = b.name.trim().slice(0, 120);
    if (typeof b.style === "string" && isStyleName(b.style)) p.style = b.style;
    if (b.overrides && typeof b.overrides === "object") p.overrides = b.overrides;
    if (b.settings && typeof b.settings === "object") {
      p.settings = {
        cutSilences: Boolean(b.settings.cutSilences),
        minSilenceMs: Math.max(100, Math.min(3000, Number(b.settings.minSilenceMs) || 500)),
      };
    }
    if (Array.isArray(b.words) && p.words) {
      // Le nombre de mots et leurs timestamps viennent de la transcription : on n'accepte
      // que le texte, les coupes et les mises en avant.
      if (b.words.length !== p.words.length) throw new Error("Transcription modifiée entre-temps, recharge la page.");
      p.words = p.words.map((w, i): Word => {
        const n = b.words![i];
        return { ...w, text: typeof n.text === "string" ? n.text : w.text, cut: Boolean(n.cut), emphasis: Boolean(n.emphasis) };
      });
    }
    res.json(saveProject(p));
  }),
);

app.post(
  "/api/projects/:id/transcribe",
  route((req, res) => {
    requireProject(pid(req));
    background(queueTranscription(pid(req), asLang(req.body?.lang)));
    res.json(getProject(pid(req)));
  }),
);

app.post(
  "/api/projects/:id/render",
  route((req, res) => {
    background(queueRender(pid(req)));
    res.json(getProject(pid(req)));
  }),
);

app.delete("/api/projects/:id", (req, res) => {
  deleteProject(pid(req));
  res.status(204).end();
});

// Vidéos sources, miniatures et rendus d'un projet (Range géré par express.static).
app.use("/media/:id", (req, res, next) => {
  try {
    express.static(projectDir(pid(req)), { fallthrough: false, dotfiles: "deny" })(req, res, next);
  } catch (e) {
    next(e);
  }
});
app.use("/fonts", express.static(path.join(PUBLIC_DIR, "fonts"), { maxAge: "7d" }));

if (fs.existsSync(UI_DIR)) {
  app.use(express.static(UI_DIR));
  app.get(/^\/(?!api|media|fonts).*/, (_req, res) => res.sendFile(path.join(UI_DIR, "index.html")));
} else {
  app.get("/", (_req, res) => res.send("Interface non compilée : lance `npm run app`."));
}

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = err instanceof Error ? err.message : String(err);
  res.status(400).json({ error: message });
});

recoverStaleJobs();
app.listen(UI_PORT, "127.0.0.1", () => {
  console.log(`\n  clipcaption  ->  http://localhost:${UI_PORT}\n`);
});

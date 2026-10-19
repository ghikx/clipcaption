// Serveur local de l'interface : API projets + fichiers + interface web compilée.
// Lancer : npm run app  ->  http://localhost:4321
import express, { type NextFunction, type Request, type Response } from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import multer from "multer";
import { downloadFromDrive, driveRoots } from "../core/drive";
import { configToProject, expandHome, getConfig, listConfigs, saveConfig } from "../core/configs";
import { cancelJob, queueRender, queueTranscription, recoverStaleJobs } from "../core/jobs";
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
  updateProject,
  type Project,
} from "../core/projects";
import { whisperStatus, type Language } from "../core/transcribe";
import { fontFamilies, installGoogleFont } from "../core/fonts";
import { makeThumb } from "../core/style-thumbs";
import { allStyles, deleteCustomStyle, getCustomStyle, saveCustomStyle, styleExists, thumbPath } from "../core/styles-store";
import type { Word } from "../src/words";

const UI_DIR = path.join(ROOT, "dist", "app");
const app = express();
app.use(express.json({ limit: "20mb" }));

// defParamCharset utf8 : sinon les noms de fichiers accentués (« Épisode 2.mp4 ») sont lus
// en latin1 et arrivent corrompus (« Ã‰pisode 2.mp4 »).
const upload = multer({
  dest: path.join(os.tmpdir(), "clipcaption-uploads"),
  limits: { fileSize: 8 * 1024 ** 3 },
  defParamCharset: "utf8",
});

const pid = (req: Request) => String(req.params.id);
const asLang = (v: unknown): Language => (v === "fr" || v === "en" ? v : "auto");

// Les erreurs async remontent en JSON { error } au lieu de faire tomber le serveur.
const route =
  (fn: (req: Request, res: Response) => Promise<unknown> | unknown) => (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res)).catch(next);

// Applique une configuration enregistrée à un projet (style, coupes, ajustements, dossier
// de sortie). La langue choisie à l'upload reste prioritaire, sauf « auto ».
const applyConfig = (id: string, configName: unknown, autoExport?: boolean) => {
  if (typeof configName !== "string" || !configName) {
    if (autoExport !== undefined) updateProject(id, (p) => void (p.autoExport = autoExport));
    return;
  }
  const s = configToProject(getConfig(configName));
  updateProject(id, (p) => {
    p.style = s.style;
    p.settings = s.settings;
    p.overrides = s.overrides;
    p.config = configName;
    if (p.lang === "auto") p.lang = s.lang;
    if (s.outputDir) p.outputDir = s.outputDir;
    if (autoExport !== undefined) p.autoExport = autoExport;
  });
};

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

// Préréglages + styles perso, avec leur définition complète (le designer en part).
app.get("/api/styles", (_req, res) => {
  res.json(
    allStyles().map((s) => ({
      ...s,
      thumb: s.custom ? (fs.existsSync(thumbPath(s.name)) ? `/api/styles/${s.name}/thumb?v=${fs.statSync(thumbPath(s.name)).mtimeMs}` : null) : `/styles/${s.name}.jpg`,
    })),
  );
});

app.post(
  "/api/styles",
  route(async (req, res) => {
    const style = await saveCustomStyle({ name: String(req.body.name ?? ""), base: req.body.base, changes: req.body.changes });
    makeThumb(style).catch(() => {});
    res.status(201).json(style);
  }),
);

app.put(
  "/api/styles/:id",
  route(async (req, res) => {
    const id = pid(req);
    const current = getCustomStyle(id);
    if (!current) throw new Error("Style introuvable.");
    const style = await saveCustomStyle({ id, name: String(req.body.name ?? current.name), changes: req.body.changes });
    makeThumb(style).catch(() => {});
    res.json(style);
  }),
);

app.delete("/api/styles/:id", (req, res) => {
  const id = pid(req);
  deleteCustomStyle(id);
  // Les projets qui utilisaient ce style repassent sur le style par défaut.
  for (const p of listProjects()) {
    if (p.style === id) {
      const full = getProject(p.id);
      if (full) saveProject({ ...full, style: "chenek" });
    }
  }
  res.status(204).end();
});

app.get("/api/styles/:id/thumb", (req, res) => {
  const file = thumbPath(pid(req));
  if (!fs.existsSync(file)) return void res.status(404).end();
  res.sendFile(file);
});

app.get("/api/configs", (_req, res) => {
  res.json(listConfigs());
});

app.post(
  "/api/configs",
  route((req, res) => {
    res.status(201).json(saveConfig(req.body));
  }),
);

app.get("/api/drive-roots", (_req, res) => {
  res.json(driveRoots());
});

app.get("/api/fonts", (_req, res) => {
  res.json(fontFamilies());
});

app.post(
  "/api/fonts",
  route(async (req, res) => {
    const entries = await installGoogleFont(String(req.body.family ?? ""));
    res.status(201).json({ family: entries[0]?.family, entries });
  }),
);

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
    applyConfig(project.id, req.body.config, req.body.autoExport === "true");
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
    applyConfig(project.id, req.body.config, req.body.autoExport === true);
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
    if (typeof b.style === "string" && styleExists(b.style)) p.style = b.style;
    if (b.overrides && typeof b.overrides === "object") p.overrides = b.overrides;
    if (b.outputDir === null || b.outputDir === "") delete p.outputDir;
    else if (typeof b.outputDir === "string") p.outputDir = path.resolve(expandHome(b.outputDir.trim()));
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

// Actions sur plusieurs projets depuis la page Projets.
app.post(
  "/api/projects/bulk",
  route((req, res) => {
    const ids: string[] = Array.isArray(req.body.ids) ? req.body.ids.map(String) : [];
    const results = ids.map((id) => {
      try {
        if (req.body.action === "delete") {
          cancelJob(id);
          deleteProject(id);
          return { id, ok: true };
        }
        if (req.body.config) applyConfig(id, req.body.config);
        if (req.body.action === "export") {
          const p = requireProject(id);
          // Pas encore transcrit : exporté automatiquement à la fin de la transcription.
          if (!p.words) {
            updateProject(id, (proj) => void (proj.autoExport = true));
            return { id, queued: "after-transcription" };
          }
          background(queueRender(id));
        }
        return { id, ok: true };
      } catch (e) {
        return { id, error: e instanceof Error ? e.message : String(e) };
      }
    });
    res.json(results);
  }),
);

app.delete("/api/projects/:id", (req, res) => {
  cancelJob(pid(req));
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

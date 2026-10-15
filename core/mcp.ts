// Serveur MCP : permet à Claude (Desktop ou Code) d'utiliser clipcaption.
// Les projets créés ici apparaissent aussi dans l'interface web, et inversement.
import "./stdio-guard";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { STYLES, isStyleName } from "../src/styles";
import { downloadFromDrive, isDriveUrl } from "./drive";
import { queueRender, queueTranscription, recoverStaleJobs, styleList } from "./jobs";
import { UI_PORT } from "./paths";
import { assertWhisperInstalled } from "./transcribe";
import { DEFAULT_MODEL } from "./whisper";
import type { WhisperModel } from "@remotion/install-whisper-cpp";
import { createProject, listProjects, projectDir, requireProject, saveProject, type Project } from "./projects";

const server = new McpServer({ name: "clipcaption", version: "1.0.0" });

const styleNames = Object.keys(STYLES) as [string, ...string[]];
const editUrl = (id: string) => `http://localhost:${UI_PORT}/#/p/${id}`;
const text = (value: unknown) => ({
  content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }],
});

// Les clients MCP coupent les appels trop longs : on attend au plus `ms`, puis on rend
// la main en indiquant comment suivre la suite (le traitement continue).
const waitAtMost = async <T>(p: Promise<T>, ms: number): Promise<T | "pending"> =>
  Promise.race([p, new Promise<"pending">((r) => setTimeout(() => r("pending"), ms))]);

const summary = (p: Project) => ({
  project_id: p.id,
  name: p.name,
  status: p.status,
  progress: `${Math.round(p.progress * 100)} %`,
  message: p.message,
  style: p.style,
  duration_s: Math.round(p.media.durationMs / 100) / 10,
  words: p.words?.length ?? 0,
  cut_silences: p.settings.cutSilences,
  last_render: p.renders[0] ? path.join(projectDir(p.id), p.renders[0].file) : null,
  edit_in_ui: editUrl(p.id),
});

server.registerTool(
  "list_styles",
  { title: "Lister les styles", description: "Liste les styles de sous-titres disponibles.", inputSchema: {} },
  async () => text(styleList()),
);

server.registerTool(
  "caption_video",
  {
    title: "Sous-titrer une vidéo",
    description:
      "Transcrit une vidéo (FR/EN) et l'exporte avec des sous-titres animés. Accepte un chemin local ou un lien de partage Google Drive. " +
      "Rend le chemin du MP4 final. Si le traitement dépasse ~50 s, renvoie le statut : appeler ensuite get_project pour suivre.",
    inputSchema: {
      source: z.string().describe("Chemin absolu d'un fichier vidéo, ou lien de partage Google Drive"),
      style: z.enum(styleNames).optional().describe("Style de sous-titres (défaut : chenek)"),
      language: z.enum(["fr", "en", "auto"]).optional().describe("Langue parlée (défaut : auto)"),
      cut_silences: z.boolean().optional().describe("Couper les blancs entre les mots (défaut : false)"),
      min_silence_ms: z.number().int().min(100).max(3000).optional().describe("Durée minimale d'un blanc à couper (défaut : 500)"),
      accent: z.string().optional().describe("Couleur d'accent CSS, ex. #EEF26B"),
    },
  },
  async ({ source, style, language, cut_silences, min_silence_ms, accent }) => {
    // Vérifié avant de créer le projet, pour ne pas laisser de projet en erreur.
    assertWhisperInstalled((process.env.CLIPCAPTION_MODEL as WhisperModel) || DEFAULT_MODEL);
    let file = source;
    let name: string | undefined;
    if (isDriveUrl(source)) ({ file, name } = await downloadFromDrive(source));
    else if (!fs.existsSync(source)) throw new Error(`Fichier introuvable : ${source}`);
    const project = await createProject(file, { name, lang: language ?? "auto", style, move: isDriveUrl(source) });
    project.settings = { cutSilences: cut_silences ?? false, minSilenceMs: min_silence_ms ?? 500 };
    if (accent) project.overrides = { accent };
    saveProject(project);

    const pipeline = queueTranscription(project.id).then(() => queueRender(project.id));
    pipeline.catch(() => {});
    const result = await waitAtMost(pipeline, 50_000);
    const p = requireProject(project.id);
    if (result === "pending") {
      return text({ ...summary(p), note: "Traitement en cours. Appelle get_project avec ce project_id pour suivre." });
    }
    return text({ ...summary(p), output: result.absolutePath });
  },
);

server.registerTool(
  "list_projects",
  { title: "Lister les projets", description: "Liste les projets de sous-titrage (les plus récents d'abord).", inputSchema: {} },
  async () => text(listProjects().map(summary)),
);

server.registerTool(
  "get_project",
  {
    title: "État d'un projet",
    description: "Statut, progression et dernier export d'un projet.",
    inputSchema: { project_id: z.string() },
  },
  async ({ project_id }) => text(summary(requireProject(project_id))),
);

server.registerTool(
  "get_transcript",
  {
    title: "Lire la transcription",
    description:
      "Transcription mot par mot, au format « [index] mot ». Les mots coupés sont marqués ~~barrés~~, les mots mis en avant *ainsi*. " +
      "Les index servent à edit_project.",
    inputSchema: { project_id: z.string() },
  },
  async ({ project_id }) => {
    const p = requireProject(project_id);
    if (!p.words) return text(`Pas encore de transcription (statut : ${p.status}).`);
    const lines = p.words.map((w, i) => {
      const t = w.text.trim();
      const shown = w.cut ? `~~${t}~~` : w.emphasis ? `*${t}*` : t;
      return `[${i}] ${shown} (${(w.startMs / 1000).toFixed(2)} s)`;
    });
    return text(lines.join("\n"));
  },
);

const range = z.tuple([z.number().int().min(0), z.number().int().min(0)]);

server.registerTool(
  "edit_project",
  {
    title: "Modifier un projet",
    description:
      "Change le style et le montage, coupe ou restaure des passages (plages d'index de mots, bornes incluses), " +
      "met en avant des mots, corrige le texte. Appeler ensuite render_project pour exporter.",
    inputSchema: {
      project_id: z.string(),
      style: z.enum(styleNames).optional(),
      accent: z.string().optional(),
      size_scale: z.number().min(0.5).max(2).optional().describe("Taille du texte, 1 = normal"),
      position: z.number().min(0.1).max(0.95).optional().describe("Position verticale, 0 = haut, 1 = bas"),
      max_words: z.number().int().min(1).max(8).optional().describe("Mots par écran"),
      cut_silences: z.boolean().optional(),
      min_silence_ms: z.number().int().min(100).max(3000).optional(),
      cut_ranges: z.array(range).optional().describe("Plages [début, fin] d'index de mots à couper"),
      restore_ranges: z.array(range).optional().describe("Plages [début, fin] d'index de mots à restaurer"),
      emphasize: z.array(z.number().int()).optional(),
      deemphasize: z.array(z.number().int()).optional(),
      replace_text: z.array(z.object({ index: z.number().int(), text: z.string() })).optional(),
    },
  },
  async (a) => {
    const p = requireProject(a.project_id);
    if (a.style && isStyleName(a.style)) p.style = a.style;
    const o = { ...p.overrides };
    if (a.accent !== undefined) o.accent = a.accent;
    if (a.size_scale !== undefined) o.sizeScale = a.size_scale;
    if (a.position !== undefined) o.position = a.position;
    if (a.max_words !== undefined) o.maxWords = a.max_words;
    p.overrides = o;
    if (a.cut_silences !== undefined) p.settings.cutSilences = a.cut_silences;
    if (a.min_silence_ms !== undefined) p.settings.minSilenceMs = a.min_silence_ms;
    if (p.words) {
      const words = p.words;
      const each = (ranges: [number, number][] | undefined, f: (i: number) => void) =>
        ranges?.forEach(([s, e]) => {
          for (let i = Math.max(0, Math.min(s, e)); i <= Math.min(words.length - 1, Math.max(s, e)); i++) f(i);
        });
      each(a.cut_ranges, (i) => (words[i].cut = true));
      each(a.restore_ranges, (i) => (words[i].cut = false));
      a.emphasize?.forEach((i) => words[i] && (words[i].emphasis = true));
      a.deemphasize?.forEach((i) => words[i] && (words[i].emphasis = false));
      // Garde l'espace de tête, qui sépare les mots dans les sous-titres.
      a.replace_text?.forEach(({ index, text: t }) => {
        if (words[index]) words[index].text = (index === 0 ? "" : " ") + t.trim();
      });
    }
    return text(summary(saveProject(p)));
  },
);

server.registerTool(
  "render_project",
  {
    title: "Exporter un projet",
    description: "Exporte le projet en MP4 avec ses réglages actuels. Rend le chemin du fichier, ou le statut si l'export dure plus de ~50 s.",
    inputSchema: { project_id: z.string() },
  },
  async ({ project_id }) => {
    const job = queueRender(project_id);
    job.catch(() => {});
    const result = await waitAtMost(job, 50_000);
    const p = requireProject(project_id);
    if (result === "pending") return text({ ...summary(p), note: "Export en cours. Appelle get_project pour suivre." });
    return text({ ...summary(p), output: result.absolutePath });
  },
);

server.registerTool(
  "transcribe_again",
  {
    title: "Relancer la transcription",
    description: "Retranscrit la vidéo, par exemple avec une autre langue. Écrase les corrections de texte et les coupes.",
    inputSchema: { project_id: z.string(), language: z.enum(["fr", "en", "auto"]).optional() },
  },
  async ({ project_id, language }) => {
    const job = queueTranscription(project_id, language);
    job.catch(() => {});
    await waitAtMost(job, 50_000);
    return text(summary(requireProject(project_id)));
  },
);

recoverStaleJobs();
await server.connect(new StdioServerTransport());
console.error("clipcaption MCP prêt");

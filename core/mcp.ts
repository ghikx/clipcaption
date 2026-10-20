// Serveur MCP : permet à Claude (Desktop ou Code) d'utiliser clipcaption.
// Les projets créés ici apparaissent aussi dans l'interface web, et inversement.
import "./stdio-guard";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import os from "node:os";
import { fontFamilies, installGoogleFont } from "./fonts";
import { renderStyleStill } from "./render";
import { partialStyleSchema, styleFonts } from "./style-schema";
import { makeThumb } from "./style-thumbs";
import { allStyles, deleteCustomStyle, getCustomStyle, resolveStyle, saveCustomStyle, styleExists } from "./styles-store";
import { ensureFonts } from "./fonts";
import { sourcePath } from "./projects";
import type { CaptionStyle, StyleOverrides } from "../src/styles";
import { downloadFromDrive, driveRoots, isDriveUrl } from "./drive";
import { queueRender, queueTranscription, recoverStaleJobs, styleList } from "./jobs";
import { UI_PORT } from "./paths";
import { defaultOutputDir, getBatch, newBatchId, outputNameFor, runBatch, scanFolder } from "./batch";
import { configSchema, configToProject, expandHome, getConfig, listConfigs, saveConfig, type Config } from "./configs";
import { assertWhisperInstalled } from "./transcribe";
import { DEFAULT_MODEL } from "./whisper";
import type { WhisperModel } from "@remotion/install-whisper-cpp";
import { createProject, listProjects, projectDir, requireProject, saveProject, type Project } from "./projects";

const server = new McpServer({ name: "clipcaption", version: "1.0.0" });

const styleName = z.string().describe("Nom d'un préréglage (list_styles) ou identifiant d'un style perso (perso-…)");
const checkStyle = (name: string | undefined) => {
  if (name && !styleExists(name)) throw new Error(`Style inconnu : ${name}. Utilise list_styles.`);
};
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
  {
    title: "Lister les styles",
    description: "Liste les styles de sous-titres : préréglages et styles perso (custom: true). get_style donne la définition complète d'un style.",
    inputSchema: {},
  },
  async () => text(styleList()),
);

server.registerTool(
  "get_style",
  {
    title: "Définition d'un style",
    description: "Rend la définition JSON complète d'un style, pour s'en inspirer ou la modifier avec create_style / update_style.",
    inputSchema: { name: styleName },
  },
  async ({ name }) => {
    const def = resolveStyle(name);
    if (!def) throw new Error(`Style inconnu : ${name}`);
    return text(def);
  },
);

// Image d'aperçu renvoyée à Claude : il voit le résultat et peut corriger le style.
const previewImage = async (styleDef: CaptionStyle, projectId?: string, overrides?: StyleOverrides) => {
  await ensureFonts(styleFonts(styleDef));
  const p = projectId ? requireProject(projectId) : null;
  const out = path.join(os.tmpdir(), `clipcaption-preview-${Date.now()}.jpg`);
  await renderStyleStill({
    styleDef,
    overrides: overrides ?? p?.overrides,
    outPath: out,
    scale: 0.5,
    project: p?.words ? { videoPath: sourcePath(p), media: p.media, words: p.words, settings: p.settings } : undefined,
  });
  const data = fs.readFileSync(out).toString("base64");
  fs.rmSync(out, { force: true });
  return { type: "image" as const, data, mimeType: "image/jpeg" };
};

const designHelp =
  "Tous les champs sont optionnels et documentés dans le schéma : police Google Fonts (installée automatiquement), couleurs, pastilles, " +
  "contour, ombre/lueur (text-shadow en em), dégradé, fond de bloc (verre avec blur), mise en avant des mots importants, " +
  "animation d'entrée, apparition mot par mot ou lettre par lettre, mode chaos, position, alignement, mots par écran. " +
  "Rend une image d'aperçu : regarde-la et corrige avec update_style si besoin.";

server.registerTool(
  "create_style",
  {
    title: "Créer un style",
    description: `Crée un style de sous-titres perso à partir d'un style existant (base) et des champs à changer. ${designHelp}`,
    inputSchema: {
      name: z.string().min(1).max(60).describe("Nom du style"),
      base: styleName.optional().describe("Style de départ (défaut : chenek)"),
      changes: partialStyleSchema.describe("Champs à modifier par rapport au style de départ"),
      preview_project_id: z.string().optional().describe("Projet sur lequel montrer l'aperçu (sinon phrase d'exemple)"),
    },
  },
  async ({ name, base, changes, preview_project_id }) => {
    checkStyle(base);
    const style = await saveCustomStyle({ name, base, changes });
    makeThumb(style).catch(() => {});
    const image = await previewImage(style.definition, preview_project_id);
    return { content: [{ type: "text" as const, text: JSON.stringify({ id: style.id, name: style.name }, null, 2) }, image] };
  },
);

server.registerTool(
  "update_style",
  {
    title: "Modifier un style perso",
    description: `Modifie des champs d'un style perso (id perso-…). ${designHelp}`,
    inputSchema: {
      id: z.string(),
      name: z.string().max(60).optional(),
      changes: partialStyleSchema,
      preview_project_id: z.string().optional(),
    },
  },
  async ({ id, name, changes, preview_project_id }) => {
    const current = getCustomStyle(id);
    if (!current) throw new Error(`Style perso introuvable : ${id}. Les préréglages ne se modifient pas : crée un style avec base.`);
    const style = await saveCustomStyle({ id, name: name ?? current.name, changes });
    makeThumb(style).catch(() => {});
    const image = await previewImage(style.definition, preview_project_id);
    return { content: [{ type: "text" as const, text: JSON.stringify({ id: style.id, name: style.name }, null, 2) }, image] };
  },
);

server.registerTool(
  "preview_style",
  {
    title: "Voir un style",
    description: "Rend une image d'un style (existant, ou existant + changements non enregistrés), sur un projet ou sur une phrase d'exemple.",
    inputSchema: {
      style: styleName.optional().describe("Défaut : chenek"),
      changes: partialStyleSchema.optional().describe("Changements à essayer sans enregistrer"),
      project_id: z.string().optional(),
    },
  },
  async ({ style, changes, project_id }) => {
    checkStyle(style);
    const def = { ...resolveStyle(style ?? "chenek")!, ...(changes ?? {}) } as CaptionStyle;
    return { content: [await previewImage(def, project_id)] };
  },
);

server.registerTool(
  "delete_style",
  { title: "Supprimer un style perso", description: "Supprime un style perso.", inputSchema: { id: z.string() } },
  async ({ id }) => {
    deleteCustomStyle(id);
    return text(`Style ${id} supprimé.`);
  },
);

server.registerTool(
  "list_fonts",
  { title: "Polices installées", description: "Polices disponibles localement. Toute autre police Google Fonts peut être installée.", inputSchema: {} },
  async () => text(fontFamilies()),
);

server.registerTool(
  "install_font",
  {
    title: "Installer une police",
    description: "Télécharge une police Google Fonts (toutes graisses et italiques) pour l'utiliser dans un style.",
    inputSchema: { family: z.string().describe("Nom exact sur fonts.google.com, ex. Space Grotesk") },
  },
  async ({ family }) => {
    const entries = await installGoogleFont(family);
    return text({ family: entries[0]?.family, variants: entries.map((e) => `${e.style} ${e.weight}`) });
  },
);

server.registerTool(
  "caption_video",
  {
    title: "Sous-titrer une vidéo",
    description:
      "Transcrit une vidéo (FR/EN) et l'exporte avec des sous-titres animés. Accepte un chemin local (y compris un dossier Google Drive " +
      "pour ordinateur) ou un lien de partage Google Drive. Une configuration enregistrée (list_configs) fixe style, langue, coupes et " +
      "dossier de sortie ; les autres paramètres la complètent. Si output_dir est donné, le MP4 fini y est copié. " +
      "Si le traitement dépasse ~50 s, renvoie le statut : appeler ensuite get_project pour suivre.",
    inputSchema: {
      source: z.string().describe("Chemin absolu d'un fichier vidéo, ou lien de partage Google Drive"),
      config: z.string().optional().describe("Configuration enregistrée, ex. chenek"),
      style: styleName.optional().describe("Style de sous-titres (défaut : celui de la config, sinon chenek)"),
      language: z.enum(["fr", "en", "auto"]).optional().describe("Langue parlée"),
      cut_silences: z.boolean().optional().describe("Couper les blancs entre les mots"),
      min_silence_ms: z.number().int().min(100).max(3000).optional().describe("Durée minimale d'un blanc à couper"),
      accent: z.string().optional().describe("Couleur d'accent CSS, ex. #EEF26B"),
      output_dir: z.string().optional().describe("Dossier où copier le MP4 fini (ex. dossier Google Drive)"),
    },
  },
  async ({ source, config, style, language, cut_silences, min_silence_ms, accent, output_dir }) => {
    const base = config ? configToProject(getConfig(config)) : null;
    checkStyle(style ?? base?.style);
    // Vérifié avant de créer le projet, pour ne pas laisser de projet en erreur.
    assertWhisperInstalled((process.env.CLIPCAPTION_MODEL as WhisperModel) || DEFAULT_MODEL);
    let file = expandHome(source);
    let name: string | undefined;
    if (isDriveUrl(source)) ({ file, name } = await downloadFromDrive(source));
    else if (!fs.existsSync(file)) throw new Error(`Fichier introuvable : ${file}`);
    const project = await createProject(file, {
      name,
      lang: language ?? base?.lang ?? "auto",
      style: style ?? base?.style,
      move: isDriveUrl(source),
    });
    project.settings = {
      cutSilences: cut_silences ?? base?.settings.cutSilences ?? false,
      minSilenceMs: min_silence_ms ?? base?.settings.minSilenceMs ?? 500,
    };
    project.overrides = { ...(base?.overrides ?? {}), ...(accent ? { accent } : {}) };
    const out = output_dir ?? base?.outputDir;
    if (out) {
      project.outputDir = path.resolve(expandHome(out));
      project.outputName = outputNameFor(name ?? file);
    }
    saveProject(project);

    const pipeline = queueTranscription(project.id).then(() => queueRender(project.id));
    pipeline.catch(() => {});
    const result = await waitAtMost(pipeline, 50_000);
    const p = requireProject(project.id);
    if (result === "pending") {
      return text({ ...summary(p), note: "Traitement en cours. Appelle get_project avec ce project_id pour suivre." });
    }
    return text({ ...summary(p), output: result.copiedTo ?? result.absolutePath });
  },
);

server.registerTool(
  "list_videos",
  {
    title: "Vidéos d'un dossier",
    description:
      "Liste les vidéos d'un dossier et indique celles déjà sous-titrées (fichier .sous-titres.mp4 présent dans le dossier de sortie). " +
      "Sans dossier : rend les racines Google Drive pour ordinateur trouvées sur le Mac et leurs sous-dossiers.",
    inputSchema: {
      folder: z.string().optional().describe("Dossier à lister (chemin absolu ou ~/…)"),
      output_dir: z.string().optional().describe("Dossier de sortie (défaut : <dossier>/Sous-titrées)"),
    },
  },
  async ({ folder, output_dir }) => {
    if (!folder) {
      const roots = driveRoots();
      if (!roots.length) return text("Aucun Google Drive pour ordinateur trouvé. Installe-le : https://www.google.com/drive/download/");
      return text(
        roots.map((r) => ({
          drive: r,
          dossiers: fs.readdirSync(r, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith(".")).map((e) => e.name),
        })),
      );
    }
    const out = output_dir ?? defaultOutputDir(path.resolve(expandHome(folder)));
    const files = scanFolder(folder, out);
    return text({
      dossier: path.resolve(expandHome(folder)),
      sortie: path.resolve(expandHome(out)),
      videos: files.map((f) => ({ fichier: path.basename(f.file), deja_faite: f.done })),
    });
  },
);

server.registerTool(
  "caption_folder",
  {
    title: "Sous-titrer un dossier",
    description:
      "Sous-titre toutes les vidéos d'un dossier avec une configuration, et dépose les MP4 finis (« <nom>.sous-titres.mp4 ») dans le " +
      "dossier de sortie. Les vidéos déjà faites sont sautées. Tourne en arrière-plan : rend un batch_id à suivre avec get_batch.",
    inputSchema: {
      folder: z.string().describe("Dossier des vidéos (chemin absolu ou ~/…)"),
      config: z.string().optional().describe("Configuration enregistrée (défaut : chenek)"),
      output_dir: z.string().optional().describe("Dossier de sortie (défaut : celui de la config, sinon <dossier>/Sous-titrées)"),
      style: styleName.optional(),
      language: z.enum(["fr", "en", "auto"]).optional(),
      cut_silences: z.boolean().optional(),
      min_silence_ms: z.number().int().min(100).max(3000).optional(),
      accent: z.string().optional(),
    },
  },
  async ({ folder, config, output_dir, style, language, cut_silences, min_silence_ms, accent }) => {
    assertWhisperInstalled((process.env.CLIPCAPTION_MODEL as WhisperModel) || DEFAULT_MODEL);
    const cfg: Config = {
      ...getConfig(config ?? "chenek"),
      ...(style ? { style } : {}),
      ...(language ? { lang: language } : {}),
      ...(cut_silences !== undefined ? { cutSilences: cut_silences } : {}),
      ...(min_silence_ms ? { minSilenceMs: min_silence_ms } : {}),
      ...(accent ? { accent } : {}),
    };
    checkStyle(cfg.style);
    const before = scanFolder(folder, output_dir ?? cfg.outputDir ?? defaultOutputDir(path.resolve(expandHome(folder))));
    if (!before.length) throw new Error(`Aucune vidéo dans ${folder}`);
    // Le lot tourne en arrière-plan ; son état est enregistré au fil de l'eau (get_batch).
    const batchId = newBatchId();
    runBatch({ id: batchId, inputDir: folder, outputDir: output_dir, config: cfg }).catch((e) => console.error("[lot]", e));
    return text({
      batch_id: batchId,
      a_faire: before.filter((f) => !f.done).length,
      deja_faites: before.filter((f) => f.done).length,
      config: cfg.name,
      note: "Traitement en cours en arrière-plan. Suis l'avancement avec get_batch (une vidéo prend en général 1 à 3 minutes).",
    });
  },
);

server.registerTool(
  "get_batch",
  {
    title: "Suivre un lot",
    description: "État d'un lot lancé avec caption_folder : vidéos faites, en cours, en erreur, et fichiers produits.",
    inputSchema: { batch_id: z.string() },
  },
  async ({ batch_id }) => {
    const b = getBatch(batch_id);
    if (!b) throw new Error(`Lot introuvable : ${batch_id}`);
    return text({
      statut: b.status === "running" ? "en cours" : "terminé",
      sortie: b.outputDir,
      videos: b.items.map((i) => ({
        fichier: path.basename(i.file),
        etat: { pending: "à faire / en cours", done: "faite", skipped: "déjà faite", error: "erreur" }[i.status],
        ...(i.output ? { resultat: path.basename(i.output) } : {}),
        ...(i.error ? { erreur: i.error } : {}),
      })),
    });
  },
);

server.registerTool(
  "list_configs",
  { title: "Configurations", description: "Configurations enregistrées (style, langue, coupes, accent, dossier de sortie).", inputSchema: {} },
  async () => text(listConfigs()),
);

server.registerTool(
  "save_config",
  {
    title: "Enregistrer une configuration",
    description: "Crée ou remplace une configuration nommée, réutilisable avec caption_video, caption_folder et npm run lot.",
    inputSchema: configSchema.shape,
  },
  async (args) => text(saveConfig(args)),
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
      const shown = w.cut ? `~~${t}~~` : w.hidden ? `(${t})` : w.emphasis ? `*${t}*` : t;
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
      style: styleName.optional(),
      accent: z.string().optional(),
      size_scale: z.number().min(0.5).max(2).optional().describe("Taille du texte, 1 = normal"),
      position: z.number().min(0.1).max(0.95).optional().describe("Position verticale, 0 = haut, 1 = bas"),
      max_words: z.number().int().min(1).max(8).optional().describe("Mots par écran"),
      animation: z.enum(["pop", "bounce", "fade", "slide-up", "blur", "none"]).optional().describe("Effet d'entrée des mots : pop (celui de « Un mot à la fois »), bounce, fade, slide-up, blur, none"),
      cut_silences: z.boolean().optional(),
      min_silence_ms: z.number().int().min(100).max(3000).optional(),
      cut_ranges: z.array(range).optional().describe("Plages [début, fin] d'index de mots à couper"),
      restore_ranges: z.array(range).optional().describe("Plages [début, fin] d'index de mots à restaurer"),
      hide_ranges: z.array(range).optional().describe("Plages [début, fin] d'index de mots à retirer des sous-titres seulement (la vidéo reste intacte)"),
      unhide_ranges: z.array(range).optional().describe("Plages [début, fin] d'index de mots masqués à réafficher"),
      emphasize: z.array(z.number().int()).optional(),
      deemphasize: z.array(z.number().int()).optional(),
      replace_text: z.array(z.object({ index: z.number().int(), text: z.string() })).optional(),
    },
  },
  async (a) => {
    const p = requireProject(a.project_id);
    checkStyle(a.style);
    if (a.style) p.style = a.style;
    const o = { ...p.overrides };
    if (a.accent !== undefined) o.accent = a.accent;
    if (a.size_scale !== undefined) o.sizeScale = a.size_scale;
    if (a.position !== undefined) o.position = a.position;
    if (a.max_words !== undefined) o.maxWords = a.max_words;
    if (a.animation !== undefined) o.animation = a.animation;
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
      each(a.hide_ranges, (i) => (words[i].hidden = true));
      each(a.unhide_ranges, (i) => (words[i].hidden = false));
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

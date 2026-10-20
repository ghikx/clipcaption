// Configurations enregistrées : un nom (« reseaux ») pour un ensemble de réglages
// (style, langue, coupes, ajustements, dossier de sortie), utilisable depuis Claude,
// la ligne de commande et l'interface. Stockées dans workspace/configs/<nom>.json.
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { WORKSPACE } from "./paths";
import { styleExists } from "./styles-store";

export const CONFIGS_DIR = path.join(WORKSPACE, "configs");

export const configSchema = z.object({
  name: z.string().min(1).max(40).describe("Nom court, ex. reseaux"),
  style: z.string().default("chenek").describe("Préréglage ou style perso (perso-…)"),
  lang: z.enum(["fr", "en", "auto"]).default("fr"),
  cutSilences: z.boolean().default(false).describe("Couper les blancs entre les mots"),
  minSilenceMs: z.number().int().min(100).max(3000).default(500),
  accent: z.string().max(40).optional().describe("Couleur d'accent CSS"),
  sizeScale: z.number().min(0.5).max(2).optional(),
  position: z.number().min(0.05).max(0.95).optional(),
  maxWords: z.number().int().min(1).max(12).optional(),
  uppercase: z.boolean().optional(),
  animation: z.enum(["pop", "bounce", "fade", "slide-up", "blur", "none"]).optional().describe("Effet d'entrée des mots : pop (celui de « Un mot à la fois »), bounce, fade, slide-up, blur, none"),
  outputDir: z.string().max(500).optional().describe("Dossier où déposer les MP4 finis (ex. dossier Google Drive)"),
});

export type Config = z.infer<typeof configSchema>;

// Nom de fichier sûr : minuscules sans accents, tirets.
export const configKey = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const file = (name: string) => {
  const key = configKey(name);
  if (!key) throw new Error(`Nom de configuration invalide : ${name}`);
  return path.join(CONFIGS_DIR, `${key}.json`);
};

// Configuration par défaut (réglages de Chenek), créée au premier usage.
export const DEFAULT_CONFIG = "chenek";
const DEFAULT: Config = {
  name: DEFAULT_CONFIG,
  style: "chenek",
  lang: "fr",
  cutSilences: true,
  minSilenceMs: 400,
  accent: "#EEF26B",
  sizeScale: 0.65,
  position: 0.65,
  maxWords: 2,
};

const ensureDefault = () => {
  if (!fs.existsSync(file(DEFAULT.name))) {
    fs.mkdirSync(CONFIGS_DIR, { recursive: true });
    fs.writeFileSync(file(DEFAULT.name), JSON.stringify(DEFAULT, null, 2) + "\n");
  }
};

export const listConfigs = (): Config[] => {
  ensureDefault();
  return fs
    .readdirSync(CONFIGS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => configSchema.parse(JSON.parse(fs.readFileSync(path.join(CONFIGS_DIR, f), "utf8"))));
};

export const getConfig = (name: string): Config => {
  ensureDefault();
  const f = file(name);
  if (!fs.existsSync(f)) {
    throw new Error(`Configuration « ${name} » introuvable. Disponibles : ${listConfigs().map((c) => c.name).join(", ")}`);
  }
  return configSchema.parse(JSON.parse(fs.readFileSync(f, "utf8")));
};

export const saveConfig = (input: unknown): Config => {
  const config = configSchema.parse(input);
  if (!styleExists(config.style)) throw new Error(`Style inconnu : ${config.style}`);
  if (config.outputDir) config.outputDir = path.resolve(expandHome(config.outputDir));
  fs.mkdirSync(CONFIGS_DIR, { recursive: true });
  fs.writeFileSync(file(config.name), JSON.stringify(config, null, 2) + "\n");
  return config;
};

export const deleteConfig = (name: string) => fs.rmSync(file(name), { force: true });

export const expandHome = (p: string) => (p.startsWith("~") ? path.join(process.env.HOME ?? "", p.slice(1)) : p);

// Réglages d'un projet à partir d'une configuration.
export const configToProject = (c: Config) => ({
  style: c.style,
  lang: c.lang,
  settings: { cutSilences: c.cutSilences, minSilenceMs: c.minSilenceMs },
  overrides: Object.fromEntries(
    Object.entries({ accent: c.accent, sizeScale: c.sizeScale, position: c.position, maxWords: c.maxWords, uppercase: c.uppercase, animation: c.animation }).filter(
      ([, v]) => v !== undefined,
    ),
  ),
  outputDir: c.outputDir,
});

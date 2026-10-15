import path from "node:path";
import { fileURLToPath } from "node:url";

// Racine du projet, quel que soit le dossier d'où l'outil est lancé (CLI, serveur, MCP).
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const PUBLIC_DIR = path.join(ROOT, "public");
export const WORKSPACE = path.join(ROOT, "workspace");
export const PROJECTS_DIR = path.join(WORKSPACE, "projects");
export const UI_PORT = Number(process.env.CLIPCAPTION_PORT ?? 4321);

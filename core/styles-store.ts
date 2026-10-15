// Styles perso : créés dans le designer de l'interface ou par Claude, enregistrés en JSON
// dans workspace/styles/. Un style perso part d'un préréglage et en modifie des champs.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { STYLES, isPreset, type CaptionStyle } from "../src/styles";
import { ensureFonts } from "./fonts";
import { WORKSPACE } from "./paths";
import { partialStyleSchema, styleFonts, styleSchema } from "./style-schema";

export const STYLES_DIR = path.join(WORKSPACE, "styles");

export type CustomStyle = { id: string; name: string; createdAt: string; updatedAt: string; definition: CaptionStyle };

const file = (id: string) => {
  if (!/^perso-[a-z0-9-]+$/.test(id)) throw new Error(`Identifiant de style invalide : ${id}`);
  return path.join(STYLES_DIR, `${id}.json`);
};

export const thumbPath = (id: string) => path.join(STYLES_DIR, `${id}.jpg`);

export const getCustomStyle = (id: string): CustomStyle | null => {
  try {
    return JSON.parse(fs.readFileSync(file(id), "utf8"));
  } catch {
    return null;
  }
};

export const listCustomStyles = (): CustomStyle[] => {
  if (!fs.existsSync(STYLES_DIR)) return [];
  return fs
    .readdirSync(STYLES_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => getCustomStyle(f.replace(/\.json$/, "")))
    .filter((s): s is CustomStyle => s !== null)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
};

// Définition complète d'un style, préréglage ou perso.
export const resolveStyle = (name: string): CaptionStyle | null =>
  isPreset(name) ? STYLES[name] : (getCustomStyle(name)?.definition ?? null);

export const styleExists = (name: string) => resolveStyle(name) !== null;

export const allStyles = () => [
  ...listCustomStyles().map((s) => ({ name: s.id, label: s.name, custom: true, definition: s.definition })),
  ...Object.entries(STYLES).map(([name, d]) => ({ name, label: d.label, custom: false, definition: d as CaptionStyle })),
];

const slug = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30) || "style";

// Crée ou met à jour un style perso. `base` = style de départ (préréglage ou perso),
// `changes` = champs modifiés. Les polices manquantes sont installées depuis Google Fonts.
export const saveCustomStyle = async ({
  id,
  name,
  base,
  changes,
}: {
  id?: string;
  name: string;
  base?: string;
  changes: unknown;
}): Promise<CustomStyle> => {
  const partial = partialStyleSchema.parse(changes ?? {});
  const existing = id ? getCustomStyle(id) : null;
  if (id && !existing) throw new Error(`Style introuvable : ${id}`);
  const from = existing?.definition ?? (base ? resolveStyle(base) : null) ?? STYLES.chenek;
  const definition = styleSchema.parse({ ...from, ...partial, label: partial.label ?? name }) as CaptionStyle;
  await ensureFonts(styleFonts(definition));

  const now = new Date().toISOString();
  const style: CustomStyle = {
    id: existing?.id ?? `perso-${slug(name)}-${crypto.randomBytes(2).toString("hex")}`,
    name: name.trim().slice(0, 60) || "Style perso",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    definition,
  };
  fs.mkdirSync(STYLES_DIR, { recursive: true });
  const target = file(style.id);
  fs.writeFileSync(`${target}.tmp`, JSON.stringify(style, null, 2));
  fs.renameSync(`${target}.tmp`, target);
  return style;
};

export const deleteCustomStyle = (id: string) => {
  fs.rmSync(file(id), { force: true });
  fs.rmSync(thumbPath(id), { force: true });
};

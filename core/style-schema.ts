// Schéma d'un style de sous-titres. Sert à valider les styles venant de l'interface et
// de Claude, et ses descriptions documentent chaque champ dans les outils MCP.
import { z } from "zod";

const color = z.string().max(80).describe("Couleur CSS : #RRGGBB, rgba(...), white…");

export const styleSchema = z.object({
  label: z.string().max(120).describe("Description courte affichée dans l'interface"),
  reveal: z
    .enum(["page", "spoken", "typewriter"])
    .describe("page = tout l'écran visible, mot prononcé mis en évidence ; spoken = les mots apparaissent un par un ; typewriter = lettre par lettre"),
  fontFamily: z.string().max(60).describe("Famille Google Fonts (installée automatiquement si absente), ex. Inter Tight, Bebas Neue"),
  fontWeight: z.number().int().min(100).max(900),
  fontSizeRatio: z.number().min(0.02).max(0.25).describe("Taille du texte en fraction de la largeur vidéo. 0.075 = standard 9:16"),
  letterSpacing: z.string().max(20).optional().describe("Interlettrage CSS, ex. -0.03em"),
  uppercase: z.boolean(),
  italic: z.boolean().optional(),
  lineHeight: z.number().min(0.7).max(2).optional(),
  align: z.enum(["left", "center", "right"]).optional(),
  maxWidthRatio: z.number().min(0.3).max(1).optional().describe("Largeur max du bloc, fraction de la largeur vidéo (0.88 par défaut)"),
  color: color.describe("Couleur des mots"),
  spokenColor: color.nullable().describe("Couleur des mots déjà prononcés (karaoké), null = même que color"),
  futureOpacity: z.number().min(0).max(1).optional().describe("Opacité des mots pas encore prononcés en mode page"),
  activeColor: color.describe("Couleur du mot en cours de prononciation"),
  activeBackground: color.nullable().describe("Pastille derrière le mot prononcé, null = aucune"),
  activeScale: z.number().min(0.5).max(2).describe("Grossissement du mot prononcé, 1 = aucun"),
  activeRotate: z.number().min(-30).max(30).optional().describe("Inclinaison du mot prononcé en degrés"),
  activeDecoration: z.enum(["none", "underline"]).optional(),
  wordBackground: color.nullable().optional().describe("Fond derrière chaque mot (TikTok classique)"),
  wordRadiusRatio: z.number().min(0).max(1).optional().describe("Arrondi des pastilles, fraction de la taille du texte"),
  gradient: z
    .object({ from: color, to: color, target: z.enum(["all", "active"]) })
    .nullable()
    .optional()
    .describe("Dégradé de remplissage du texte"),
  stroke: z.object({ color, ratio: z.number().min(0).max(0.4) }).nullable().describe("Contour : ratio en fraction de la taille du texte, null = aucun"),
  shadow: z.string().max(300).nullable().describe("text-shadow CSS en em (lueur, relief, ombre), null = aucune"),
  box: z
    .object({ color, radiusRatio: z.number().min(0).max(2), blur: z.number().min(0).max(60).optional() })
    .nullable()
    .describe("Fond derrière tout le bloc de texte ; blur = verre dépoli"),
  emphasis: z
    .object({
      scale: z.number().min(0.5).max(3),
      color: color.optional(),
      background: color.optional(),
      fontFamily: z.string().max(60).optional(),
      fontWeight: z.number().int().min(100).max(900).optional(),
      italic: z.boolean().optional(),
      uppercase: z.boolean().optional(),
      rotate: z.number().min(-30).max(30).optional(),
    })
    .nullable()
    .describe("Rendu des mots importants (chiffres, mots-clés), null = comme les autres"),
  chaos: z
    .object({ palette: z.array(color).min(1).max(10), fonts: z.array(z.string().max(60)).min(1).max(6), maxRotateDeg: z.number().min(0).max(30) })
    .nullable()
    .describe("Mots inclinés et décalés au hasard ; les mots importants prennent une couleur et une police de ces listes"),
  animation: z.enum(["pop", "fade", "slide-up", "blur", "bounce", "none"]).optional().describe("Entrée de l'écran (page) ou de chaque mot (spoken)"),
  verticalPosition: z.number().min(0.05).max(0.95).describe("Centre vertical du bloc, 0 = haut, 1 = bas"),
  combineWithinMs: z.number().int().min(0).max(5000).describe("Fenêtre de regroupement des mots sur un écran, en ms"),
  maxWords: z.number().int().min(1).max(12).describe("Mots maximum par écran"),
});

export const partialStyleSchema = styleSchema.partial();

// Polices référencées par un style (pour les installer si besoin).
export const styleFonts = (s: z.infer<typeof partialStyleSchema>) => [s.fontFamily, s.emphasis?.fontFamily, ...(s.chaos?.fonts ?? [])];

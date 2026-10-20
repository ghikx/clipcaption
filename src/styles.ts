// Comment les mots d'un écran apparaissent :
// - "page"       : tout l'écran est visible d'un coup, le mot prononcé est mis en évidence
// - "spoken"     : chaque mot apparaît au moment où il est prononcé
// - "typewriter" : les lettres s'écrivent au rythme de la parole
export type Reveal = "page" | "spoken" | "typewriter";

export type Animation = "pop" | "fade" | "slide-up" | "blur" | "bounce" | "none";

// Un style est une simple donnée (JSON) : les préréglages ci-dessous, les styles créés
// dans le designer de l'interface et ceux créés par Claude via MCP ont la même forme.
export type CaptionStyle = {
  label: string;
  reveal: Reveal;
  fontFamily: string;
  fontWeight: number;
  // Taille en fraction de la largeur de la vidéo, pour rester lisible en 9:16 comme en 16:9.
  fontSizeRatio: number;
  letterSpacing?: string;
  uppercase: boolean;
  italic?: boolean;
  lineHeight?: number;
  // Alignement horizontal du bloc et largeur maximale (fraction de la largeur vidéo).
  align?: "left" | "center" | "right";
  maxWidthRatio?: number;
  color: string;
  // Couleur des mots déjà prononcés (effet karaoké). null = même couleur que `color`.
  spokenColor: string | null;
  // Opacité des mots pas encore prononcés quand tout l'écran est affiché (1 = normal).
  futureOpacity?: number;
  activeColor: string;
  // Pastille derrière le mot prononcé. null = pas de pastille.
  activeBackground: string | null;
  // Grossissement du mot prononcé (1 = aucun).
  activeScale: number;
  // Inclinaison du mot prononcé, en degrés.
  activeRotate?: number;
  activeDecoration?: "none" | "underline";
  // Fond derrière chaque mot (style TikTok classique). null = aucun.
  wordBackground?: string | null;
  // Arrondi des pastilles (mot prononcé, fond de mot), en fraction de la taille du texte.
  wordRadiusRatio?: number;
  // Dégradé de remplissage du texte, sur tous les mots ou seulement le mot prononcé.
  gradient?: { from: string; to: string; target: "all" | "active" } | null;
  stroke: { color: string; ratio: number } | null;
  // Ombre CSS (text-shadow), en em pour suivre la taille : lueur, relief, ombre portée…
  shadow: string | null;
  // Fond derrière tout l'écran de mots (style podcast). blur = flou d'arrière-plan (verre).
  box: { color: string; radiusRatio: number; blur?: number } | null;
  // Rendu des mots marqués importants. null = traités comme les autres.
  emphasis: {
    scale: number;
    color?: string;
    background?: string;
    fontFamily?: string;
    fontWeight?: number;
    italic?: boolean;
    uppercase?: boolean;
    rotate?: number;
  } | null;
  // Rotation, décalage, couleurs et polices variés mot par mot.
  chaos: { palette: string[]; fonts: string[]; maxRotateDeg: number } | null;
  // Entrée de l'écran (mode page) ou de chaque mot (modes spoken / typewriter).
  animation?: Animation;
  // Position verticale du centre du bloc, en fraction de la hauteur.
  verticalPosition: number;
  // Regroupe les mots prononcés à moins de N ms du début de l'écran.
  combineWithinMs: number;
  maxWords: number;
};

const base: Omit<CaptionStyle, "label" | "fontFamily" | "fontWeight"> = {
  reveal: "page",
  fontSizeRatio: 0.075,
  uppercase: true,
  color: "#FFFFFF",
  spokenColor: null,
  activeColor: "#FFFFFF",
  activeBackground: null,
  activeScale: 1.12,
  stroke: { color: "#000000", ratio: 0.12 },
  shadow: "0 0.06em 0.15em rgba(0,0,0,0.45)",
  box: null,
  emphasis: null,
  chaos: null,
  animation: "pop",
  verticalPosition: 0.7,
  combineWithinMs: 900,
  maxWords: 4,
};

export const BASE_STYLE = base;

export const STYLES = {
  // DA Chenek Crea : grotesque serrée blanc cassé, mot prononcé sur pastille citron,
  // mots importants en italique fine.
  chenek: {
    ...base,
    label: "Chenek : pastille citron, italique fine",
    fontFamily: "Inter Tight",
    fontWeight: 800,
    fontSizeRatio: 0.078,
    letterSpacing: "-0.035em",
    uppercase: false,
    color: "#F2F2EE",
    activeColor: "#0B0B0B",
    activeBackground: "#EEF26B",
    activeScale: 1.04,
    stroke: null,
    shadow: "0 0.04em 0.3em rgba(0,0,0,0.55)",
    emphasis: { scale: 1.12, fontWeight: 300, italic: true },
    verticalPosition: 0.7,
    combineWithinMs: 1200,
    maxWords: 4,
  },
  // Mot prononcé sur pastille colorée, le look Submagic le plus courant.
  submagic: {
    ...base,
    label: "Pastille sur le mot prononcé",
    fontFamily: "Montserrat",
    fontWeight: 900,
    activeBackground: "#7B2FF7",
    activeScale: 1.06,
  },
  // Gros texte condensé, mot prononcé en jaune. Très répandu, jugé saturé en 2026.
  hormozi: {
    ...base,
    label: "Texte condensé, mot prononcé en jaune",
    fontFamily: "Anton",
    fontWeight: 400,
    fontSizeRatio: 0.09,
    activeColor: "#FFE500",
    stroke: { color: "#000000", ratio: 0.14 },
    verticalPosition: 0.68,
    combineWithinMs: 600,
  },
  // Un seul mot à l'écran, blanc, sans effet.
  oneword: {
    ...base,
    label: "Un mot à la fois, blanc, sobre",
    fontFamily: "Montserrat",
    fontWeight: 800,
    fontSizeRatio: 0.085,
    uppercase: false,
    activeScale: 1,
    stroke: null,
    shadow: "0 0.03em 0.25em rgba(0,0,0,0.6)",
    verticalPosition: 0.62,
    combineWithinMs: 0,
    maxWords: 1,
  },
  // Les mots se colorent au fur et à mesure qu'ils sont prononcés.
  karaoke: {
    ...base,
    label: "Karaoké : les mots se remplissent",
    fontFamily: "Montserrat",
    fontWeight: 900,
    color: "rgba(255,255,255,0.55)",
    spokenColor: "#22D3EE",
    activeColor: "#22D3EE",
    activeScale: 1.06,
    combineWithinMs: 1600,
    maxWords: 6,
  },
  // Phrase en blanc, mots-clés plus gros et en couleur.
  keyword: {
    ...base,
    label: "Mots-clés en couleur",
    fontFamily: "Montserrat",
    fontWeight: 900,
    activeScale: 1.05,
    emphasis: { scale: 1.3, color: "#4ADE80" },
    combineWithinMs: 1500,
    maxWords: 6,
  },
  // Sans-serif fin + serif italique sur le mot important.
  aesthetic: {
    ...base,
    label: "Polices mélangées : sans-serif + serif italique",
    fontFamily: "Inter",
    fontWeight: 600,
    fontSizeRatio: 0.062,
    uppercase: false,
    activeScale: 1,
    stroke: null,
    shadow: "0 0.02em 0.3em rgba(0,0,0,0.55)",
    emphasis: { scale: 1.55, fontFamily: "Instrument Serif", fontWeight: 400, italic: true, color: "#FDE68A" },
    verticalPosition: 0.66,
    combineWithinMs: 1400,
    maxWords: 5,
  },
  // Mots qui arrivent un par un, tailles, angles, couleurs et polices variés.
  chaos: {
    ...base,
    label: "Kinétique : tailles, angles et couleurs variés",
    reveal: "spoken",
    fontFamily: "Montserrat",
    fontWeight: 900,
    fontSizeRatio: 0.07,
    activeScale: 1,
    stroke: { color: "#000000", ratio: 0.1 },
    emphasis: { scale: 1.7 },
    chaos: {
      palette: ["#FF3D7F", "#FFE500", "#22D3EE", "#A3E635", "#FB923C"],
      fonts: ["Anton", "Instrument Serif", "Montserrat"],
      maxRotateDeg: 9,
    },
    animation: "bounce",
    verticalPosition: 0.6,
    combineWithinMs: 1600,
    maxWords: 5,
  },
  // Les lettres s'écrivent au rythme de la voix.
  typewriter: {
    ...base,
    label: "Machine à écrire",
    reveal: "typewriter",
    animation: "none",
    fontFamily: "Space Mono",
    fontWeight: 700,
    fontSizeRatio: 0.06,
    uppercase: false,
    activeScale: 1,
    stroke: null,
    shadow: null,
    box: { color: "rgba(0,0,0,0.75)", radiusRatio: 0.15 },
    combineWithinMs: 1800,
    maxWords: 6,
  },
  // Bloc de texte sur fond, lisible pour les podcasts et explications.
  podcast: {
    ...base,
    label: "Bloc sur fond, pour podcasts",
    fontFamily: "Inter",
    fontWeight: 800,
    fontSizeRatio: 0.058,
    uppercase: false,
    activeColor: "#FACC15",
    activeScale: 1,
    stroke: null,
    shadow: null,
    box: { color: "rgba(17,17,17,0.85)", radiusRatio: 0.3 },
    verticalPosition: 0.74,
    combineWithinMs: 1800,
    maxWords: 5,
  },
  // Façon MrBeast : police cartoon, gros contour, mot prononcé vert et penché.
  beast: {
    ...base,
    label: "Beast : cartoon, contour épais, mot vert penché",
    fontFamily: "Luckiest Guy",
    fontWeight: 400,
    fontSizeRatio: 0.085,
    stroke: { color: "#000000", ratio: 0.16 },
    shadow: "0 0.09em 0 #000000",
    activeColor: "#39FF14",
    activeScale: 1.18,
    activeRotate: -4,
    animation: "bounce",
    combineWithinMs: 700,
    maxWords: 3,
  },
  // Grand condensé, mots qui montent.
  bebas: {
    ...base,
    label: "Bebas : grand condensé, mot rouge, entrée par le bas",
    fontFamily: "Bebas Neue",
    fontWeight: 400,
    fontSizeRatio: 0.11,
    letterSpacing: "0.01em",
    lineHeight: 0.95,
    stroke: null,
    shadow: "0 0.04em 0.2em rgba(0,0,0,0.6)",
    activeColor: "#FF3D3D",
    activeScale: 1.05,
    animation: "slide-up",
    combineWithinMs: 700,
    maxWords: 3,
  },
  // Lueur néon cyan, mot prononcé magenta.
  neon: {
    ...base,
    label: "Néon : lueur cyan, mot magenta",
    fontFamily: "Inter Tight",
    fontWeight: 900,
    italic: true,
    fontSizeRatio: 0.08,
    color: "#E6FFFF",
    activeColor: "#FF4DF0",
    activeScale: 1.08,
    stroke: null,
    shadow: "0 0 0.08em #22D3EE, 0 0 0.35em #22D3EE, 0 0 0.8em rgba(34,211,238,0.6)",
    animation: "fade",
  },
  // Verre dépoli : bloc flouté translucide.
  glass: {
    ...base,
    label: "Verre : bloc translucide flouté",
    fontFamily: "Inter",
    fontWeight: 650,
    fontSizeRatio: 0.056,
    uppercase: false,
    activeColor: "#EEF26B",
    activeScale: 1,
    stroke: null,
    shadow: null,
    box: { color: "rgba(255,255,255,0.14)", radiusRatio: 0.45, blur: 18 },
    animation: "fade",
    verticalPosition: 0.74,
    combineWithinMs: 1600,
    maxWords: 5,
  },
  // Dégradé jaune -> rose sur le mot prononcé.
  gradient: {
    ...base,
    label: "Dégradé : mot prononcé en dégradé jaune-rose",
    fontFamily: "Bricolage Grotesque",
    fontWeight: 800,
    fontSizeRatio: 0.08,
    letterSpacing: "-0.03em",
    uppercase: false,
    gradient: { from: "#FDE047", to: "#FF3D7F", target: "active" },
    activeScale: 1.1,
    stroke: null,
    shadow: "0 0.05em 0.3em rgba(0,0,0,0.5)",
  },
  // TikTok classique : chaque mot sur fond blanc, mot prononcé sur fond rose.
  boxed: {
    ...base,
    label: "Encadré : chaque mot sur fond blanc (TikTok classique)",
    fontFamily: "Poppins",
    fontWeight: 700,
    fontSizeRatio: 0.06,
    uppercase: false,
    color: "#111111",
    wordBackground: "#FFFFFF",
    wordRadiusRatio: 0.14,
    activeColor: "#FFFFFF",
    activeBackground: "#FF3D7F",
    activeScale: 1.04,
    stroke: null,
    shadow: null,
    combineWithinMs: 1300,
    maxWords: 5,
  },
  // Surligneur jaune, écriture feutre.
  marker: {
    ...base,
    label: "Feutre : écriture marqueur, surligneur jaune",
    fontFamily: "Permanent Marker",
    fontWeight: 400,
    fontSizeRatio: 0.072,
    uppercase: false,
    activeColor: "#111111",
    activeBackground: "#FDE047",
    activeRotate: -2,
    activeScale: 1.06,
    wordRadiusRatio: 0.06,
    stroke: null,
    shadow: "0 0.04em 0.25em rgba(0,0,0,0.6)",
  },
  // Éditorial : serif italique crème, mot prononcé souligné.
  editorial: {
    ...base,
    label: "Éditorial : serif italique, mot souligné",
    fontFamily: "Playfair Display",
    fontWeight: 400,
    italic: true,
    fontSizeRatio: 0.07,
    uppercase: false,
    color: "#F5F0E6",
    activeColor: "#F5F0E6",
    activeDecoration: "underline",
    activeScale: 1,
    stroke: null,
    shadow: "0 0.03em 0.3em rgba(0,0,0,0.6)",
    animation: "blur",
    combineWithinMs: 1500,
    maxWords: 5,
  },
  // Rétro : relief en couleurs décalées.
  retro: {
    ...base,
    label: "Rétro : relief décalé rose et cyan",
    fontFamily: "Archivo Black",
    fontWeight: 400,
    fontSizeRatio: 0.07,
    color: "#FFF7E6",
    activeColor: "#FDE047",
    stroke: null,
    shadow: "0.05em 0.05em 0 #FF3D7F, 0.1em 0.1em 0 #22D3EE",
    animation: "bounce",
  },
  // Bandeau bas aligné à gauche, façon documentaire.
  docu: {
    ...base,
    label: "Documentaire : bandeau bas aligné à gauche",
    fontFamily: "Inter",
    fontWeight: 600,
    fontSizeRatio: 0.044,
    uppercase: false,
    align: "left",
    maxWidthRatio: 0.82,
    color: "rgba(255,255,255,0.55)",
    spokenColor: "#FFFFFF",
    activeColor: "#FFFFFF",
    activeScale: 1,
    stroke: null,
    shadow: null,
    box: { color: "rgba(0,0,0,0.62)", radiusRatio: 0.18 },
    animation: "fade",
    verticalPosition: 0.84,
    combineWithinMs: 2600,
    maxWords: 9,
  },
  // Les mots montent un par un.
  rise: {
    ...base,
    label: "Montée : les mots arrivent par le bas un par un",
    reveal: "spoken",
    fontFamily: "Syne",
    fontWeight: 800,
    fontSizeRatio: 0.07,
    uppercase: false,
    activeScale: 1,
    stroke: null,
    shadow: "0 0.04em 0.3em rgba(0,0,0,0.6)",
    emphasis: { scale: 1.25, color: "#A3E635" },
    animation: "slide-up",
    combineWithinMs: 1500,
    maxWords: 5,
  },
  // Les mots apparaissent en sortant du flou.
  dream: {
    ...base,
    label: "Flou : les mots sortent du flou",
    reveal: "spoken",
    fontFamily: "Unbounded",
    fontWeight: 700,
    fontSizeRatio: 0.058,
    uppercase: false,
    activeScale: 1,
    stroke: null,
    shadow: "0 0 0.4em rgba(0,0,0,0.5)",
    emphasis: { scale: 1.2, color: "#C4B5FD" },
    animation: "blur",
    combineWithinMs: 1500,
    maxWords: 5,
  },
  // Serif contrasté, mot prononcé sur pastille blanche.
  serif: {
    ...base,
    label: "Serif : grand serif, pastille blanche",
    fontFamily: "DM Serif Display",
    fontWeight: 400,
    fontSizeRatio: 0.08,
    uppercase: false,
    activeColor: "#111111",
    activeBackground: "#F5F0E6",
    activeScale: 1.04,
    wordRadiusRatio: 0.12,
    stroke: null,
    shadow: "0 0.04em 0.3em rgba(0,0,0,0.55)",
    emphasis: { scale: 1.1, italic: true },
  },
} satisfies Record<string, CaptionStyle>;

export type PresetName = keyof typeof STYLES;
// Nom d'un préréglage, ou identifiant d'un style perso ("perso-…").
export type StyleName = string;

// Réglages personnalisables depuis l'interface, appliqués par-dessus le style choisi.
export type StyleOverrides = {
  accent?: string;
  sizeScale?: number;
  position?: number;
  uppercase?: boolean;
  maxWords?: number;
  // Effet d'entrée des mots (ex. « pop » = celui de « Un mot à la fois »).
  animation?: Animation;
};

export const applyOverrides = (s: CaptionStyle, o: StyleOverrides | undefined): CaptionStyle => {
  if (!o) return s;
  const out: CaptionStyle = { ...s };
  if (o.accent) {
    // L'accent remplace la couleur qui porte l'identité du style : pastille si le style
    // en a une, sinon couleur du mot prononcé et des mots importants.
    if (s.activeBackground) out.activeBackground = o.accent;
    else {
      out.activeColor = o.accent;
      if (s.spokenColor) out.spokenColor = o.accent;
    }
    if (s.emphasis?.color) out.emphasis = { ...s.emphasis, color: o.accent };
    if (s.chaos) out.chaos = { ...s.chaos, palette: [o.accent, ...s.chaos.palette.slice(1)] };
  }
  if (o.sizeScale) out.fontSizeRatio = s.fontSizeRatio * o.sizeScale;
  if (o.position !== undefined) out.verticalPosition = o.position;
  if (o.uppercase !== undefined) out.uppercase = o.uppercase;
  if (o.maxWords) {
    out.maxWords = o.maxWords;
    // Plus de mots par écran = fenêtre de regroupement plus longue.
    out.combineWithinMs = o.maxWords === 1 ? 0 : Math.max(s.combineWithinMs, o.maxWords * 320);
  }
  if (o.animation) out.animation = o.animation;
  return out;
};

export const isPreset = (name: string): name is PresetName => name in STYLES;
export const isStyleName = isPreset;

// Tous les champs ont une valeur : utile pour un style partiel venant de Claude ou du JSON.
export const completeStyle = (partial: Partial<CaptionStyle>, from: CaptionStyle = STYLES.chenek): CaptionStyle => ({
  ...from,
  ...partial,
});

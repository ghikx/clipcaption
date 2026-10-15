// Comment les mots d'un écran apparaissent :
// - "page"       : tout l'écran est visible d'un coup, le mot prononcé est mis en évidence
// - "spoken"     : chaque mot apparaît au moment où il est prononcé
// - "typewriter" : les lettres s'écrivent au rythme de la parole
export type Reveal = "page" | "spoken" | "typewriter";

export type CaptionStyle = {
  label: string;
  reveal: Reveal;
  fontFamily: string;
  fontWeight: number;
  // Taille en fraction de la largeur de la vidéo, pour rester lisible en 9:16 comme en 16:9.
  fontSizeRatio: number;
  letterSpacing?: string;
  uppercase: boolean;
  color: string;
  // Couleur des mots déjà prononcés (effet karaoké). null = même couleur que `color`.
  spokenColor: string | null;
  activeColor: string;
  // Pastille derrière le mot prononcé. null = pas de pastille.
  activeBackground: string | null;
  // Grossissement du mot prononcé (1 = aucun).
  activeScale: number;
  stroke: { color: string; ratio: number } | null;
  shadow: string | null;
  // Fond derrière tout l'écran de mots (style podcast). null = pas de fond.
  box: { color: string; radiusRatio: number } | null;
  // Rendu des mots marqués importants. null = traités comme les autres.
  emphasis: {
    scale: number;
    color?: string;
    fontFamily?: string;
    fontWeight?: number;
    italic?: boolean;
    uppercase?: boolean;
  } | null;
  // Rotation, décalage, couleurs et polices variés mot par mot.
  chaos: { palette: string[]; fonts: string[]; maxRotateDeg: number } | null;
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
  verticalPosition: 0.7,
  combineWithinMs: 900,
  maxWords: 4,
};

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
    verticalPosition: 0.6,
    combineWithinMs: 1600,
    maxWords: 5,
  },
  // Les lettres s'écrivent au rythme de la voix.
  typewriter: {
    ...base,
    label: "Machine à écrire",
    reveal: "typewriter",
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
} satisfies Record<string, CaptionStyle>;

export type StyleName = keyof typeof STYLES;

// Réglages personnalisables depuis l'interface, appliqués par-dessus le style choisi.
export type StyleOverrides = {
  accent?: string;
  sizeScale?: number;
  position?: number;
  uppercase?: boolean;
  maxWords?: number;
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
  return out;
};

export const isStyleName = (name: string): name is StyleName => name in STYLES;

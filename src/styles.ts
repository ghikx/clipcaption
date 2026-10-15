export type CaptionStyle = {
  fontFamily: string;
  fontWeight: number;
  // Taille en fraction de la largeur de la vidéo, pour rester lisible en 9:16 comme en 16:9.
  fontSizeRatio: number;
  uppercase: boolean;
  color: string;
  activeColor: string;
  // Fond derrière le mot actif (null = pas de fond, seulement la couleur change).
  activeBackground: string | null;
  strokeColor: string;
  strokeRatio: number;
  // Position verticale du centre du bloc, en fraction de la hauteur.
  verticalPosition: number;
  // Regroupe les mots prononcés à moins de N ms d'écart sur un même écran.
  combineWithinMs: number;
};

export const STYLES = {
  // Mot actif sur pastille colorée, le look Submagic le plus courant.
  submagic: {
    fontFamily: "Montserrat",
    fontWeight: 900,
    fontSizeRatio: 0.075,
    uppercase: true,
    color: "#FFFFFF",
    activeColor: "#FFFFFF",
    activeBackground: "#7B2FF7",
    strokeColor: "#000000",
    strokeRatio: 0.12,
    verticalPosition: 0.7,
    combineWithinMs: 900,
  },
  // Gros texte condensé, mot actif en jaune.
  hormozi: {
    fontFamily: "Anton",
    fontWeight: 400,
    fontSizeRatio: 0.09,
    uppercase: true,
    color: "#FFFFFF",
    activeColor: "#FFE500",
    activeBackground: null,
    strokeColor: "#000000",
    strokeRatio: 0.14,
    verticalPosition: 0.68,
    combineWithinMs: 600,
  },
  // Plus sobre, casse normale, phrases plus longues.
  minimal: {
    fontFamily: "Inter",
    fontWeight: 800,
    fontSizeRatio: 0.055,
    uppercase: false,
    color: "#FFFFFF",
    activeColor: "#4ADE80",
    activeBackground: null,
    strokeColor: "#000000",
    strokeRatio: 0.1,
    verticalPosition: 0.78,
    combineWithinMs: 1400,
  },
} satisfies Record<string, CaptionStyle>;

export type StyleName = keyof typeof STYLES;

export const isStyleName = (name: string): name is StyleName => name in STYLES;

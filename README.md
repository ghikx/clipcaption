# clipcaption

Sous-titres animés façon Submagic, 100 % en local, en français et en anglais.

- **Transcription** : [whisper.cpp](https://github.com/ggerganov/whisper.cpp), timestamps mot par mot, sans API ni clé.
- **Rendu** : [Remotion](https://www.remotion.dev) (React → MP4), 9 styles de sous-titres.

## Prérequis

- Node.js 20+
- `ffmpeg` et `ffprobe` dans le PATH (`brew install ffmpeg` sur macOS)
- macOS/Linux : un compilateur C (`xcode-select --install` sur macOS), car whisper.cpp est compilé à l'installation

## Installation (une fois)

```bash
npm install
npm run setup                    # whisper.cpp + modèle large-v3-turbo (~1,6 Go)
npm run setup -- --model small   # alternative plus légère si la machine rame
```

## Utilisation

```bash
npm run caption -- ma-video.mp4 --lang fr
npm run caption -- ma-video.mp4 --lang en --style hormozi
```

Résultat : `out/ma-video.<style>.mp4`.

| Option | Valeurs | Défaut |
|---|---|---|
| `--lang` | `fr`, `en`, `auto` | `auto` |
| `--style` | voir [Styles](#styles) | `submagic` |
| `--model` | `tiny`, `base`, `small`, `medium`, `large-v3`, `large-v3-turbo` | `large-v3-turbo` |
| `--cut-silences` | coupe les blancs entre les mots (jump cuts) | — |
| `--min-silence` | durée minimale d'un blanc à couper, en ms | `500` |
| `--reuse` | réutilise la transcription existante | — |
| `--no-render` | transcrit seulement | — |

Préciser `--lang` évite les erreurs de détection sur les vidéos courtes.

## Styles

| Style | Rendu |
|---|---|
| `submagic` | Groupe de mots, pastille violette sur le mot prononcé |
| `hormozi` | Texte condensé, mot prononcé en jaune |
| `oneword` | Un seul mot à l'écran, blanc, sobre |
| `karaoke` | Les mots se remplissent de couleur au fil de la voix |
| `keyword` | Phrase en blanc, mots importants plus gros et en vert |
| `aesthetic` | Sans-serif fin + serif italique sur le mot important |
| `chaos` | Les mots surgissent un par un, tailles, angles, couleurs et polices variés |
| `typewriter` | Lettres qui s'écrivent au rythme de la voix, sur fond noir |
| `podcast` | Bloc de texte sur fond sombre, mot prononcé en jaune |

Voir tous les styles sans vidéo :

```bash
npm run preview              # images dans out/styles/, planche complète : out/styles/catalogue.png
npm run preview -- --video   # + une démo MP4 par style
```

### Mots importants

`keyword`, `aesthetic` et `chaos` mettent en avant certains mots. Ils sont choisis automatiquement, en local : chiffres, mots longs hors mots-outils (FR + EN), espacés d'au moins 1,2 s. Pour changer le choix, passe `"emphasis"` à `true` ou `false` sur le mot dans `public/input/<video>.captions.json`, puis relance avec `--reuse`.

### Couper les silences

```bash
npm run caption -- ma-video.mp4 --lang fr --cut-silences
npm run caption -- ma-video.mp4 --cut-silences --min-silence 350   # montage plus nerveux
```

Les coupes se basent sur les timestamps des mots : tout blanc de plus de `--min-silence` ms entre deux mots est retiré, avec 100 ms de marge autour de chaque mot pour ne pas couper les syllabes. Les sous-titres sont recalés automatiquement. Résultat : `out/ma-video.<style>.cut.mp4`.

Limite : un passage sans parole (démo à l'écran, musique) sera coupé aussi, puisqu'aucun mot n'y est détecté.

### Corriger une faute de transcription

1. Ouvre `public/input/ma-video.captions.json` et corrige le champ `text` du mot concerné.
2. Relance avec `--reuse` : pas de nouvelle transcription, seulement le rendu.

```bash
npm run caption -- ma-video.mp4 --style hormozi --reuse
```

`--reuse` sert aussi à tester plusieurs styles sans re-transcrire.

### Prévisualiser / régler les styles

```bash
npm run studio
```

Le Studio Remotion affiche la composition `Captioned` avec des sous-titres d'exemple. Les styles se règlent dans `src/styles.ts` (police, couleurs, taille, position, nombre de mots par écran via `combineWithinMs`).

## Structure

```
scripts/caption.ts      CLI : extraction audio → transcription → rendu
scripts/setup.ts        installation de whisper.cpp + modèle
src/CaptionedVideo.tsx  composition Remotion (pages de mots, mot actif, animations)
src/segments.ts         calcul des coupes de silences et recalage des sous-titres
src/styles.ts           presets de style
src/words.ts            regroupement des mots en écrans, détection des mots importants
scripts/preview.ts      aperçu du catalogue de styles
public/fonts/           polices embarquées (OFL), rendu sans réseau
```

## Licence Remotion

Gratuit pour un usage individuel ; licence payante pour les entreprises de plus de 3 personnes.

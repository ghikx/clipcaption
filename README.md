# clipcaption

Sous-titres animés façon Submagic, 100 % en local, en français et en anglais.

- **Transcription** : [whisper.cpp](https://github.com/ggerganov/whisper.cpp), timestamps mot par mot, sans API ni clé.
- **Rendu** : [Remotion](https://www.remotion.dev) (React → MP4), avec 3 styles : `submagic`, `hormozi`, `minimal`.

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
| `--style` | `submagic`, `hormozi`, `minimal` | `submagic` |
| `--model` | `tiny`, `base`, `small`, `medium`, `large-v3`, `large-v3-turbo` | `large-v3-turbo` |
| `--reuse` | réutilise la transcription existante | — |
| `--no-render` | transcrit seulement | — |

Préciser `--lang` évite les erreurs de détection sur les vidéos courtes.

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
src/styles.ts           presets de style
public/fonts/           polices embarquées (OFL), rendu sans réseau
```

## Licence Remotion

Gratuit pour un usage individuel ; licence payante pour les entreprises de plus de 3 personnes.

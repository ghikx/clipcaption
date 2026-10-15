# clipcaption

Sous-titres animés façon Submagic, 100 % en local, en français et en anglais. Une interface web pour transcrire, couper et styliser tes vidéos, et un serveur MCP pour que Claude puisse le faire à ta place.

- **Transcription** : [whisper.cpp](https://github.com/ggerganov/whisper.cpp), timestamps mot par mot, sans API ni clé.
- **Rendu** : [Remotion](https://www.remotion.dev) (React → MP4), 10 styles de sous-titres.
- **Interface** : éditeur par le texte (couper un passage = barrer ses mots), aperçu en direct, export MP4.
- **Claude** : serveur MCP, les projets créés par Claude apparaissent dans l'interface.

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

Avec le modèle `small`, lance l'interface et le MCP avec `CLIPCAPTION_MODEL=small`.

## Interface

```bash
npm run app
```

Puis ouvre **http://localhost:4321**.

1. **Importe** une vidéo : glisser-déposer, ou lien de partage Google Drive. Choisis la langue (Auto / FR / EN). La transcription démarre seule.
2. **Édite par le texte**, dans la colonne du milieu :
   - clic sur un mot : la vidéo y va ;
   - glisser : sélectionner plusieurs mots ;
   - `⌫` : couper le passage sélectionné (il disparaît de la vidéo et des sous-titres) ;
   - `E` : mettre en avant (utilisé par `chenek`, `keyword`, `aesthetic`, `chaos`) ;
   - double-clic : corriger le mot ;
   - `⌘Z` / `⇧⌘Z` : annuler / rétablir ; `espace` : lecture.
3. **Style** : 10 styles, couleur d'accent, taille, position, mots par écran, majuscules. L'aperçu est en direct.
4. **Montage** : coupe automatique des silences (avec le réglage de la durée minimale), durée finale, changement de langue.
5. **Export** : MP4 H.264 à la résolution d'origine, téléchargeable depuis l'onglet Export.

Tout est sauvegardé automatiquement dans `workspace/projects/<projet>/` : la source, l'aperçu, la transcription et les exports.

### Google Drive

L'import par lien marche pour un fichier partagé en « Tous les utilisateurs disposant du lien ». Pour un fichier privé, deux options :

- [Google Drive pour ordinateur](https://www.google.com/drive/download/) : tes fichiers Drive apparaissent comme un dossier local, il suffit de les glisser dans l'interface.
- Connexion OAuth (fichiers privés sans les partager) : pas encore intégrée. Elle demande un projet Google Cloud avec des identifiants OAuth à ton nom.

## Claude (MCP)

Ajoute le serveur à Claude Code. La commande exacte, avec tes chemins, est affichée en bas de la page d'accueil de l'interface :

```bash
claude mcp add clipcaption -- node "/chemin/vers/clipcaption/node_modules/tsx/dist/cli.mjs" "/chemin/vers/clipcaption/core/mcp.ts"
```

Pour Claude Desktop, ajoute dans `claude_desktop_config.json` :

```json
{
  "mcpServers": {
    "clipcaption": {
      "command": "node",
      "args": ["/chemin/vers/clipcaption/node_modules/tsx/dist/cli.mjs", "/chemin/vers/clipcaption/core/mcp.ts"]
    }
  }
}
```

Si Claude Desktop ne trouve pas `node`, remplace `"node"` par son chemin complet (`which node`).

Ensuite, demande simplement : *« Sous-titre ~/Desktop/interview.mp4 en style chenek et coupe les silences »*.

| Outil | Rôle |
|---|---|
| `caption_video` | Transcrit et exporte une vidéo (chemin local ou lien Drive) |
| `get_transcript` | Transcription numérotée, pour cibler des mots |
| `edit_project` | Style, accent, taille, position, coupes par plages de mots, mises en avant, corrections |
| `render_project` | Exporte avec les réglages actuels |
| `get_project` / `list_projects` | Suivi des projets |
| `transcribe_again` | Retranscrit, par exemple dans une autre langue |
| `list_styles` | Styles disponibles |

Si un traitement dépasse ~50 s, l'outil rend la main avec le statut, et Claude suit avec `get_project`. Le traitement continue tant que Claude reste ouvert.

## Ligne de commande

```bash
npm run caption -- ma-video.mp4 --lang fr --style chenek --cut-silences
```

Résultat : `out/ma-video.<style>[.cut].mp4`.

| Option | Valeurs | Défaut |
|---|---|---|
| `--lang` | `fr`, `en`, `auto` | `auto` |
| `--style` | voir [Styles](#styles) | `chenek` |
| `--model` | `tiny`, `base`, `small`, `medium`, `large-v3`, `large-v3-turbo` | `large-v3-turbo` |
| `--cut-silences` | coupe les blancs entre les mots (jump cuts) | — |
| `--min-silence` | durée minimale d'un blanc à couper, en ms | `500` |
| `--reuse` | réutilise la transcription `public/input/<video>.captions.json` | — |
| `--no-render` | transcrit seulement | — |

Dans le JSON, tu peux corriger le texte, passer `"emphasis"` à `true`/`false` ou `"cut"` à `true` sur un mot, puis relancer avec `--reuse`.

## Styles

| Style | Rendu |
|---|---|
| `chenek` | DA Chenek Crea : grotesque serrée, mot prononcé sur pastille citron, mots importants en italique fine |
| `submagic` | Groupe de mots, pastille violette sur le mot prononcé |
| `hormozi` | Texte condensé, mot prononcé en jaune |
| `oneword` | Un seul mot à l'écran, blanc, sobre |
| `karaoke` | Les mots se remplissent de couleur au fil de la voix |
| `keyword` | Phrase en blanc, mots importants plus gros et en vert |
| `aesthetic` | Sans-serif fin + serif italique sur le mot important |
| `chaos` | Les mots surgissent un par un, tailles, angles, couleurs et polices variés |
| `typewriter` | Lettres qui s'écrivent au rythme de la voix, sur fond noir |
| `podcast` | Bloc de texte sur fond sombre, mot prononcé en jaune |

```bash
npm run preview   # régénère out/styles/catalogue.png et les vignettes de l'interface
```

Les mots importants sont choisis automatiquement, en local : chiffres, mots longs hors mots-outils (FR + EN), espacés d'au moins 1,2 s.

## Limites connues

- La coupe des silences retire aussi les passages sans parole (démo à l'écran, musique), puisqu'aucun mot n'y est détecté.
- Un seul traitement à la fois par processus (l'interface et Claude ont chacun leur file d'attente).

## Développement

```bash
npm run server    # API sur :4321
npm run dev:ui    # interface Vite sur :5173 avec rechargement à chaud
npm run typecheck
npm run studio    # Studio Remotion
```

```
app/               interface web (React + @remotion/player)
server/index.ts    API locale et service des fichiers
core/              cœur partagé : transcription, rendu, projets, Drive, MCP
src/               composition Remotion : styles, mots, montage
scripts/           CLI, installation, aperçu des styles
public/fonts/      polices embarquées (OFL), rendu sans réseau
```

## Licence Remotion

Gratuit pour un usage individuel ; licence payante pour les entreprises de plus de 3 personnes.

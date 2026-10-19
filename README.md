# clipcaption

Sous-titres animés façon Submagic, 100 % en local, en français et en anglais. Une interface web pour transcrire, couper et styliser tes vidéos, et un serveur MCP pour que Claude puisse le faire à ta place.

- **Transcription** : [whisper.cpp](https://github.com/ggerganov/whisper.cpp), timestamps mot par mot, sans API ni clé.
- **Rendu** : [Remotion](https://www.remotion.dev) (React → MP4), 23 préréglages et un designer pour créer n'importe quel style, avec n'importe quelle police Google Fonts.
- **Interface** : éditeur par le texte (couper un passage = barrer ses mots), aperçu en direct, export MP4.
- **Claude** : serveur MCP, les projets créés par Claude apparaissent dans l'interface.

## Prérequis

- Node.js 20+
- `ffmpeg` et `ffprobe` dans le PATH (`brew install ffmpeg` sur macOS)
- macOS/Linux : un compilateur C (`xcode-select --install` sur macOS), car whisper.cpp est compilé à l'installation

## Démarrage rapide (Mac)

Une fois le projet téléchargé (voir Installation), double-clique sur **`Lancer clipcaption.command`** dans le dossier : il installe ce qui manque au premier lancement, démarre l'outil et ouvre http://localhost:4321 dans le navigateur. Laisse la fenêtre du Terminal ouverte pendant que tu travailles.

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

1. **Importe** une ou plusieurs vidéos d'un coup (glisser-déposer ou sélection multiple), ou un lien de partage Google Drive. Choisis la langue et la configuration (`chenek` par défaut). Avec « Exporter automatiquement », chaque vidéo est transcrite puis exportée sans rien faire d'autre.
   Sur la page Projets, coche plusieurs vidéos pour leur appliquer une configuration, les exporter ou télécharger leurs exports d'un coup.
2. **Édite par le texte**, dans la colonne du milieu :
   - clic sur un mot : la vidéo y va ;
   - glisser : sélectionner plusieurs mots ;
   - `⌫` : couper le passage sélectionné (il disparaît de la vidéo et des sous-titres) ;
   - `E` : mettre en avant (utilisé par `chenek`, `keyword`, `aesthetic`, `chaos`) ;
   - double-clic : corriger le mot ;
   - `⌘Z` / `⇧⌘Z` : annuler / rétablir ; `espace` : lecture.
3. **Style** : 23 préréglages + tes styles perso. « + Créer un style » ouvre le designer (voir plus bas). Ajustements rapides : accent, taille, position, mots par écran, majuscules. L'aperçu est en direct.
4. **Montage** : coupe automatique des silences (avec le réglage de la durée minimale), durée finale, changement de langue.
5. **Export** : MP4 H.264 à la résolution d'origine, téléchargeable depuis l'onglet Export.

Tout est sauvegardé automatiquement dans `workspace/projects/<projet>/` : la source, l'aperçu, la transcription et les exports.

### Designer de styles

Dans l'onglet Style, **+ Créer un style** part du style actuel ; le crayon ✎ modifie un style perso. Tout se règle, avec l'aperçu en direct sur ta vidéo :

- **Typographie** : n'importe quelle police Google Fonts (tape son nom, elle est téléchargée en local), graisse, taille, interlettrage, interligne, majuscules, italique.
- **Couleurs** : texte, mot prononcé, pastille, karaoké, fond derrière chaque mot, opacité des mots à venir, dégradé.
- **Contour & ombre** : contour, ombre douce, portée, lueur néon, relief, ou CSS libre.
- **Mot prononcé** : grossissement, inclinaison, soulignement.
- **Mots importants** : taille, couleur, pastille, autre police, italique, inclinaison.
- **Bloc de fond** : couleur, arrondi, flou (effet verre).
- **Mise en page** : position, alignement, largeur, mots par écran.
- **Animation** : écran entier / mot par mot / lettre par lettre ; entrée pop, rebond, montée, fondu, flou ; mode chaos.
- **JSON** : le style complet, pour coller un style généré par Claude.

Les styles perso sont enregistrés dans `workspace/styles/` et utilisables partout (interface, CLI, Claude).

### Google Drive et traitement par lot

La méthode recommandée : installe **[Google Drive pour ordinateur](https://www.google.com/drive/download/)**. Ton Drive apparaît comme un dossier sur le Mac et se synchronise tout seul : clipcaption lit les vidéos dans un dossier Drive et y dépose les MP4 finis, sans partage public ni limite de taille.

**Avec Claude** : *« Sous-titre toutes les vidéos de mon dossier Drive "À sous-titrer" avec la config chenek »*. Claude trouve ton Drive (`list_videos`), lance le lot (`caption_folder`) et suit l'avancement (`get_batch`). Les fichiers finis s'appellent `<nom>.sous-titres.mp4` et arrivent dans `À sous-titrer/Sous-titrées` (ou le dossier de ton choix).

**Sans Claude** :

```bash
npm run lot -- ~/Library/CloudStorage/GoogleDrive-*/"Mon Drive"/"À sous-titrer"
npm run lot -- <dossier> --config chenek --out <dossier de sortie>
npm run lot -- <dossier> --watch     # surveille le dossier : chaque nouvelle vidéo est traitée
```

Astuce : glisse un dossier du Finder dans le Terminal pour écrire son chemin.

Les vidéos déjà faites (fichier `.sous-titres.mp4` présent dans la sortie) sont sautées : relancer un lot ne refait rien.

**Dans l'interface** (onglet Export) : « Copier chaque export dans » envoie chaque export vers un dossier, ton Drive est proposé automatiquement.

### Configurations

Une configuration regroupe style, langue, coupe des silences, ajustements (accent, taille, position, mots par écran) et dossier de sortie. La configuration `chenek` est fournie par défaut : style chenek, FR, coupe des silences > 400 ms, accent citron, taille 65 %, position 65 %, 2 mots par écran.

```bash
npm run lot -- --configs                                        # lister
npm run lot -- --save chenek --no-cut-silences                  # modifier une config
npm run lot -- --save tiktok --style beast --min-silence 300 --cut-silences   # en créer une
```

Aussi depuis l'interface (onglet Export, « Enregistrer ces réglages comme configuration ») ou Claude (`save_config`).

### Lien de partage Drive

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

Ensuite, demande simplement :

- *« Sous-titre ~/Desktop/interview.mp4 en style chenek et coupe les silences »*
- *« Crée-moi un style de sous-titres façon néon avec la police Righteous, montre-le sur mon dernier projet »* : Claude crée le style, reçoit une image d'aperçu, la regarde et corrige si besoin.

| Outil | Rôle |
|---|---|
| `caption_video` | Transcrit et exporte une vidéo (chemin local ou lien Drive) |
| `get_transcript` | Transcription numérotée, pour cibler des mots |
| `edit_project` | Style, accent, taille, position, coupes par plages de mots, mises en avant, corrections |
| `render_project` | Exporte avec les réglages actuels |
| `get_project` / `list_projects` | Suivi des projets |
| `transcribe_again` | Retranscrit, par exemple dans une autre langue |
| `caption_folder` / `get_batch` | Sous-titre tout un dossier (ex. Google Drive) en arrière-plan / suit l'avancement |
| `list_videos` | Vidéos d'un dossier et celles déjà faites ; sans dossier, trouve ton Google Drive |
| `list_configs` / `save_config` | Configurations enregistrées |
| `list_styles` / `get_style` | Styles disponibles et leur définition complète |
| `create_style` / `update_style` | Crée ou modifie un style perso ; rend une image d'aperçu que Claude voit |
| `preview_style` | Image d'un style (ou d'une variante non enregistrée), sur un projet ou une phrase d'exemple |
| `delete_style` | Supprime un style perso |
| `install_font` / `list_fonts` | Installe une police Google Fonts / liste les polices locales |

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

23 préréglages (`npm run preview` génère la planche `out/styles/catalogue.png`) :

| Style | Rendu |
|---|---|
| `chenek` | DA Chenek Crea : grotesque serrée, pastille citron, mots importants en italique fine |
| `submagic` | Groupe de mots, pastille violette sur le mot prononcé |
| `hormozi` | Texte condensé, mot prononcé en jaune |
| `beast` | Police cartoon, contour épais, mot prononcé vert et penché |
| `bebas` | Grand condensé, mot rouge, entrée par le bas |
| `oneword` | Un seul mot à l'écran, blanc, sobre |
| `karaoke` | Les mots se remplissent de couleur au fil de la voix |
| `keyword` | Phrase en blanc, mots importants plus gros et en vert |
| `aesthetic` | Sans-serif fin + serif italique sur le mot important |
| `editorial` | Serif italique crème, mot prononcé souligné, entrée floue |
| `serif` | Grand serif, pastille blanche |
| `neon` | Lueur cyan, mot prononcé magenta |
| `retro` | Relief décalé rose et cyan |
| `gradient` | Mot prononcé en dégradé jaune-rose |
| `marker` | Écriture feutre, surligneur jaune |
| `boxed` | Chaque mot sur fond blanc (TikTok classique) |
| `glass` | Bloc translucide flouté |
| `podcast` | Bloc sur fond sombre, mot prononcé en jaune |
| `docu` | Bandeau bas aligné à gauche, façon documentaire |
| `chaos` | Mots qui surgissent, tailles, angles, couleurs et polices variés |
| `rise` | Les mots arrivent par le bas un par un |
| `dream` | Les mots sortent du flou |
| `typewriter` | Lettres qui s'écrivent au rythme de la voix |

```bash
npm run preview   # régénère out/styles/catalogue.png et les vignettes de l'interface
```

Les mots importants sont choisis automatiquement, en local : chiffres, mots longs hors mots-outils (FR + EN), espacés d'au moins 1,2 s.

## Pourquoi pas Vercel

L'outil tourne sur ta machine : whisper.cpp (binaire natif + modèle de 1,6 Go), ffmpeg, Chrome pour le rendu, fichiers sur disque et traitements de plusieurs minutes. Les fonctions Vercel sont limitées en taille, en durée et sans disque persistant. Une version en ligne demanderait de remplacer la transcription par une API (Deepgram, AssemblyAI), le rendu par Remotion Lambda sur AWS et le stockage par un service de fichiers.

## Dépannage

- **Export en erreur « Target closed »** : le Chrome qui fabrique la vidéo a planté (mémoire ou carte graphique). L'export se relance automatiquement une fois en mode sûr (un seul onglet, rendu logiciel). Si ça arrive souvent, lance toujours en mode sûr : `CLIPCAPTION_SAFE_RENDER=1 ./"Lancer clipcaption.command"`, ou limite le parallélisme avec `CLIPCAPTION_CONCURRENCY=2`.
- **Le Mac chauffe** : la transcription et l'export utilisent tout le processeur, c'est attendu pendant qu'ils tournent (une tâche à la fois). Les aperçus et la copie avant export passent par la puce vidéo du Mac. Pour un export plus doux (plus lent, moins chaud) : `CLIPCAPTION_CONCURRENCY=2 ./"Lancer clipcaption.command"`. Si ça chauffe alors que rien ne tourne dans l'interface, regarde le Moniteur d'activité (processus « Google Chrome for Testing », « chrome-headless-shell », « whisper-cli » ou « ffmpeg » restés ouverts) et quitte-les.
- **Export lent, ou erreur « Could not extract frame from compositor » / « EPIPE »** : vidéos iPhone en 4K, 60 i/s ou HDR. Avant chaque export, clipcaption en fait une copie simple (H.264 1080p, ≤ 30 i/s, couleurs SDR) dans le projet (`render-source.mp4`, refaite seulement si la source change). L'export final sort donc en 1080p, ce que demandent Instagram et TikTok. Pour garder la résolution d'origine : `CLIPCAPTION_FULL_RES=1 ./"Lancer clipcaption.command"` (plus lent, et peut replanter sur du HDR).

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

# rushcut — cahier des charges

Outil de dérushage, **indépendant de clipcaption** (ne rien changer au comportement de clipcaption,
notamment sa transcription sans « euh »). Il vit dans ce repo, dossier `rushcut/`, avec son propre
serveur, son interface (http://localhost:4322) et ses données (`workspace/rushcut/`).

## Le besoin

Un client envoie un brut (jusqu'à 40 min et plus) qui contient **plusieurs pubs** (ex. 15), avec
bégaiements, « euh », reprises de phrases, faux départs, ratés (« attends je reprends », fous rires).
**Aucun script n'est fourni** : l'outil doit retrouver lui-même le texte voulu.

Sortie : **un MP4 propre par pub** (sans sous-titres), + un bouton « Envoyer vers clipcaption » qui
crée un projet clipcaption par pub (via `core/projects.ts` `createProject`), pour sous-titrer ensuite.

## Contraintes

- Local sur Mac (Apple Silicon), même stack que clipcaption : Node, TypeScript (tsx), Express, Vite +
  React, ffmpeg. Réutiliser **en lecture seule** whisper.cpp et le modèle déjà installés
  (`core/whisper.ts` : `WHISPER_BINARY`, `modelFile`), sans modifier `core/transcribe.ts`.
- DA identique à clipcaption (`app/styles.css` : noir, accent #EEF26B, Inter Tight, Geist Mono).
- Interface en français. Rien n'est coupé sans validation visible de l'utilisateur.
- L'utilisateur est économe en tokens : livrer par étapes testables, code sobre, pas de tests lourds.

## Étapes

1. **Transcription mot pour mot** : whisper avec un prompt initial plein d'hésitations
   (« euh, hum, ben, bah, donc euh… ») pour qu'il écrive les disfluences ; langue FR/EN.
   Détection en plus des zones où il y a de la voix mais aucun mot (ffmpeg `silencedetect` inversé) :
   probables « euh »/bégaiements. Bouton « Couper les euh », export d'un MP4 propre
   (ffmpeg, réencodage aux coupes, pas de `-c copy` qui fige des images).
2. **Détection automatique des reprises sans script** : découper en phrases (pauses + ponctuation),
   comparer chaque phrase aux suivantes proches (similarité de mots, ex. ratio de mots communs ou
   distance d'édition) ; une phrase reprise juste après = ancienne prise, on garde **la dernière
   complète**. Faux départs (phrase coupée puis recommencée), mots répétés (« je je »).
   Interface : transcription colorée par statut (gardé / ancienne prise / hésitation / hors texte),
   clic pour basculer, validation globale.
3. **Découpage en pubs** : repérer les frontières (longs silences, reprises du début d'un texte,
   formules type « action », « ok on refait », changement de sujet). Proposer N pubs ajustables,
   exporter un MP4 par pub.
4. **Claude via MCP** : serveur MCP `rushcut` (modèle : `core/mcp.ts` de clipcaption) avec outils
   `get_rush_transcript` (mots indexés + pauses + statuts), `set_takes` (statuts par plages),
   `split_ads` (plages → pubs), `export_ads`. Claude, sur le Mac, reconstitue le script voulu et
   corrige ce que les heuristiques ont raté.

Commencer par l'étape 1, s'arrêter pour que l'utilisateur teste sur un vrai brut.

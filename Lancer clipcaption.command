#!/bin/bash
# Double-clic depuis le Finder : installe ce qui manque, lance l'interface et ouvre Chrome.
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js n'est pas installé. Installe-le depuis https://nodejs.org (version LTS), puis relance ce fichier."
  read -r -p "Appuie sur Entrée pour fermer."
  exit 1
fi
if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg n'est pas installé. Dans le Terminal : brew install ffmpeg  (Homebrew : https://brew.sh)"
  read -r -p "Appuie sur Entrée pour fermer."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Première utilisation : installation des dépendances…"
  npm install || { read -r -p "Échec de l'installation. Entrée pour fermer."; exit 1; }
fi
if [ ! -f whisper.cpp/build/bin/whisper-cli ]; then
  if ! command -v cmake >/dev/null 2>&1; then
    echo "cmake est nécessaire pour la transcription. Dans le Terminal : brew install cmake  (puis relance ce fichier)"
    read -r -p "Appuie sur Entrée pour fermer."
    exit 1
  fi
  echo "Première utilisation : installation de la transcription (~1,6 Go, plusieurs minutes)…"
  npm run setup || { read -r -p "Échec de l'installation de whisper. Entrée pour fermer."; exit 1; }
fi

# Ouvre le navigateur quelques secondes après le démarrage du serveur.
(sleep 6 && open "http://localhost:4321") &
echo "clipcaption démarre… Laisse cette fenêtre ouverte tant que tu utilises l'outil."
npm run app

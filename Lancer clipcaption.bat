@echo off
rem Double-clic depuis l'Explorateur : installe ce qui manque, lance l'interface et ouvre le navigateur.
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js n'est pas installe. Dans PowerShell : winget install OpenJS.NodeJS.LTS
  echo Puis ferme cette fenetre et relance ce fichier.
  pause
  exit /b 1
)
where ffmpeg >nul 2>nul
if errorlevel 1 (
  echo ffmpeg n'est pas installe. Dans PowerShell : winget install Gyan.FFmpeg
  echo Puis ferme cette fenetre et relance ce fichier.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Premiere utilisation : installation des dependances...
  call npm install
  if errorlevel 1 (
    echo Echec de l'installation.
    pause
    exit /b 1
  )
)
if not exist "whisper.cpp\build\bin\whisper-cli.exe" (
  echo Premiere utilisation : installation de la transcription, environ 1,6 Go, plusieurs minutes...
  call npm run setup
  if errorlevel 1 (
    echo Echec de l'installation de whisper.
    pause
    exit /b 1
  )
)

rem Ouvre le navigateur quelques secondes apres le demarrage du serveur.
start "" /b cmd /c "ping -n 7 127.0.0.1 >nul & start http://localhost:4321"
echo clipcaption demarre... Laisse cette fenetre ouverte tant que tu utilises l'outil.
call npm run app
pause

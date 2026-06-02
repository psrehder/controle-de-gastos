#!/bin/sh
# Publish this static app to GitHub.
# Use only after creating a GitHub repo and configuring git on your machine.

REPO_URL="https://github.com/<seu-usuario>/<seu-repositorio>.git"

if [ "$REPO_URL" = "https://github.com/<seu-usuario>/<seu-repositorio>.git" ]; then
  echo "Atualize REPO_URL neste script com a URL do seu repositório GitHub antes de usar."
  exit 1
fi

set -e

echo "Inicializando repositório local..."
git init

git add .
git commit -m "Publicar GR_Controle no GitHub Pages"
git branch -M main

git remote add origin "$REPO_URL"

git push -u origin main

echo "Pronto! Agora acesse o repositório no GitHub e ative o GitHub Pages."
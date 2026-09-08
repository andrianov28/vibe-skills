#!/usr/bin/env bash
# Копирует эталонные скиллы с Яндекс.Диска в репозиторий. Запускать перед коммитом.
set -e
cd "$(dirname "$0")"
SRC="/e/YandexDisk/ИИ Клод Я/Курс по Клоду/07-скиллы"
for s in kwork-podborka; do
  rm -rf "plugins/$s/skills/$s"
  mkdir -p "plugins/$s/skills"
  cp -r "$SRC/$s" "plugins/$s/skills/$s"
  echo "synced $s"
done

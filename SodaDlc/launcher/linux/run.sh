#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -x build/sodalauncher ]; then
  echo "Бинарник не найден. Сначала: ./build.sh"
  exit 1
fi

exec ./build/sodalauncher "$@"

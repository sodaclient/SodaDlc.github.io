#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

BOLD=$'\033[1m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[1;33m'
RED=$'\033[0;31m'
RESET=$'\033[0m'

echo "${BOLD}=== SodaDlc Launcher - Linux build ===${RESET}"

if ! command -v go >/dev/null 2>&1; then
  echo "${RED}[X] Go не найден. Установите Go 1.22+${RESET}"
  exit 1
fi
echo "${GREEN}[OK] Go $(go version | awk '{print $3}')${RESET}"

if ! pkg-config --exists webkit2gtk-4.1 2>/dev/null; then
  echo "${RED}[X] Нет dev-пакетов WebKitGTK 4.1${RESET}"
  echo "    Arch:   sudo pacman -S webkit2gtk-4.1 gtk3"
  echo "    Ubuntu: sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev"
  echo "    Fedora: sudo dnf install webkit2gtk4.1-devel gtk3-devel"
  exit 1
fi
echo "${GREEN}[OK] WebKitGTK 4.1 + GTK3 найдены${RESET}"

mkdir -p build

echo "${YELLOW}[..] Сборка...${RESET}"
CGO_ENABLED=1 go build -trimpath -ldflags="-s -w" -o build/sodalauncher .

echo ""
echo "${GREEN}[OK] Готово: $(pwd)/build/sodalauncher${RESET}"
echo "     Запуск: ./run.sh"

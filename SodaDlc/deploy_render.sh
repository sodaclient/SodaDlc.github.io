#!/bin/bash
# Автоматический деплой SodaDlc на GitHub + Render
# Требует: gh CLI (https://cli.github.com) авторизованный: gh auth login

set -euo pipefail

PROJECT_DIR="/home/lorez/SCR Site_FadingVisual/SodaDlc"
REPO_NAME="sodadlc"
GITHUB_USER=""  # заполнится автоматически

cd "$PROJECT_DIR"

echo "=== SodaDlc Auto-Deploy to GitHub + Render ==="

# 1. Проверяем gh CLI
if ! command -v gh &> /dev/null; then
    echo "ERROR: GitHub CLI (gh) не установлен."
    echo "Установи: sudo pacman -S github-cli  (Arch)"
    echo "         или https://cli.github.com"
    exit 1
fi

# 2. Проверяем авторизацию
if ! gh auth status &> /dev/null; then
    echo "ERROR: Не авторизован в gh. Выполни: gh auth login"
    exit 1
fi

GITHUB_USER=$(gh api user --jq .login)
echo "GitHub user: $GITHUB_USER"

# 3. Инициализируем git если нужно
if [[ ! -d .git ]]; then
    git init
    git add .
    git commit -m "SodaDlc: initial commit - full site + launcher + admin"
fi

# 4. Создаём/обновляем репозиторий
if gh repo view "$GITHUB_USER/$REPO_NAME" &> /dev/null; then
    echo "Репозиторий $GITHUB_USER/$REPO_NAME уже существует, пушим..."
    git remote set-url origin "https://github.com/$GITHUB_USER/$REPO_NAME.git"
else
    echo "Создаём репозиторий $GITHUB_USER/$REPO_NAME..."
    gh repo create "$REPO_NAME" --public --source=. --push
fi

# 5. Пушим изменения
git add -A
git commit -m "Deploy: $(date '+%Y-%m-%d %H:%M')" 2>/dev/null || true
git push origin main

echo ""
echo "✅ Код загружен на GitHub: https://github.com/$GITHUB_USER/$REPO_NAME"
echo ""

# 6. Инструкция для Render
cat << EOF

=== ДАЛЬШЕ (1 минута в браузере) ===

1. Открой: https://render.com/register (или войди)
2. Нажми "New +" → "Web Service"
3. Выбери "Build and deploy from a Git repository"
4. Подключи GitHub → выбери репозиторий: $GITHUB_USER/$REPO_NAME
5. Render сам определит render.yaml:
   - Build Command: npm ci
   - Start Command: node server.js
   - Environment: Node
   - Env Var: DATABASE_URL = строка подключения PostgreSQL
6. Нажми "Create Web Service"

=== ГОТОВО ===

Через 1-2 минуты получишь постоянную ссылку:
🔗 https://sodadlc.onrender.com

(Или как назовёшь сервис на Render)

---

Хочешь, я открою браузер на странице создания сервиса?
EOF

# 7. Пытаемся открыть браузер
if command -v xdg-open &> /dev/null; then
    read -p "Открыть render.com в браузере? [Y/n] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
        xdg-open "https://dashboard.render.com/new/web-service" 2>/dev/null &
    fi
fi

echo ""
echo "Репозиторий: https://github.com/$GITHUB_USER/$REPO_NAME"
echo "Render дашборд: https://dashboard.render.com"
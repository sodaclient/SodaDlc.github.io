#!/usr/bin/env bash
# deploy.sh — быстрый перезапуск SodaDlc локально
# Использование: ./deploy.sh [restart|stop|start|logs|tunnel|status]

set -euo pipefail

ROOT="/home/lorez/SCR Site_FadingVisual/SodaDlc"
PID_FILE="$ROOT/server.pid"
LOG_FILE="$ROOT/server.log"
CF_LOG="/tmp/tunnel.log"
CF_BIN="/tmp/cloudflared"
PORT=3000

cd "$ROOT"

cmd="${1:-restart}"

case "$cmd" in
  start)
    if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
      echo "⚠ Сервер уже запущен (PID $(cat "$PID_FILE"))"
      exit 0
    fi
    echo "▶ Запуск сервера на порту $PORT..."
    node server.js > "$LOG_FILE" 2>&1 &
    echo $! > "$PID_FILE"
    sleep 2
    if kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
      echo "✅ Сервер запущен (PID $(cat "$PID_FILE")) — http://localhost:$PORT"
    else
      echo "❌ Не удалось запустить. Лог:"
      tail -20 "$LOG_FILE"
      exit 1
    fi
    ;;

  stop)
    if [[ -f "$PID_FILE" ]]; then
      PID=$(cat "$PID_FILE")
      if kill -0 "$PID" 2>/dev/null; then
        kill "$PID"
        echo "🛑 Сервер остановлен (PID $PID)"
      else
        echo "⚠ Процесс $PID не найден"
      fi
      rm -f "$PID_FILE"
    else
      echo "⚠ PID-файл не найден"
    fi
    ;;

  restart)
    "$0" stop
    sleep 1
    "$0" start
    ;;

  logs)
    tail -f "$LOG_FILE"
    ;;

  status)
    if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
      echo "✅ Сервер работает (PID $(cat "$PID_FILE")) — http://localhost:$PORT"
      curl -s "http://localhost:$PORT/api/stats" | jq . 2>/dev/null || curl -s "http://localhost:$PORT/api/stats"
    else
      echo "❌ Сервер не запущен"
    fi
    ;;

  tunnel)
    if ! command -v "$CF_BIN" &>/dev/null; then
      echo "⬇ Скачиваю cloudflared..."
      curl -L -o "$CF_BIN" "https://github.com/cloudflare/cloudflared/releases/download/2026.10.2/cloudflared-linux-amd64"
      chmod +x "$CF_BIN"
    fi
    pkill -f "cloudflared tunnel" 2>/dev/null || true
    echo "🌐 Запускаю туннель..."
    nohup "$CF_BIN" tunnel --url "http://localhost:$PORT" > "$CF_LOG" 2>&1 &
    sleep 4
    URL=$(grep -o 'https://[a-zA-Z0-9.-]*\.trycloudflare\.com' "$CF_LOG" | head -1)
    if [[ -n "$URL" ]]; then
      echo "✅ Туннель готов: $URL"
    else
      echo "⏳ Туннель поднимается, проверьте лог: tail -f $CF_LOG"
    fi
    ;;

  tunnel-logs)
    tail -f "$CF_LOG"
    ;;

  *)
    echo "Использование: $0 {start|stop|restart|logs|status|tunnel|tunnel-logs}"
    exit 1
    ;;
esac
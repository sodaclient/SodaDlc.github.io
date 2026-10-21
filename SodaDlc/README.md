# SodaDlc — полностью рабочий сайт

Сайт с регистрацией, личным кабинетом, подписками по ключам и админ-панелью.
Стек: **Node.js 24 + SQLite** (встроенный `node:sqlite`), **Express-подобный HTTP-сервер** без зависимостей.

---

## Быстрый старт (локально)

```bash
cd /home/lorez/SCR\ Site_FadingVisual/SodaDlc
node --experimental-sqlite server.js
# Откроется на http://localhost:3000
```

> Флаг `--experimental-sqlite` нужен для Node 22/23; в Node 24 работает и без него, но флаг допускается.

### Администраторы по умолчанию
| Ник | Пароль | Роль |
|-----|--------|------|
| `lorezzzz` | `soda12345` | admin |
| `zirassov` | `soda12345` | admin |

> При первом запуске создаются эти аккаунты. **Смените пароли** сразу после входа.
> Также добавляется демо-ключ: `SODA-DEMO-2026` (Pro, 30 дней).

---

## Структура

```
SodaDlc/
├── server.js          # HTTP + API + SQLite
├── package.json       # скрипты запуска
├── Dockerfile         # для Render / Railway / Fly
├── render.yaml        # деплой на Render.com (free)
├── public/            # статика (HTML, CSS, JS, изображения)
│   ├── index.html     # лендинг
│   ├── login.html     # вход
│   ├── register.html  # регистрация
│   ├── cabinet.html   # личный кабинет
│   ├── admin.html     # админ-панель
│   ├── news.html      # все новости
│   ├── terms.html     # соглашение
│   ├── privacy.html   # политика конфиденциальности
│   ├── zapret.html    # инструкция по Zapret
│   ├── app.js         # общий JS (API, UI, шапка/подвал)
│   ├── styles.css     # вся стилистика
│   ├── fonts/         # локальные шрифты
│   └── images/        # hero + why-*.webp
├── launcher/          # нативные лаунчеры (Windows WebView2, Linux WebKitGTK)
└── data/              # SQLite файл (создаётся автоматически)
```

---

## API (внутренний)

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/register` | Регистрация `{username, password, email?}` |
| POST | `/api/login` | Вход `{username, password}` → cookie `soda_session` |
| POST | `/api/logout` | Выход |
| GET | `/api/me` | Текущий пользователь |
| POST | `/api/me/password` | Смена пароля `{currentPassword, newPassword}` |
| POST | `/api/keys/activate` | Активация ключа `{key}` |
| GET | `/api/news` | Список новостей |
| GET | `/api/stats` | Публичная статистика |

### Админ (требует роль `admin`)

| Метод | Путь |
|-------|------|
| GET | `/api/admin/stats` |
| GET | `/api/admin/users?q=` |
| PATCH | `/api/admin/users/:id` — `{role?, banned?, plan?, days?}` |
| POST | `/api/admin/users/:id/reset-password` — `{password}` |
| DELETE | `/api/admin/users/:id` |
| GET | `/api/admin/keys` |
| POST | `/api/admin/keys` — `{plan: pro|premium, days, count}` |
| DELETE | `/api/admin/keys/:id` |
| POST | `/api/admin/news` — `{title, body, pinned?}` |
| DELETE | `/api/admin/news/:id` |
| GET | `/api/admin/logs` |

---

## Лаунчер

Нативные сборки на WebView с входом по аккаунту сайта, активацией ключей и подпиской из БД:

- **Windows** — C# + WebView2: `launcher/windows/build.ps1`
- **Linux** — Go + WebKitGTK 4.1: `launcher/linux/build.sh && launcher/linux/run.sh`

Подробности и требования: [`launcher/README.md`](launcher/README.md).

---

## Деплой на бесплатном хостинге

### Render.com (рекомендовано)
1. Зарегистрируйтесь на [render.com](https://render.com) и подключите GitHub-репозиторий с этим кодом.
2. Нажмите **New → Web Service** → выберите репозиторий.
3. Render сам определит `render.yaml`. Если нет — вручную:
   - **Build Command**: пусто (или `echo no build`)
   - **Start Command**: `node --experimental-sqlite server.js`
   - **Environment**: Node 24
   - Добавьте переменную `ADMIN_PASSWORD` (сгенерируется случайная при первом деплое).
4. Сайт будет доступен по адресу `https://sodaclient-github-io.onrender.com`.

> ⚠️ На бесплатном плане диск **эфемерный** — при перезапуске/деплое база сбрасывается. Для постоянства нужен платный диск или внешняя БД (Turso, Neon, Supabase — у всех есть free tier).

### Railway / Fly.io / Koyeb
Аналогично — используйте `Dockerfile` или `startCommand`.

### Локально с публичным туннелем (cloudflared)
Если хотите ссылку прямо сейчас без аккаунтов:
```bash
# В отдельном терминале (Linux/macOS):
wget -qO- https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
  | tar -xz -C /tmp
/tmp/cloudflared tunnel --url http://localhost:3000
```
Выдаст временный `https://*.trycloudflare.com` — работает, пока процессы запущены.

---

## Переменные окружения

| Переменная | По умолчанию | Назначение |
|------------|--------------|------------|
| `PORT` | `3000` | Порт HTTP |
| `HOST` | `0.0.0.0` | Слушающий интерфейс |
| `DATA_DIR` | `./data` | Папка для `sodadlc.db` |
| `DB_PATH` | `$DATA_DIR/sodadlc.db` | Путь к БД |
| `ADMIN_PASSWORD` | `soda12345` | Пароль сид-админов при первом запуске |

---

## Безопасность

- Пароли: **scrypt** (N=16384, r=8, p=1) с индивидуальной солью 16 байт.
- Сессии: HttpOnly, SameSite=Lax, Secure за HTTPS, токен хэшируется SHA-256.
- Rate-limit на `/login`, `/register`, `/activate` (20/10 мин/15/10 мин/20/10 мин по IP).
- Админ-экшены логируются в таблицу `logs`.

---

## Лицензия
MIT — делайте что хотите, упоминание авторства приветствуется.
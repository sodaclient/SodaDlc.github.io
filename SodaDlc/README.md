# SodaDlc — полностью рабочий сайт

Сайт с регистрацией, личным кабинетом, подписками по ключам и админ-панелью.
Стек: **Node.js 24 + PostgreSQL** (`pg`) в продакшене и **PGlite** локально, HTTP-сервер на встроенном `node:http`.

Внешняя PostgreSQL хранит **все** данные: аккаунты, сессии, подписки, ключи, аватарки, кликер, новости, логи, версии лаунчера и настройки.

---

## Быстрый старт (локально)

```bash
cd /home/lorez/SCR\ Site_FadingVisual/SodaDlc
npm ci
npm start
# Откроется на http://localhost:3000
```

Без `DATABASE_URL` локально используется встроенный PostgreSQL-совместимый PGlite и папка `data/pglite`.
Для продакшена задайте `DATABASE_URL` — сервер сам создаст все таблицы.
Локально строку можно положить в `.env` (файл уже в `.gitignore`) — сервер и скрипты читают его автоматически.

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
├── server.js          # HTTP + API
├── db.js              # PostgreSQL / PGlite + схема всех таблиц
├── scripts/           # миграция данных из старого SQLite
├── package.json       # зависимости и скрипты запуска
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
└── data/              # локальная PGlite (создаётся автоматически)
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
3. Создайте бесплатную PostgreSQL-базу: [Neon](https://neon.tech), [Supabase](https://supabase.com) или Render Postgres.
4. В Render добавьте переменную окружения `DATABASE_URL` со строкой подключения (для Neon/Supabase добавьте `?sslmode=require`).
5. Render сам определит `render.yaml`:
   - **Build Command**: `npm ci`
   - **Start Command**: `node server.js`
   - **Environment**: Node 24
   - `ADMIN_PASSWORD` и `DATABASE_URL` — переменные окружения.
6. Сайт будет доступен по адресу `https://sodaclient-github-io.onrender.com`.

> Все таблицы создаются автоматически при старте. Бесплатный диск Render больше не нужен — данные живут во внешней PostgreSQL.

### Перенос старых данных из SQLite
Если раньше использовалась `data/sodadlc.db`, выполните **до первого запуска** на новой пустой базе:
```bash
DATABASE_URL="postgresql://..." npm run db:migrate
```
Скрипт переносит пользователей, сессии, подписки, ключи, кликер, аватарки, новости, логи и лаунчер. Старый файл не изменяется.

Если локально уже используется новая PGlite (`data/pglite`), переносите её:
```bash
DATABASE_URL="postgresql://..." npm run db:migrate:pglite
```

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
| `DATABASE_URL` | — | Строка подключения PostgreSQL. Без неё — локальный PGlite |
| `PG_POOL_SIZE` | `8` | Размер пула соединений PostgreSQL |
| `DATA_DIR` | `./data` | Папка для локальной PGlite |
| `PGLITE_DIR` | `$DATA_DIR/pglite` | Путь к локальной PGlite |
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
# UptimeRobot Setup для Render (бесплатно, 24/7)

## 1. Регистрация
1. Зайди на **https://uptimerobot.com**
2. **Sign Up Free** → введи email, пароль
3. Подтверди email (проверь спам)

## 2. Создание монитора
1. В дашборде нажми **"+ Add New Monitor"**
2. Заполни:
   - **Monitor Type**: `HTTPS`
   - **Friendly Name**: `SodaDlc Render Keep-Alive`
   - **URL (or IP)**: `https://ТВОЙ_САЙТ.onrender.com/api/stats`
   - **Monitoring Interval**: `5 minutes` (бесплатно минимум 5 мин)
   - **HTTP Method**: `GET`
   - **Alert Contacts**: добавь себя (Email / Telegram / Discord webhook)

3. Нажми **Create Monitor**

## 3. Настройка алертов (опционально)
- **Alert when down for**: `1 minute`
- **Alert when up**: включи
- **Alert when paused**: выключи

## 4. Проверка
- В списке мониторов должен появиться зелёный статус "Up"
- Render будет получать запрос каждые 5 минут → не уснёт

---

## Альтернатива: cron-job.org (ещё проще)
1. https://cron-job.org → регистрация
2. **Create Job** → URL: `https://ТВОЙ_САЙТ.onrender.com/api/stats`
3. Schedule: `Every 5 minutes`
4. Save

---

## GitHub Actions (если не хочешь сторонние сервисы)
Создай файл `.github/workflows/keep-alive.yml`:

```yaml
name: Keep Render Alive
on:
  schedule:
    - cron: '*/10 * * * *'  # каждые 10 минут
  workflow_dispatch:

jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - name: Ping Render
        run: |
          curl -fsS "https://ТВОЙ_САЙТ.onrender.com/api/stats" > /dev/null
          echo "Pinged at $(date)"
```

---

## Проверка что работает
```bash
# Логи Render должны показывать регулярные запросы к /api/stats
# В консоли сервера:
# GET /api/stats 200 2ms - 45b
```

---

## Важно
- Замени `ТВОЙ_САЙТ` на реальное имя сервиса на Render
- Эндпоинт `/api/stats` лёгкий (нет БД write, только read) — идеален для пинга
- Free UptimeRobot: до 50 мониторов, интервал от 5 мин
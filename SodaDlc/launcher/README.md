# SodaDlc Launcher

Нативный лаунчер для Windows и Linux на WebView. Один и тот же интерфейс, вход по аккаунту сайта, активация ключей и отображение подписки из базы данных.

## Возможности

- Вход по нику и паролю от сайта (POST `/api/launcher/auth`).
- Показ подписки: план, срок действия, остаток дней.
- Активация лицензионных ключей (POST `/api/launcher/activate`).
- Три продукта: **SodaDlc Legit** (скрытная игра и обход проверок), **SodaDlc Rage** (максимальная боевая мощь), **SodaVisuals** (только визуалы без комбат-функций, разрешены везде).
- Проверка актуальной версии через `/api/launcher/version`.
- Логи входов и активаций пишутся в БД и видны в админке.
- Кнопка «Запустить» пока показывает заглушку — сам запуск клиента добавим позже.

## Структура

```
launcher/
  shared/launcher.html     общий интерфейс (используется обеими сборками)
  shared/logo.svg
  windows/                 C# + WebView2
    Program.cs
    SodaLauncher.csproj
    build.ps1
    assets/launcher.html
    assets/logo.ico
  linux/                   Go + WebKitGTK 4.1
    main.go
    build.sh
    run.sh
    assets/launcher.html
    assets/logo.png
```

## Windows

Требования:

- Windows 10/11
- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0)
- WebView2 Runtime (в Windows 11 уже установлен; для Windows 10 — [ссылка](https://go.microsoft.com/fwlink/p/?LinkId=2124703))

Сборка:

```powershell
cd launcher\windows
powershell -ExecutionPolicy Bypass -File build.ps1
```

Готовый файл:

```
launcher\windows\bin\Release\net8.0-windows\win-x64\publish\SodaLauncher.exe
```

Интерфейс грузится через виртуальный хост `https://sodalauncher.local/` из папки `assets` — поэтому localStorage и fetch работают как на обычном сайте.

## Linux

Требования:

- Go 1.22+
- WebKitGTK 4.1 + GTK3 (dev-пакеты)

```bash
# Arch
sudo pacman -S webkit2gtk-4.1 gtk3

# Ubuntu/Debian
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev

# Fedora
sudo dnf install webkit2gtk4.1-devel gtk3-devel
```

Сборка и запуск:

```bash
cd launcher/linux
./build.sh
./run.sh
```

Бинарник: `launcher/linux/build/sodalauncher` (ассеты встроены через `go:embed`).
Указать другой сервер для теста:

```bash
SODA_SERVER=http://localhost:3000 ./run.sh
```

## Сервер

В лаунчере по умолчанию указан `https://sodaclient-github-io.onrender.com`. Адрес можно изменить в разделе «Настройки сервера» на экране входа.

API использует токен из ответа `/api/launcher/auth` в заголовке `Authorization: Bearer <token>`. Поэтому на сервере включён CORS и поддержка Bearer для лаунчерных эндпоинтов.

> После обновления `server.js` задеплойте его на Render заново, иначе старый сервер не отдаст CORS-заголовки и лаунчер не сможет войти.

## Аккаунты для проверки

- `lorezzzz` / `soda12345`
- `zirassov` / `soda12345`
- Демо-ключ: `SODA-DEMO-2026`

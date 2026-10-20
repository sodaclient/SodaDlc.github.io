$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "  SodaDlc Launcher - Windows build" -ForegroundColor Green
Write-Host "  ================================" -ForegroundColor DarkGreen
Write-Host ""

if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
    Write-Host "  [X] .NET SDK не найден." -ForegroundColor Red
    Write-Host "      Установите .NET 8 SDK: https://dotnet.microsoft.com/download/dotnet/8.0" -ForegroundColor Yellow
    exit 1
}

$sdk = (dotnet --version)
Write-Host "  [OK] .NET SDK $sdk" -ForegroundColor Green

$assets = Join-Path $PSScriptRoot "assets"
if (-not (Test-Path (Join-Path $assets "logo.ico"))) {
    Write-Host "  [..] Генерирую иконку..." -ForegroundColor Yellow
    if (Get-Command magick -ErrorAction SilentlyContinue) {
        magick -background none (Join-Path $assets "logo.svg") -define icon:auto-resize=256,128,64,48,32,16 (Join-Path $assets "logo.ico")
    } else {
        Write-Host "  [!] ImageMagick не найден, иконка будет без логотипа" -ForegroundColor Yellow
    }
}

Write-Host "  [..] Сборка (Release, win-x64, single-file)..." -ForegroundColor Yellow
dotnet publish -c Release -r win-x64 --self-contained true `
    -p:PublishSingleFile=true `
    -p:IncludeNativeLibrariesForSelfExtract=true `
    -p:EnableCompressionInSingleFile=true

if ($LASTEXITCODE -ne 0) {
    Write-Host "  [X] Сборка не удалась" -ForegroundColor Red
    exit 1
}

$exe = Join-Path $PSScriptRoot "bin\Release\net8.0-windows\win-x64\publish\SodaLauncher.exe"
Write-Host ""
Write-Host "  [OK] Готово!" -ForegroundColor Green
Write-Host "  EXE: $exe" -ForegroundColor Cyan
Write-Host ""

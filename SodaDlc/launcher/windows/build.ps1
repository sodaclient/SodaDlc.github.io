<# 
.SYNOPSIS
Build script for Soda Launcher Windows (.exe)

.DESCRIPTION
Compiles the C# WebView2 launcher as a single-file self-contained executable.
Requires .NET 8 SDK and Visual Studio Build Tools.

.USAGE
powershell -ExecutionPolicy Bypass -File build.ps1
#>

param(
    [string]$Configuration = "Release",
    [string]$Runtime = "win-x64",
    [string]$OutputDir = "bin\publish"
)

$ErrorActionPreference = "Stop"

Write-Host "=== Soda Launcher Windows Build ===" -ForegroundColor Cyan
Write-Host "Configuration: $Configuration"
Write-Host "Runtime: $Runtime"
Write-Host ""

# Check .NET SDK
try {
    $dotnetVersion = dotnet --version
    Write-Host "Found .NET SDK: $dotnetVersion" -ForegroundColor Green
} catch {
    Write-Error "ERROR: .NET SDK not found. Install .NET 8 SDK from https://dotnet.microsoft.com/download"
    exit 1
}

# Check project file
$projectPath = "SodaLauncher.csproj"
if (-not (Test-Path $projectPath)) {
    Write-Error "ERROR: $projectPath not found. Run from launcher/windows directory."
    exit 1
}

# Convert logo.svg to logo.ico if needed
$logoSvg = "assets\logo.svg"
$logoIco = "assets\logo.ico"
if (Test-Path $logoSvg -and -not (Test-Path $logoIco)) {
    Write-Host "Converting logo.svg to logo.ico..." -ForegroundColor Yellow
    # Requires ImageMagick or similar
    if (Get-Command magick -ErrorAction SilentlyContinue) {
        magick convert $logoSvg -define icon:auto-resize=256,128,64,48,32,16 $logoIco
        Write-Host "Icon created: $logoIco" -ForegroundColor Green
    } elseif (Get-Command convert -ErrorAction SilentlyContinue) {
        convert $logoSvg -define icon:auto-resize=256,128,64,48,32,16 $logoIco
        Write-Host "Icon created: $logoIco" -ForegroundColor Green
    } else {
        Write-Warning "ImageMagick not found. Skipping icon conversion. Install from https://imagemagick.org"
    }
}

# Restore dependencies
Write-Host "Restoring NuGet packages..." -ForegroundColor Yellow
dotnet restore $projectPath

# Build and publish
Write-Host "Publishing single-file executable..." -ForegroundColor Yellow
dotnet publish $projectPath `
    -c $Configuration `
    -r $Runtime `
    --self-contained true `
    -p:PublishSingleFile=true `
    -p:IncludeNativeLibrariesForSelfExtract=true `
    -p:EnableCompressionInSingleFile=true `
    -o $OutputDir

# Verify output
$exePath = Join-Path $OutputDir "SodaLauncher.exe"
if (Test-Path $exePath) {
    $size = [math]::Round((Get-Item $exePath).Length / 1MB, 1)
    Write-Host ""
    Write-Host "=== BUILD SUCCESS ===" -ForegroundColor Green
    Write-Host "Output: $exePath"
    Write-Host "Size: $size MB"
    Write-Host ""
    Write-Host "To run: .\$exePath"
} else {
    Write-Error "Build failed - executable not found"
    exit 1
}
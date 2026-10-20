#!/bin/bash
# Run script for Soda Launcher Linux

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAUNCHER="$SCRIPT_DIR/build/sodalauncher"

# Check if built binary exists
if [[ ! -f "$LAUNCHER" ]]; then
    echo "Launcher not found. Building first..."
    "$SCRIPT_DIR/build.sh"
fi

# Check for WebKitGTK runtime dependencies
if ! ldconfig -p | grep -q "libwebkit2gtk-4.1"; then
    echo "WARNING: WebKitGTK runtime not found."
    echo "Install with:"
    echo "  Ubuntu/Debian: sudo apt install libwebkit2gtk-4.1-0 libgtk-3-0"
    echo "  Arch: sudo pacman -S webkit2gtk-4.1 gtk3"
    echo "  Fedora: sudo dnf install webkit2gtk-4.1 gtk3"
fi

# Run launcher
export WEBKIT_DISABLE_DMABUF_RENDERER=1
export GDK_BACKEND=x11

exec "$LAUNCHER" "$@"
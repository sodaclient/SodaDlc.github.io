#!/bin/bash
# Build script for Soda Launcher Linux
# Supports both Wails v2 (recommended) and raw WebKitGTK

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"
BUILD_DIR="$PROJECT_ROOT/build"
OUTPUT_NAME="sodalauncher"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}=== Soda Launcher Linux Build ===${NC}"

# Check dependencies
check_deps() {
    echo -e "${YELLOW}Checking dependencies...${NC}"
    
    if ! command -v go &> /dev/null; then
        echo -e "${RED}ERROR: Go not found. Install Go 1.22+ from https://golang.org/dl/${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ Go: $(go version)${NC}"

    # Check for WebKitGTK development libraries
    if pkg-config --exists webkit2gtk-4.1 gtk+-3.0 2>/dev/null; then
        echo -e "${GREEN}✓ WebKitGTK-4.1 and GTK+3 development libraries found${NC}"
        WEBKIT_AVAILABLE=1
    else
        echo -e "${YELLOW}⚠ WebKitGTK development libraries not found${NC}"
        echo -e "  Install on Ubuntu/Debian: sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev"
        echo -e "  Install on Arch: sudo pacman -S webkit2gtk-4.1 gtk3"
        echo -e "  Install on Fedora: sudo dnf install webkit2gtk-4.1-devel gtk3-devel"
        WEBKIT_AVAILABLE=0
    fi
}

# Build with Wails v2 (recommended)
build_wails() {
    echo -e "${YELLOW}Building with Wails v2...${NC}"
    
    if ! command -v wails &> /dev/null; then
        echo -e "${YELLOW}Installing Wails v2...${NC}"
        go install github.com/wailsapp/wails/v2/cmd/wails@latest
        export PATH="$PATH:$(go env GOPATH)/bin"
    fi
    
    cd "$PROJECT_ROOT"
    wails build -clean -platform linux -output "$OUTPUT_NAME"
    
    if [[ -f "$BUILD_DIR/bin/$OUTPUT_NAME" ]]; then
        cp "$BUILD_DIR/bin/$OUTPUT_NAME" "$BUILD_DIR/"
        echo -e "${GREEN}✓ Wails build successful: $BUILD_DIR/$OUTPUT_NAME${NC}"
        return 0
    else
        echo -e "${RED}Wails build failed${NC}"
        return 1
    fi
}

# Build with raw WebKitGTK (no Wails)
build_webkit() {
    if [[ $WEBKIT_AVAILABLE -eq 0 ]]; then
        echo -e "${RED}Cannot build WebKitGTK version - missing dependencies${NC}"
        return 1
    fi
    
    echo -e "${YELLOW}Building with raw WebKitGTK...${NC}"
    
    cd "$PROJECT_ROOT"
    
    # Build with webkit tag
    CGO_ENABLED=1 go build -tags webkit \
        -ldflags="-s -w -extldflags=-static" \
        -o "$BUILD_DIR/$OUTPUT_NAME" \
        .
    
    if [[ -f "$BUILD_DIR/$OUTPUT_NAME" ]]; then
        echo -e "${GREEN}✓ WebKitGTK build successful: $BUILD_DIR/$OUTPUT_NAME${NC}"
        return 0
    else
        echo -e "${RED}WebKitGTK build failed${NC}"
        return 1
    fi
}

# Create AppImage (optional)
create_appimage() {
    if ! command -v appimagetool &> /dev/null; then
        echo -e "${YELLOW}appimagetool not found, skipping AppImage creation${NC}"
        echo -e "  Install: wget https://github.com/AppImage/AppImageKit/releases/download/continuous/appimagetool-x86_64.AppImage"
        return 0
    fi
    
    echo -e "${YELLOW}Creating AppImage...${NC}"
    
    APPDIR="$BUILD_DIR/$OUTPUT_NAME.AppDir"
    mkdir -p "$APPDIR/usr/bin"
    mkdir -p "$APPDIR/usr/share/applications"
    mkdir -p "$APPDIR/usr/share/icons/hicolor/256x256/apps"
    
    cp "$BUILD_DIR/$OUTPUT_NAME" "$APPDIR/usr/bin/"
    chmod +x "$APPDIR/usr/bin/$OUTPUT_NAME"
    
    # Desktop entry
    cat > "$APPDIR/usr/share/applications/$OUTPUT_NAME.desktop" <<EOF
[Desktop Entry]
Name=Soda Launcher
Comment=SodaDlc Visual Client Launcher
Exec=$OUTPUT_NAME
Icon=$OUTPUT_NAME
Terminal=false
Type=Application
Categories=Game;
StartupNotify=true
EOF
    
    # Convert SVG to PNG for icon
    if command -v magick &> /dev/null; then
        magick frontend/assets/logo.svg -resize 256x256 "$APPDIR/usr/share/icons/hicolor/256x256/apps/$OUTPUT_NAME.png"
    elif command -v convert &> /dev/null; then
        convert frontend/assets/logo.svg -resize 256x256 "$APPDIR/usr/share/icons/hicolor/256x256/apps/$OUTPUT_NAME.png"
    fi
    
    # AppRun
    cat > "$APPDIR/AppRun" <<'EOF'
#!/bin/bash
HERE="$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")"
export LD_LIBRARY_PATH="$HERE/usr/lib:$LD_LIBRARY_PATH"
exec "$HERE/usr/bin/sodalauncher" "$@"
EOF
    chmod +x "$APPDIR/AppRun"
    
    # Copy icon
    cp "$APPDIR/usr/share/icons/hicolor/256x256/apps/$OUTPUT_NAME.png" "$APPDIR/$OUTPUT_NAME.png"
    
    cd "$BUILD_DIR"
    appimagetool "$OUTPUT_NAME.AppDir" "$OUTPUT_NAME-x86_64.AppImage"
    
    if [[ -f "$BUILD_DIR/$OUTPUT_NAME-x86_64.AppImage" ]]; then
        echo -e "${GREEN}✓ AppImage created: $BUILD_DIR/$OUTPUT_NAME-x86_64.AppImage${NC}"
    fi
}

# Main
main() {
    mkdir -p "$BUILD_DIR"
    
    check_deps
    
    # Try Wails first (easier, more features)
    if build_wails; then
        echo -e "${GREEN}=== Build complete (Wails) ===${NC}"
        create_appimage
        exit 0
    fi
    
    # Fallback to raw WebKitGTK
    echo -e "${YELLOW}Wails build failed, trying raw WebKitGTK...${NC}"
    if build_webkit; then
        echo -e "${GREEN}=== Build complete (WebKitGTK) ===${NC}"
        create_appimage
        exit 0
    fi
    
    echo -e "${RED}All build methods failed${NC}"
    exit 1
}

main "$@"
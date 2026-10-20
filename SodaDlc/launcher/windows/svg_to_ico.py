#!/usr/bin/env python3
"""
Convert logo.svg to logo.ico (multi-resolution)
Requires: pip install cairosvg pillow
"""

import os
import sys
from pathlib import Path

try:
    import cairosvg
    from PIL import Image
    import io
except ImportError:
    print("Installing dependencies...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "cairosvg", "pillow"])
    import cairosvg
    from PIL import Image
    import io

def svg_to_ico(svg_path, ico_path, sizes=None):
    if sizes is None:
        sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]
    
    print(f"Converting {svg_path} -> {ico_path}")
    
    images = []
    for size in sizes:
        png_data = cairosvg.svg2png(url=str(svg_path), output_width=size[0], output_height=size[1])
        img = Image.open(io.BytesIO(png_data))
        images.append(img)
        print(f"  Generated {size[0]}x{size[1]}")
    
    # Save as ICO
    images[0].save(
        ico_path,
        format='ICO',
        sizes=[(img.width, img.height) for img in images],
        append_images=images[1:]
    )
    print(f"✓ Saved {ico_path}")

if __name__ == "__main__":
    script_dir = Path(__file__).parent
    svg_path = script_dir / "assets" / "logo.svg"
    ico_path = script_dir / "assets" / "logo.ico"
    
    if not svg_path.exists():
        print(f"ERROR: {svg_path} not found")
        sys.exit(1)
    
    svg_to_ico(svg_path, ico_path)
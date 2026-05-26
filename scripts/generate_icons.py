#!/usr/bin/env python3
"""
Generate app icons for Personal Tutor (Tauri bundle).
Run this once before `npm run tauri build` to create proper icon files.

Usage:
    python3 scripts/generate_icons.py
    # or with a custom source image:
    python3 scripts/generate_icons.py --source my_logo.png

Requires: Pillow  (pip install Pillow)
Falls back to a simple navy+gold placeholder if Pillow is unavailable.
"""

import argparse
import os
import struct
import zlib

ICONS_DIR = os.path.join(os.path.dirname(__file__), "..", "src-tauri", "icons")

# ── Minimal stdlib PNG writer (no Pillow needed for placeholders) ─────────────
def _make_png(width: int, height: int, rgba: tuple) -> bytes:
    """Create a solid-color RGBA PNG using only Python stdlib."""
    r, g, b, a = rgba
    raw = bytes([0] + [r, g, b, a] * width) * height  # filter=0 per row
    compressed = zlib.compress(raw, 9)

    def chunk(tag: bytes, data: bytes) -> bytes:
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)

    signature = b"\x89PNG\r\n\x1a\n"
    ihdr_data = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    ihdr = chunk(b"IHDR", ihdr_data)
    idat = chunk(b"IDAT", compressed)
    iend = chunk(b"IEND", b"")
    return signature + ihdr + idat + iend


def write_placeholder_icons():
    """Write navy+gold placeholder PNGs using stdlib only."""
    os.makedirs(ICONS_DIR, exist_ok=True)
    NAVY = (31, 56, 100, 255)   # #1F3864
    GOLD = (201, 168, 76, 255)  # #C9A84C

    sizes = {
        "32x32.png":       (32, 32, NAVY),
        "128x128.png":     (128, 128, NAVY),
        "128x128@2x.png":  (256, 256, NAVY),
    }
    for filename, (w, h, color) in sizes.items():
        path = os.path.join(ICONS_DIR, filename)
        with open(path, "wb") as f:
            f.write(_make_png(w, h, color))
        print(f"  ✓ {filename}")

    # .icns and .ico need Pillow — skip for now
    print("\n  ⚠  icon.icns and icon.ico skipped (need Pillow — see below)")
    print("     Run: pip install Pillow && python3 scripts/generate_icons.py --pillow")


def write_pillow_icons(source_path: str | None = None):
    """Write all required icon formats using Pillow."""
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        print("❌  Pillow not found. Install with:  pip install Pillow")
        return

    os.makedirs(ICONS_DIR, exist_ok=True)

    # Create or load source image
    if source_path and os.path.exists(source_path):
        src = Image.open(source_path).convert("RGBA").resize((1024, 1024))
        print(f"  Using source: {source_path}")
    else:
        # Generate navy square with ◈ symbol
        src = Image.new("RGBA", (1024, 1024), (31, 56, 100, 255))
        try:
            draw = ImageDraw.Draw(src)
            draw.text((200, 300), "◈", fill=(201, 168, 76, 255))
        except Exception:
            pass
        print("  Using placeholder navy icon")

    # PNGs
    for name, size in [("32x32.png", 32), ("128x128.png", 128), ("128x128@2x.png", 256)]:
        resized = src.resize((size, size), Image.LANCZOS)
        resized.save(os.path.join(ICONS_DIR, name), "PNG")
        print(f"  ✓ {name}")

    # .icns (macOS)
    icns_path = os.path.join(ICONS_DIR, "icon.icns")
    src.resize((1024, 1024), Image.LANCZOS).save(icns_path, format="ICNS")
    print("  ✓ icon.icns")

    # .ico (Windows — multi-size)
    ico_path = os.path.join(ICONS_DIR, "icon.ico")
    ico_imgs = [src.resize((s, s), Image.LANCZOS) for s in [16, 32, 48, 64, 128, 256]]
    ico_imgs[0].save(ico_path, format="ICO", sizes=[(s, s) for s in [16, 32, 48, 64, 128, 256]], append_images=ico_imgs[1:])
    print("  ✓ icon.ico")

    print("\nAll icons generated. Update tauri.conf.json bundle.icon when ready to bundle:")
    print("""  "icon": [
    "icons/32x32.png",
    "icons/128x128.png",
    "icons/128x128@2x.png",
    "icons/icon.icns",
    "icons/icon.ico"
  ]""")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate Tauri app icons")
    parser.add_argument("--pillow", action="store_true", help="Use Pillow for full icon set (PNG + ICNS + ICO)")
    parser.add_argument("--source", help="Path to source image (1024×1024 recommended)")
    args = parser.parse_args()

    print(f"Generating icons → {ICONS_DIR}\n")
    if args.pillow or args.source:
        write_pillow_icons(args.source)
    else:
        write_placeholder_icons()
    print("\nDone.")

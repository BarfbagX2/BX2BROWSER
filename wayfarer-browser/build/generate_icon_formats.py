"""Produces build/icon.ico and build/icon.icns from build/icon.png.

.ico uses Pillow's built-in multi-resolution ICO writer.

.icns has no Pillow support and Linux has no `iconutil`, so this writes a
minimal-but-valid ICNS container by hand: a 8-byte "icns" + total-length
header followed by a sequence of (4-byte OSType, 4-byte chunk length,
PNG bytes) entries. Modern macOS icon types (ic07-ic10) simply embed PNG
data directly, which keeps this dependency-free.
"""

import struct
from pathlib import Path
from PIL import Image

BUILD_DIR = Path("/home/claude/wayfarer-browser/build")
SRC = BUILD_DIR / "icon.png"

master = Image.open(SRC).convert("RGBA")

# -- .ico (Windows) --
ico_sizes = [16, 24, 32, 48, 64, 128, 256]
master.save(BUILD_DIR / "icon.ico", sizes=[(s, s) for s in ico_sizes])
print("wrote build/icon.ico with sizes", ico_sizes)

# -- .icns (macOS) --
# OSType -> pixel size, for the modern PNG-based icon families.
icns_types = {
    b"ic07": 128,
    b"ic08": 256,
    b"ic09": 512,
    b"ic10": 1024,
    b"ic11": 32,   # 16pt @2x
    b"ic12": 64,   # 32pt @2x
    b"ic13": 256,  # 128pt @2x
    b"ic14": 512,  # 256pt @2x
}

chunks = b""
for ostype, size in icns_types.items():
    resized = master.resize((size, size), Image.LANCZOS)
    import io

    buf = io.BytesIO()
    resized.save(buf, format="PNG")
    png_bytes = buf.getvalue()
    chunk_len = 8 + len(png_bytes)
    chunks += ostype + struct.pack(">I", chunk_len) + png_bytes

total_len = 8 + len(chunks)
icns_data = b"icns" + struct.pack(">I", total_len) + chunks

(BUILD_DIR / "icon.icns").write_bytes(icns_data)
print("wrote build/icon.icns,", len(icns_data), "bytes")

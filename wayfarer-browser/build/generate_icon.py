"""Generates build/icon.png (1024x1024) - an original compass-star glyph on
a rounded-square accent-blue background, matching the app's own design
tokens. Downscaled copies and platform-specific formats are produced by
generate_icons.sh from this master image."""

import math
from PIL import Image, ImageDraw

SIZE = 1024
BG_COLOR = (76, 124, 240, 255)  # matches --accent-strong in base.css
GLYPH_COLOR = (255, 255, 255, 255)

img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# Rounded-square background.
corner_radius = int(SIZE * 0.22)
draw.rounded_rectangle([0, 0, SIZE - 1, SIZE - 1], radius=corner_radius, fill=BG_COLOR)

# An 8-point star polygon (alternating outer/inner radius) centered in the
# icon - reads as a simple compass rose / wayfinding glyph at any size.
cx, cy = SIZE / 2, SIZE / 2
outer_r = SIZE * 0.32
inner_r = SIZE * 0.13
points = []
for i in range(8):
    angle = math.radians(i * 45 - 90)  # start pointing straight up
    r = outer_r if i % 2 == 0 else inner_r
    points.append((cx + r * math.cos(angle), cy + r * math.sin(angle)))
draw.polygon(points, fill=GLYPH_COLOR)

# Small center dot, like a compass pivot.
dot_r = SIZE * 0.035
draw.ellipse([cx - dot_r, cy - dot_r, cx + dot_r, cy + dot_r], fill=BG_COLOR)

img.save("/home/claude/wayfarer-browser/build/icon.png")
print("wrote build/icon.png", img.size)

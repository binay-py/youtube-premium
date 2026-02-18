"""
Generate PremiumTube Chrome extension icons at 16x16, 48x48, and 128x128.
Design: Red rounded rectangle with a white play-button triangle, subtle gradient and shadow.
Uses 4x supersampling for clean anti-aliased edges.
"""

from PIL import Image, ImageDraw, ImageFilter
import math
import os

OUTPUT_DIR = os.path.dirname(os.path.abspath(__file__))


def generate_icon(size: int) -> Image.Image:
    """Create a single icon at the given pixel size with 4x supersampling."""
    scale = 4
    s = size * scale

    # ── 1. Rounded-rectangle background with gradient ────────────────
    radius = int(s * 0.18)
    outline_w = max(scale, int(s * 0.012))

    # Shadow layer
    shadow = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_offset = max(1, int(s * 0.02))
    shadow_draw.rounded_rectangle(
        [shadow_offset, shadow_offset, s - 1, s - 1],
        radius=radius,
        fill=(0, 0, 0, 80),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=max(1, int(s * 0.03))))

    base = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    base = Image.alpha_composite(base, shadow)

    # Dark red base layer
    bg = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    bg_draw = ImageDraw.Draw(bg)
    bg_draw.rounded_rectangle(
        [0, 0, s - 1, s - 1],
        radius=radius,
        fill=(204, 0, 0, 255),
        outline=(180, 0, 0, 255),
        width=outline_w,
    )

    # Gradient overlay — brighter red fading from top to ~65% height
    gradient = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    grad_draw = ImageDraw.Draw(gradient)
    grad_draw.rounded_rectangle(
        [0, 0, s - 1, s - 1],
        radius=radius,
        fill=(255, 0, 0, 255),
    )

    # Vertical alpha mask for the gradient
    mask = Image.new("L", (s, s), 0)
    mask_data = []
    for y in range(s):
        ratio = y / s
        if ratio < 0.65:
            alpha = int(255 * (1 - ratio / 0.65))
        else:
            alpha = 0
        mask_data.extend([alpha] * s)
    mask.putdata(mask_data)

    transparent = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    bg = Image.alpha_composite(bg, Image.composite(gradient, transparent, mask))
    base = Image.alpha_composite(base, bg)

    # ── 2. Play-button triangle ──────────────────────────────────────
    # Optical centre: shift right by ~4% (play buttons look centred this way)
    cx = s * 0.52
    cy = s * 0.50

    tri_h = s * 0.44
    tri_w = tri_h * math.sqrt(3) / 2

    x_left = cx - tri_w * 0.38
    x_right = cx + tri_w * 0.62
    y_top = cy - tri_h / 2
    y_bot = cy + tri_h / 2

    triangle = [
        (x_left, y_top),
        (x_right, cy),
        (x_left, y_bot),
    ]

    # Triangle drop-shadow
    tri_shadow = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    ts_draw = ImageDraw.Draw(tri_shadow)
    shadow_shift = max(1, int(s * 0.015))
    shifted = [(px + shadow_shift, py + shadow_shift) for px, py in triangle]
    ts_draw.polygon(shifted, fill=(0, 0, 0, 50))
    tri_shadow = tri_shadow.filter(ImageFilter.GaussianBlur(radius=max(1, int(s * 0.02))))
    base = Image.alpha_composite(base, tri_shadow)

    # White play triangle
    final_draw = ImageDraw.Draw(base)
    final_draw.polygon(triangle, fill=(255, 255, 255, 255))

    # ── 3. Top gloss highlight ───────────────────────────────────────
    highlight = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    hl_draw = ImageDraw.Draw(highlight)
    hl_w = int(s * 0.50)
    hl_h = int(s * 0.18)
    hl_x = (s - hl_w) // 2
    hl_y = int(s * 0.06)
    hl_draw.ellipse(
        [hl_x, hl_y, hl_x + hl_w, hl_y + hl_h],
        fill=(255, 255, 255, 30),
    )
    highlight = highlight.filter(ImageFilter.GaussianBlur(radius=max(1, int(s * 0.04))))

    # Clip highlight to rounded rect shape
    clip_mask = Image.new("L", (s, s), 0)
    clip_draw = ImageDraw.Draw(clip_mask)
    clip_draw.rounded_rectangle([0, 0, s - 1, s - 1], radius=radius, fill=255)

    hl_alpha = list(highlight.split()[3].getdata())
    cl_data = list(clip_mask.getdata())
    clipped = Image.new("L", (s, s))
    clipped.putdata([min(a, b) for a, b in zip(hl_alpha, cl_data)])
    highlight.putalpha(clipped)

    base = Image.alpha_composite(base, highlight)

    # ── 4. Down-sample with LANCZOS ──────────────────────────────────
    final = base.resize((size, size), Image.LANCZOS)
    return final


# ── Main ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    sizes = [16, 48, 128]
    for sz in sizes:
        icon = generate_icon(sz)
        path = os.path.join(OUTPUT_DIR, f"icon{sz}.png")
        icon.save(path, "PNG", optimize=True)
        print(f"Saved {path}  ({sz}x{sz})")
    print("All icons generated successfully.")

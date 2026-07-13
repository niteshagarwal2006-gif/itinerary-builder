#!/usr/bin/env python3
"""
Generate luxury travel watermark images for Indian cities.
Saves JPEG files to public/library-images/{city}_watermark.jpeg
"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os, math, random

W, H = 1200, 900
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "library-images")
FONT_DIR = "/System/Library/Fonts/Supplemental"

random.seed(42)

# ── Font helpers ─────────────────────────────────────────────────────────────

def ttf(name, size):
    try:
        return ImageFont.truetype(os.path.join(FONT_DIR, name), size)
    except Exception:
        # Fallback chain
        for fb in ["Georgia Bold.ttf", "Georgia.ttf"]:
            try:
                return ImageFont.truetype(os.path.join(FONT_DIR, fb), size)
            except Exception:
                pass
    return ImageFont.load_default()

# ── Background ────────────────────────────────────────────────────────────────

def make_gradient(c_top, c_bot):
    """Vertical gradient from c_top to c_bot."""
    img = Image.new("RGB", (W, H))
    draw = ImageDraw.Draw(img)
    for y in range(H):
        t = y / H
        r = int(c_top[0] * (1 - t) + c_bot[0] * t)
        g = int(c_top[1] * (1 - t) + c_bot[1] * t)
        b = int(c_top[2] * (1 - t) + c_bot[2] * t)
        draw.line([(0, y), (W, y)], fill=(r, g, b))
    return img

def add_glow(img, cx, cy, radius, color, strength=0.35):
    """Radial soft glow in the centre."""
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(glow)
    steps = 40
    for i in range(steps, 0, -1):
        r = int(radius * i / steps)
        alpha = int(strength * 255 * (1 - i / steps))
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(*color, alpha))
    return Image.alpha_composite(img.convert("RGBA"), glow).convert("RGB")

def add_vignette(img, strength=0.70):
    """Dark vignette around the edges."""
    vig = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(vig)
    cx, cy = W // 2, H // 2
    max_r = math.sqrt(cx ** 2 + cy ** 2)
    steps = 60
    for i in range(steps, 0, -1):
        rx = int(cx * 1.6 * i / steps)
        ry = int(cy * 1.6 * i / steps)
        alpha = int(strength * 255 * (1 - i / steps))
        draw.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=(0, 0, 0, alpha))
    return Image.alpha_composite(img.convert("RGBA"), vig).convert("RGB")

def add_grain(img, amount=18):
    """Film-grain texture overlay."""
    px = img.load()
    for y in range(H):
        for x in range(W):
            n = random.randint(-amount, amount)
            r, g, b = px[x, y]
            px[x, y] = (max(0, min(255, r + n)),
                         max(0, min(255, g + n)),
                         max(0, min(255, b + n)))
    return img

# ── Typography ────────────────────────────────────────────────────────────────

GOLD   = (212, 175, 55)
CREAM  = (245, 235, 200)
WHITE  = (255, 255, 255)

def centered_x(draw, text, font):
    bb = draw.textbbox((0, 0), text, font=font)
    return (W - (bb[2] - bb[0])) // 2, bb[3] - bb[1]

def draw_text_shadow(draw, x, y, text, font, fill, shadow=(0, 0, 0), offset=3):
    draw.text((x + offset, y + offset), text, font=font, fill=(*shadow, 60))
    draw.text((x, y), text, font=font, fill=fill)

def compose(img, city_name, region):
    """Draw all text and decorative elements."""
    draw = ImageDraw.Draw(img, "RGBA")

    mid_y = H // 2

    # ── City name ────────────────────────────────────────────────
    f_city = ttf("Bodoni 72.ttc", 118)
    tx, th = centered_x(draw, city_name.upper(), f_city)
    ty = mid_y - th // 2 - 30

    # Subtle letter-spacing is handled by PIL automatically with the .ttf
    draw.text((tx + 4, ty + 4), city_name.upper(), font=f_city,
              fill=(0, 0, 0, 55))               # drop shadow
    draw.text((tx, ty), city_name.upper(), font=f_city, fill=CREAM)

    # ── Decorative rules ─────────────────────────────────────────
    margin = W // 7
    rule_top = ty - 28
    rule_bot = ty + th + 22

    for rule_y in (rule_top, rule_bot):
        draw.line([(margin, rule_y), (W - margin, rule_y)],
                  fill=(*GOLD, 210), width=2)
        # Diamond ornament at centre of each rule
        cx = W // 2
        for dx, dy in [(0, -5), (5, 0), (0, 5), (-5, 0)]:
            pass
        draw.polygon([(cx, rule_y - 5), (cx + 5, rule_y),
                       (cx, rule_y + 5), (cx - 5, rule_y)],
                     fill=(*GOLD, 220))

    # ── Region label ─────────────────────────────────────────────
    f_region = ttf("Palatino.ttc", 34)
    rx, _ = centered_x(draw, region, f_region)
    draw.text((rx, rule_bot + 18), region, font=f_region, fill=(*GOLD, 200))

    # ── Bottom ornament ───────────────────────────────────────────
    f_bottom = ttf("Palatino.ttc", 26)
    bottom_text = "✦  INDIA  ✦"
    bx, _ = centered_x(draw, bottom_text, f_bottom)
    draw.text((bx, H - 72), bottom_text, font=f_bottom, fill=(*GOLD, 170))

    return img.convert("RGB")

# ── City palette ──────────────────────────────────────────────────────────────
# (slug, display, region, top_rgb, bot_rgb, glow_rgb)

CITIES = [
    ("agra",          "Agra",          "UTTAR PRADESH",  (110, 82, 46),  (48, 32, 14),  (180, 140, 60)),
    ("delhi",         "Delhi",         "NORTH INDIA",    (28, 48, 68),   (10, 22, 38),  (80, 120, 160)),
    ("jaipur",        "Jaipur",        "RAJASTHAN",      (150, 66, 38),  (80, 32, 16),  (220, 120, 60)),
    ("jaisalmer",     "Jaisalmer",     "RAJASTHAN",      (145, 108, 18), (78, 58, 8),   (210, 170, 40)),
    ("jodhpur",       "Jodhpur",       "RAJASTHAN",      (28, 50, 108),  (12, 22, 65),  (70, 110, 200)),
    ("udaipur",       "Udaipur",       "RAJASTHAN",      (22, 62, 108),  (8, 32, 65),   (60, 120, 190)),
    ("varanasi",      "Varanasi",      "UTTAR PRADESH",  (172, 76, 18),  (95, 38, 8),   (240, 130, 40)),
    ("bikaner",       "Bikaner",       "RAJASTHAN",      (158, 72, 28),  (85, 38, 12),  (220, 120, 50)),
    ("bundi",         "Bundi",         "RAJASTHAN",      (38, 95, 55),   (18, 55, 28),  (80, 170, 90)),
    ("kota",          "Kota",          "RAJASTHAN",      (28, 76, 138),  (12, 40, 80),  (60, 130, 210)),
    ("mandawa",       "Mandawa",       "RAJASTHAN",      (172, 76, 14),  (95, 40, 6),   (240, 130, 30)),
    ("ranakpur",      "Ranakpur",      "RAJASTHAN",      (105, 80, 56),  (60, 48, 30),  (170, 140, 90)),
    ("chennai",       "Chennai",       "TAMIL NADU",     (18, 72, 72),   (8, 42, 48),   (50, 140, 140)),
    ("kanchipuram",   "Kanchipuram",   "TAMIL NADU",     (95, 28, 122),  (52, 12, 72),  (160, 60, 200)),
    ("kochi",         "Kochi",         "KERALA",         (172, 66, 18),  (95, 35, 8),   (240, 115, 35)),
    ("kumarakom",     "Kumarakom",     "KERALA",         (14, 95, 85),   (6, 55, 50),   (30, 165, 148)),
    ("madurai",       "Madurai",       "TAMIL NADU",     (95, 22, 115),  (52, 10, 72),  (160, 50, 195)),
    ("mahabalipuram", "Mahabalipuram", "TAMIL NADU",     (22, 70, 148),  (10, 38, 85),  (50, 120, 220)),
    ("munnar",        "Munnar",        "KERALA",         (28, 95, 38),   (12, 58, 18),  (60, 170, 70)),
    ("nattika",       "Nattika",       "KERALA",         (12, 80, 148),  (6, 46, 95),   (30, 140, 220)),
    ("pondicherry",   "Pondicherry",   "PUDUCHERRY",     (95, 48, 115),  (52, 22, 72),  (160, 85, 195)),
]

# ── Main ──────────────────────────────────────────────────────────────────────

def make_watermark(slug, display, region, top_rgb, bot_rgb, glow_rgb):
    out_path = os.path.join(OUT_DIR, f"{slug}_watermark.jpeg")

    img = make_gradient(top_rgb, bot_rgb)
    img = add_glow(img, W // 2, H // 2, 520, glow_rgb, strength=0.28)
    img = add_vignette(img, strength=0.65)
    img = add_grain(img, amount=14)
    img = compose(img, display, region)

    img.save(out_path, "JPEG", quality=92, optimize=True)
    print(f"  ✓  {out_path}")
    return out_path

if __name__ == "__main__":
    os.makedirs(OUT_DIR, exist_ok=True)
    print(f"Generating {len(CITIES)} city watermark images …\n")
    for args in CITIES:
        make_watermark(*args)
    print(f"\nDone — {len(CITIES)} images saved to {OUT_DIR}")

#!/usr/bin/env python3
"""videos/logo -> videos/logo/*.mp4  (reel-ready logo stings)

Three 1080x1920, 3s, 60fps logo animations in the exact Lab Notebook
language: paper ground, ink strokes, one vermilion accent, Fraunces
display over Space Mono chrome, whisper motion with the site's own
--ease curve. DESIGN.md is the spec; this file is that spec at 60fps.

  python scripts/render-videos.py              # all three versions
  python scripts/render-videos.py v1           # just v1-name-merge
  python scripts/render-videos.py v1 v3

Needs: pip install pillow numpy imageio imageio-ffmpeg fonttools brotli
Fonts are converted from the repo's own assets/fonts/*.woff2 to temp
TTFs, so rendering is offline and byte-deterministic: same code in,
same MP4 out.
"""
import math
import os
import sys
import tempfile

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT_DIR = os.path.join(ROOT, "assets", "fonts")
OUT_DIR = os.path.join(ROOT, "videos", "logo")

W, H = 1080, 1920
FPS, DUR = 60, 3.0
N_FRAMES = int(FPS * DUR)

# DESIGN.md section 2, verbatim tokens. Warm paper, never pure white;
# warm near-black, never pure #000; vermilion is the only loud color.
PAPER = (246, 244, 238)
PAPER2 = (239, 236, 226)
SHEET = (251, 250, 246)
INK = (24, 22, 17)
INK2 = (55, 52, 43)
BODY = (59, 56, 46)
MUTED = (95, 89, 74)
LINE = (218, 213, 198)
LINE2 = (196, 190, 172)
ACCENT = (185, 58, 19)
ACCENT_SOFT = (235, 214, 200)  # paper pre-mixed with 12% vermilion

# The ONLY easing curve (DESIGN.md section 8).
BX1, BY1, BX2, BY2 = 0.22, 1.0, 0.36, 1.0


def _bx(t):
    return 3 * (1 - t) ** 2 * t * BX1 + 3 * (1 - t) * t ** 2 * BX2 + t ** 3


def _by(t):
    return 3 * (1 - t) ** 2 * t * BY1 + 3 * (1 - t) * t ** 2 * BY2 + t ** 3


def ease(p):
    """cubic-bezier(.22,1,.36,1): solve x(t)=p by bisection, return y(t)."""
    p = min(1.0, max(0.0, p))
    lo, hi = 0.0, 1.0
    for _ in range(24):
        mid = (lo + hi) / 2
        if _bx(mid) < p:
            lo = mid
        else:
            hi = mid
    return _by((lo + hi) / 2)


def ease_out_back(p):
    c1, c3 = 1.70158, 2.70158
    p = min(1.0, max(0.0, p))
    return 1 + c3 * (p - 1) ** 3 + c1 * (p - 1) ** 2


def seg(t, a, b):
    """Progress of time t within [a, b], clamped 0..1."""
    return min(1.0, max(0.0, (t - a) / (b - a)))


def fade(t, a, b):
    return ease(seg(t, a, b))


def lerp(a, b, p):
    return a + (b - a) * p


# ------------------------------------------------------------------ fonts

FACES = {
    "fraunces600": "fraunces-latin-600-normal.woff2",
    "fraunces400i": "fraunces-latin-400-italic.woff2",
    "archivo400": "archivo-latin-400-normal.woff2",
    "spacemono": "space-mono-latin-400-normal.woff2",
}

# Glyphs the latin-subset woff2 files may not carry get swapped for safe
# lookalikes, so Pillow never paints a .notdef box on screen.
FALLBACKS = {"—": "-", "–": "-", "№": "No.", "→": "->",
             "↗": "^", "◆": "-", "✓": "v"}


def load_fonts():
    tmp = tempfile.mkdtemp(prefix="logo-vid-fonts-")
    fonts, cmaps = {}, {}
    for key, fn in FACES.items():
        src = os.path.join(FONT_DIR, fn)
        if not os.path.exists(src):
            raise SystemExit("missing assets/fonts/%s" % fn)
        dst = os.path.join(tmp, fn.replace(".woff2", ".ttf"))
        if not os.path.exists(dst):
            f = TTFont(src)
            f.flavor = None
            f.save(dst)
        cmaps[key] = TTFont(dst).getBestCmap()
        fonts[key] = dst
    return fonts, cmaps


FONTS, CMAPS = {}, {}


def safe(text, key):
    cmap = CMAPS[key]
    return "".join(ch if ord(ch) in cmap else FALLBACKS.get(ch, "") for ch in text)


def font(key, size):
    return ImageFont.truetype(FONTS[key], size)


# ------------------------------------------------------------------ draw

def base_frame():
    return Image.new("RGB", (W, H), PAPER)


def layer():
    return Image.new("RGBA", (W, H), (0, 0, 0, 0))


def paste(dst, lyr):
    return Image.alpha_composite(dst.convert("RGBA"), lyr).convert("RGB")


def text_w(draw, xy, text, fnt, tracking=0):
    x, y = xy
    total = sum(fnt.getlength(ch) for ch in text) + tracking * max(0, len(text) - 1)
    return total


def draw_tracked(lyr, cx, y, text, fnt, fill, tracking=0, anchor_top=True):
    """Centered, letterspaced text. Returns nothing; paints on lyr."""
    d = ImageDraw.Draw(lyr)
    total = sum(fnt.getlength(ch) for ch in text) + tracking * max(0, len(text) - 1)
    x = cx - total / 2
    asc, desc = fnt.getmetrics()
    for ch in text:
        d.text((x, y), ch, font=fnt, fill=fill)
        x += fnt.getlength(ch) + tracking
    return asc, desc


def draw_tracked_alpha(base, cx, y, text, fnt, rgb, tracking, alpha):
    if alpha <= 0 or not text:
        return base
    lyr = layer()
    draw_tracked(lyr, cx, y, text, fnt, rgb + (int(255 * min(1, alpha)),), tracking)
    return paste(base, lyr)


def vline(base, x, y0, y1, width, rgb, alpha=1.0):
    if alpha <= 0 or y1 <= y0:
        return base
    lyr = layer()
    ImageDraw.Draw(lyr).line([(x, y0), (x, y1)], fill=rgb + (int(255 * alpha),), width=width)
    return paste(base, lyr)


def hline(base, x0, x1, y, width, rgb, alpha=1.0):
    if alpha <= 0 or x1 <= x0:
        return base
    lyr = layer()
    ImageDraw.Draw(lyr).line([(x0, y), (x1, y)], fill=rgb + (int(255 * alpha),), width=width)
    return paste(base, lyr)


def dot(base, cx, cy, r, rgb, alpha=1.0):
    if alpha <= 0 or r <= 0:
        return base
    lyr = layer()
    ImageDraw.Draw(lyr).ellipse([cx - r, cy - r, cx + r, cy + r],
                                fill=rgb + (int(255 * alpha),))
    return paste(base, lyr)


def stamp(base, cx, cy, text, fnt, angle=-7):
    """Rotated vermilion stamp badge (DESIGN.md motif 4)."""
    pad_x, pad_y, bw = 26, 18, 4
    tmp = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(tmp)
    tw = sum(fnt.getlength(ch) for ch in text)
    asc, desc = fnt.getmetrics()
    th = asc + desc
    x0, y0 = cx - tw / 2 - pad_x, cy - th / 2 - pad_y
    x1, y1 = cx + tw / 2 + pad_x, cy + th / 2 + pad_y
    # offset soft shadow first, then the badge face
    d.rectangle([x0 + 8, y0 + 8, x1 + 8, y1 + 8], fill=ACCENT_SOFT + (255,))
    d.rectangle([x0, y0, x1, y1], outline=ACCENT + (255,), width=bw)
    d.text((cx - tw / 2, y0 + pad_y), text, font=fnt, fill=ACCENT + (255,))
    return paste(base, tmp.rotate(angle, resample=Image.BICUBIC, center=(cx, cy)))


def grid(base, alpha):
    if alpha <= 0:
        return base
    lyr = layer()
    d = ImageDraw.Draw(lyr)
    a_minor = int(38 * alpha)
    a_major = int(70 * alpha)
    step, major = 54, 270
    for x in range(0, W + 1, step):
        a = a_major if x % major == 0 else a_minor
        d.line([(x, 0), (x, H)], fill=(110, 104, 88, a))
    for y in range(0, H + 1, step):
        a = a_major if y % major == 0 else a_minor
        d.line([(0, y), (W, y)], fill=(110, 104, 88, a))
    return paste(base, lyr)


GRAINS = []


def grain(base, i):
    """Fixed full-page noise at 5% multiply feel (DESIGN.md section 9)."""
    if not GRAINS:
        rng = np.random.default_rng(7)
        for _ in range(12):
            n = rng.integers(228, 256, size=(H // 2, W // 2), dtype=np.uint8)
            g = Image.fromarray(n, mode="L").resize((W, H), Image.BILINEAR).convert("RGB")
            GRAINS.append(g)
    return Image.blend(base, GRAINS[i % len(GRAINS)], 0.05)


def chrome_top(base, alpha, label="LAB NOTEBOOK No.01 - HARIOM LOHAR", ly=44):
    base = hline(base, 0, W, 0, 12, ACCENT, alpha)
    base = draw_tracked_alpha(base, W / 2, ly, safe(label, "spacemono"),
                              font("spacemono", 26), MUTED, 6, alpha)
    return base


def handle_bottom(base, alpha):
    base = draw_tracked_alpha(base, W / 2, H - 190, "hariomlohardev",
                              font("spacemono", 34), INK, 4, alpha)
    return draw_tracked_alpha(base, W / 2, H - 140, "lab notebook No.01",
                              font("spacemono", 26), MUTED, 5, alpha)


# Monogram geometry: DESIGN.md motif 1, viewBox 44, scaled to stage.
MS = 8.0                      # 44 units * 8 = 352px tall mark
MX = W / 2 - 22 * MS          # exact box center (the mark is asymmetric by design)


def mono_x(u):
    return MX + u * MS


def mono_y(v, top):
    return top + v * MS


def draw_monogram(base, top, p_stem, p_bar, p_foot, p_dot, alpha=1.0):
    sw = max(1, int(round(5 * MS)))
    # two ink stems grow top -> bottom
    base = vline(base, mono_x(7), mono_y(6, top), mono_y(6, top) + 32 * MS * p_stem, sw, INK, alpha)
    base = vline(base, mono_x(23), mono_y(6, top), mono_y(6, top) + 32 * MS * p_stem, sw, INK, alpha)
    # vermilion crossbar draws left -> right at v=22
    base = hline(base, mono_x(7), mono_x(7) + 16 * MS * p_bar, mono_y(22, top), sw, ACCENT, alpha)
    # L foot draws left -> right at v=38
    base = hline(base, mono_x(23), mono_x(23) + 15 * MS * p_foot, mono_y(38, top), sw, INK, alpha)
    # vermilion dot stamps in top-right with a settle
    if p_dot > 0:
        r = 3.4 * MS * (ease_out_back(p_dot) if p_dot < 1 else 1)
        base = dot(base, mono_x(37), mono_y(7, top), max(0, r), ACCENT, alpha)
    return base


# ------------------------------------------------------------------ v1

def frame_v1(i):
    t = i / FPS
    img = base_frame()
    img = chrome_top(img, fade(t, 0.0, 0.4))
    cx = W / 2

    name = "HARIOM LOHAR"
    fnt_big = font("fraunces600", 118)
    # Act 1: full name rises in, tracking tightens 56 -> 10.
    a1 = fade(t, 0.05, 0.55)
    tr = lerp(56, 10, ease(seg(t, 0.05, 0.7)))
    # Act 2: middle letters leave first (1.0-1.5); H and the L of LOHAR
    # hold on as the two survivors (1.3-1.75), then dissolve into the
    # geometric strokes drawing underneath them.
    lyr = layer()
    total = sum(fnt_big.getlength(ch) for ch in name) + tr * (len(name) - 1)
    x = cx - total / 2
    xs = []
    for ch in name:
        xs.append(x)
        x += fnt_big.getlength(ch) + tr
    keep = {0: (1.3, 1.75), 7: (1.3, 1.75)}  # H + L survive longest
    d = ImageDraw.Draw(lyr)
    for k, ch in enumerate(name):
        a0, a1_ = keep.get(k, (1.0, 1.5))
        a = a1 * (1 - fade(t, a0, a1_))
        if a > 0 and ch != " ":
            d.text((xs[k], 660), ch, font=fnt_big, fill=INK + (int(255 * a),))
    img = paste(img, lyr)

    # Act 3: monogram draws 1.25-2.3 at the same optical center.
    top = 830
    img = draw_monogram(img, top,
                        ease(seg(t, 1.25, 2.0)), ease(seg(t, 1.6, 2.1)),
                        ease(seg(t, 1.75, 2.2)), seg(t, 2.05, 2.3),
                        alpha=fade(t, 1.2, 1.5))
    # Act 4: kicker settles under the mark; hold the end card.
    img = draw_tracked_alpha(img, cx, top + 44 * MS + 40, "HARIOM LOHAR",
                             font("fraunces600", 64), INK, 6, fade(t, 2.3, 2.7))
    img = handle_bottom(img, fade(t, 2.45, 2.85))
    return grain(img, i)


# ------------------------------------------------------------------ v2

def frame_v2(i):
    t = i / FPS
    img = base_frame()
    # Act 1: the full mark draws and holds on its own first.
    top = 560
    img = draw_monogram(img, top,
                        ease(seg(t, 0.15, 0.9)), ease(seg(t, 0.5, 0.95)),
                        ease(seg(t, 0.65, 1.05)), seg(t, 0.9, 1.1),
                        alpha=fade(t, 0.1, 0.35))
    # Act 2: only once the HL stands complete, the site's hero terminal
    # types itself below: ink prompt, typed tagline, vermilion block caret.
    prompt = safe("~/hariom $ ", "spacemono")
    phrase = safe("Rebuilding AGI from first principles.", "spacemono")
    fnt_m = font("spacemono", 30)
    n = int(len(phrase) * seg(t, 1.5, 2.6))
    shown = phrase[:n]
    wp = sum(fnt_m.getlength(ch) for ch in prompt)
    ws = sum(fnt_m.getlength(ch) for ch in shown)
    y = top + 44 * MS + 130
    x0 = W / 2 - (wp + ws + 30) / 2
    lyr = layer()
    d = ImageDraw.Draw(lyr)
    a_txt = fade(t, 1.35, 1.55)
    if a_txt > 0:
        d.text((x0, y), prompt, font=fnt_m, fill=INK + (int(255 * a_txt),))
        d.text((x0 + wp, y), shown, font=fnt_m, fill=BODY + (int(255 * a_txt),))
        if t < 2.6 and (i // 15) % 2 == 0 or t >= 2.6:  # caret blinks, rests on
            d.rectangle([x0 + wp + ws + 8, y + 5, x0 + wp + ws + 28, y + 39],
                        fill=ACCENT + (255,))
    img = paste(img, lyr)
    return grain(img, i)


# ------------------------------------------------------------------ v3

def frame_v3(i):
    t = i / FPS
    img = base_frame()
    # vermilion reading-progress sweeps the top (the site's #prog motif)
    pw = ease(seg(t, 0.0, 0.55))
    img = hline(img, 0, W * pw, 0, 10, ACCENT, 1.0)

    # monogram rises 16px out of paper, whisper reveal (the .rv pattern)
    rise = (1 - ease(seg(t, 0.3, 1.1))) * 16
    top = 620 + rise
    img = draw_monogram(img, top, 1, 1, 1, 1, alpha=fade(t, 0.3, 0.9))

    img = draw_tracked_alpha(img, W / 2, top + 44 * MS + 44, "HARIOM LOHAR",
                             font("fraunces600", 60), INK, 6, fade(t, 1.0, 1.4))
    # terminal line types itself with a blinking caret
    line = safe("~/hariom $ ship - one log at a time", "spacemono")
    fnt_m = font("spacemono", 33)
    n = int(len(line) * seg(t, 0.9, 2.2))
    lyr = layer()
    d = ImageDraw.Draw(lyr)
    shown = line[:n]
    tw = sum(fnt_m.getlength(ch) for ch in shown)
    x0 = W / 2 - (tw + 24) / 2
    d.text((x0, top + 44 * MS + 150), shown, font=fnt_m, fill=BODY + (255,))
    if t < 2.6 and (i // 15) % 2 == 0:  # caret blinks ~2Hz, rests on at hold
        d.rectangle([x0 + tw + 8, top + 44 * MS + 156,
                     x0 + tw + 30, top + 44 * MS + 196], fill=ACCENT + (255,))
    elif t >= 2.6:
        d.rectangle([x0 + tw + 8, top + 44 * MS + 156,
                     x0 + tw + 30, top + 44 * MS + 196], fill=ACCENT + (255,))
    img = paste(img, lyr)

    img = draw_tracked_alpha(img, W / 2, H - 260, "hariomlohardev.github.io",
                             font("spacemono", 30), MUTED, 4, fade(t, 2.2, 2.6))
    img = handle_bottom(img, fade(t, 2.35, 2.75))
    return grain(img, i)


VERSIONS = {"v1": ("v1-name-merge", frame_v1),
            "v2": ("v2-hl-terminal", frame_v2),
            "v3": ("v3-ink-stamp-outro", frame_v3)}


def render(key):
    import imageio_ffmpeg
    slug, fn = VERSIONS[key]
    os.makedirs(OUT_DIR, exist_ok=True)
    out = os.path.join(OUT_DIR, slug + ".mp4")
    print("%s: %d frames %dx%d @%dfps" % (slug, N_FRAMES, W, H, FPS), flush=True)
    gen = imageio_ffmpeg.write_frames(
        out, (W, H), pix_fmt_in="rgb24", pix_fmt_out="yuv420p",
        fps=FPS, codec="libx264", macro_block_size=1, quality=8,
        output_params=["-crf", "18", "-preset", "medium", "-movflags", "+faststart"])
    gen.send(None)
    try:
        for i in range(N_FRAMES):
            frame = np.asarray(fn(i), dtype=np.uint8)
            gen.send(frame)
            if (i + 1) % FPS == 0:
                print("  %ds / %ds" % ((i + 1) // FPS, int(DUR)), flush=True)
    finally:
        gen.close()
    # contact sheet: first / middle / last frame for quick review
    sheet = Image.new("RGB", (W // 2 * 3 + 40, H // 2 + 20), PAPER2)
    for k, fi in enumerate([0, N_FRAMES // 2, N_FRAMES - 1]):
        sheet.paste(fn(fi).resize((W // 2, H // 2), Image.BILINEAR), (k * (W // 2 + 10) + 10, 10))
    sheet.save(os.path.join(OUT_DIR, slug + "-preview.jpg"), quality=88)
    print("wrote %s (+ %s-preview.jpg)" % (out, slug), flush=True)


if __name__ == "__main__":
    FONTS, CMAPS = load_fonts()
    wanted = [a for a in sys.argv[1:] if a in VERSIONS] or list(VERSIONS)
    for k in wanted:
        render(k)

"""Cut HUD art out of reference/05-hud-only.png.

Each piece is cropped, the flat grey background is keyed out, and text that
changes at runtime is painted out (the game draws it live on top).
Output: assets/hud/*.png and assets/hud/layout.json (positions in the
1672x941 reference frame, which the HUD CSS scales from).
"""
import json, sys
import numpy as np, cv2
from PIL import Image

REF = sys.argv[1] if len(sys.argv) > 1 else '/mnt/project-files/reference/05-hud-only.png'
OUT = 'assets/hud'
src = np.array(Image.open(REF).convert('RGB')).astype(np.float32)
BG = np.array([111, 110, 110], np.float32)


def inpaint(img, boxes, thresh=150, grow=3):
    """Paint out light text (and its dark outline) inside boxes."""
    out = img.copy().astype(np.uint8)
    mask = np.zeros(img.shape[:2], np.uint8)
    lum = img.mean(axis=2)
    for (x0, y0, x1, y1) in boxes:
        sub = (lum[y0:y1, x0:x1] > thresh).astype(np.uint8)
        mask[y0:y1, x0:x1] |= sub
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * grow + 1, 2 * grow + 1))
    mask = cv2.dilate(mask, k)
    return cv2.inpaint(out, mask * 255, 5, cv2.INPAINT_TELEA).astype(np.float32)


def key_flood(crop, tol=40):
    """Background = grey pixels connected to the crop border. Soft edge via unmixing."""
    d = np.abs(crop - BG).max(axis=2)
    near = (d < tol).astype(np.uint8)
    h, w = near.shape
    ff = near.copy()
    mask = np.zeros((h + 2, w + 2), np.uint8)
    for x in range(w):
        for y in (0, h - 1):
            if ff[y, x] == 1:
                cv2.floodFill(ff, mask, (x, y), 2)
    for y in range(h):
        for x in (0, w - 1):
            if ff[y, x] == 1:
                cv2.floodFill(ff, mask, (x, y), 2)
    bgreg = ff == 2
    a = np.ones((h, w), np.float32)
    a[bgreg] = np.clip((d[bgreg] - 5) / (tol - 5), 0, 1)
    # unmix colour assuming composite over BG
    rgb = crop.copy()
    am = np.maximum(a, 1e-3)[..., None]
    rgb = np.where(bgreg[..., None], (crop - (1 - am) * BG) / am, crop)
    return np.dstack([np.clip(rgb, 0, 255), a * 255])


def key_c2a(crop, boost=1.15):
    """GIMP-style colour-to-alpha against grey: dark panels become translucent black."""
    hi = (crop - BG) / (255 - BG)
    lo = (BG - crop) / BG
    a = np.clip(np.maximum(hi, lo).max(axis=2) * boost, 0, 1)
    am = np.maximum(a, 1e-3)[..., None]
    rgb = (crop - (1 - am) * BG) / am
    return np.dstack([np.clip(rgb, 0, 255), a * 255])


def save(name, rgba):
    Image.fromarray(rgba.astype(np.uint8), 'RGBA').save(f'{OUT}/{name}.png', optimize=True)


layout = {}


def piece(name, box, mode='flood', paint=None, post=None, **kw):
    img = src
    if paint:
        img = inpaint(src, paint, **kw)
    x0, y0, x1, y1 = box
    crop = img[y0:y1, x0:x1]
    rgba = key_flood(crop) if mode == 'flood' else key_c2a(crop)
    if post:
        rgba = post(rgba, box)
    save(name, rgba)
    layout[name] = dict(x=x0, y=y0, w=x1 - x0, h=y1 - y0)


# top-left: portrait + name + bars; numbers painted out
def tl_post(rgba, box):
    # portrait diamond and Lv badge are fully opaque art
    x0, y0 = box[0], box[1]
    h, w = rgba.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    dia = (np.abs(xx + x0 - 96) + np.abs(yy + y0 - 80)) < 72
    rgba[dia, 3] = 255
    rgba[dia, :3] = src[y0:y0 + h, x0:x0 + w][dia]
    return rgba

piece('topleft', (14, 2, 476, 160), mode='c2a',
      paint=[(318, 64, 446, 92), (310, 98, 432, 124)], post=tl_post)

# quest panel; the three lines of text painted out (checkboxes kept)
piece('quest', (1350, 250, 1672, 408), mode='c2a',
      paint=[(1428, 310, 1640, 398)], thresh=140)

# clock + minimap ring + gear; clock text painted out, map interior cut
def map_post(rgba, box):
    x0, y0 = box[0], box[1]
    h, w = rgba.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    r = np.hypot(xx + x0 - 1550, yy + y0 - 117)
    gear = np.hypot(xx + x0 - 1627, yy + y0 - 192) < 29
    hole = (r < 87.5) & ~gear
    rgba[hole, 3] = 0
    edge = (r >= 87.5) & (r < 89) & ~gear
    rgba[edge, 3] *= 0.6
    return rgba

piece('map', (1350, 0, 1672, 232), paint=[(1366, 68, 1444, 92)], post=map_post)

piece('compass_diamond', (822, 24, 880, 80), mode='c2a')
piece('bar', (490, 800, 1240, 930), paint=[(938, 872, 962, 902)])
piece('menu', (18, 840, 302, 914))
piece('dodge', (1376, 812, 1476, 914))
piece('attack', (1484, 744, 1646, 906))
piece('npc_marker', (296, 306, 440, 398))

# individual slot icons for cooldown overlays (opaque squares)
slots = [(519, 827, 597, 903), (610, 826, 686, 902), (701, 826, 777, 902), (792, 826, 868, 902), (883, 826, 959, 902)]
layout['slots'] = [dict(x=a, y=b, w=c - a, h=d - b) for a, b, c, d in slots]
layout['portrait'] = dict(cx=96, cy=80, r=72)
layout['minimap'] = dict(cx=1550, cy=117, r=88)

json.dump(layout, open(f'{OUT}/layout.json', 'w'), indent=1)
print('ok', list(layout))

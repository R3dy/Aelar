"""Make tiling textures from reference/09-material-swatches.png (not seamless as given),
plus a few procedural ones (flagstones, flowers, grass blade card, glow).
Output: assets/tex/*.jpg|png
"""
import sys
import numpy as np, cv2
from PIL import Image

REF = sys.argv[1] if len(sys.argv) > 1 else '/mnt/project-files/reference/09-material-swatches.png'
OUT = 'assets/tex'
sw = np.array(Image.open(REF).convert('RGB')).astype(np.float32)
COLS = [(20, 357), (376, 715), (734, 1072), (1091, 1430)]
ROWS = [(20, 354), (375, 710), (731, 1067)]
NAMES = [['grass', 'dirt', 'cobble', 'cliff'], ['boulder', 'roof', 'wood', 'plaster'],
         ['banner', 'water', 'gold', 'leather']]
rng = np.random.default_rng(7)


def tile(r, c, inset=10):
    (x0, x1), (y0, y1) = COLS[c], ROWS[r]
    return sw[y0 + inset:y1 - inset, x0 + inset:x1 - inset]


def seamless(t, size=512, band=0.3):
    """Two passes (x then y): blend with a half-rolled copy near the edges."""
    t = cv2.resize(t, (size, size), interpolation=cv2.INTER_CUBIC)
    u = np.linspace(0, 1, size)
    e = np.clip(np.minimum(u, 1 - u) / band, 0, 1)
    e = (e * e * (3 - 2 * e)).astype(np.float32)
    r = np.roll(t, size // 2, 1)
    t = t * e[None, :, None] + r * (1 - e[None, :, None])
    r = np.roll(t, size // 2, 0)
    return t * e[:, None, None] + r * (1 - e[:, None, None])


def flatten_light(t, sigma=60, amt=0.7):
    """Remove the swatch's large-scale shading so tiling doesn't show."""
    low = cv2.GaussianBlur(t, (0, 0), sigma)
    mean = t.reshape(-1, 3).mean(0)
    return t - (low - mean) * amt


def save(name, a, q=88):
    Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).save(f'{OUT}/{name}.jpg', quality=q)


for r, row in enumerate(NAMES):
    for c, name in enumerate(row):
        t = tile(r, c)
        if name in ('banner', 'gold'):
            save(name, cv2.resize(t, (256, 512) if name == 'banner' else (512, 512)))
            continue
        if name in ('grass', 'dirt', 'cliff', 'boulder', 'plaster', 'leather', 'water', 'cobble'):
            t = flatten_light(t)
        save(name, seamless(t))

# --- Flagstone path: Voronoi stones tinted from the cobble swatch ---
N = 512
cob = tile(0, 2)
stone_cols = cob.reshape(-1, 3)
stone_cols = stone_cols[stone_cols.mean(1) > 120]
pts = rng.random((26, 2)) * N
pts = np.concatenate([pts + [dx * N, dy * N] for dx in (-1, 0, 1) for dy in (-1, 0, 1)])
yy, xx = np.mgrid[0:N, 0:N]
d = np.stack([np.hypot(xx - p[0], (yy - p[1]) * 1.0) for p in pts], -1)
idx = np.argsort(d, -1)
d1 = np.take_along_axis(d, idx[..., :1], -1)[..., 0]
d2 = np.take_along_axis(d, idx[..., 1:2], -1)[..., 0]
cell = idx[..., 0] % 26
edge = d2 - d1
base = np.zeros((N, N, 3), np.float32)
tints = stone_cols[rng.integers(0, len(stone_cols), 26)]
for i in range(26):
    tints[i] = np.array([172, 160, 150]) * rng.uniform(0.86, 1.08) + rng.normal(0, 4, 3)
base = tints[cell]
noise = cv2.GaussianBlur(rng.normal(0, 1, (N, N)).astype(np.float32), (0, 0), 2.0)
noise2 = cv2.GaussianBlur(rng.normal(0, 1, (N, N)).astype(np.float32), (0, 0), 9.0)
base *= (1 + 0.06 * noise[..., None] + 0.08 * noise2[..., None])
bevel = np.clip(edge / 14, 0, 1)
base *= (0.72 + 0.28 * bevel)[..., None]
dirt = tile(0, 1)
dirt = cv2.resize(seamless(flatten_light(dirt)), (N, N)) * 0.8
gap = np.clip((edge - 3) / 3, 0, 1)[..., None]
flag = base * gap + dirt * (1 - gap)
# moss specks in gaps
moss = (gap[..., 0] < 0.5) & (cv2.GaussianBlur(rng.random((N, N)).astype(np.float32), (0, 0), 3) > 0.52)
flag[moss] = flag[moss] * 0.4 + np.array([92, 120, 40]) * 0.6
save('flagstone', flag)

# --- grass blade card (RGBA), several blades on one card ---
W, H = 128, 256
card = np.zeros((H, W, 4), np.float32)
for b in range(20):
    x0 = rng.uniform(8, W - 8)
    lean = rng.uniform(-34, 34)
    h = rng.uniform(0.45, 1.0) * H
    wid = rng.uniform(3, 5.5)
    for y in range(int(h)):
        t = y / h
        x = x0 + lean * t * t
        ww = wid * (1 - t) ** 0.8 + 0.6
        yy_ = H - 1 - y
        xs = np.arange(int(x - ww - 1), int(x + ww + 2))
        xs = xs[(xs >= 0) & (xs < W)]
        a = np.clip(ww - np.abs(xs - x), 0, 1)
        g = 0.5 + 0.5 * t
        col = np.array([70 + 150 * g * g, 125 + 105 * g, 30 + 30 * g])
        card[yy_, xs, :3] = np.where(a[:, None] > card[yy_, xs, 3:4] / 255, col, card[yy_, xs, :3])
        card[yy_, xs, 3] = np.maximum(card[yy_, xs, 3], a * 255)
Image.fromarray(card.astype(np.uint8), 'RGBA').save(f'{OUT}/blade.png')

# --- soft glow sprite ---
G = 128
r = np.hypot(*(np.mgrid[0:G, 0:G] - G / 2 + 0.5)) / (G / 2)
a = np.clip(1 - r, 0, 1) ** 2.2
glow = np.dstack([np.full((G, G), 255), np.full((G, G), 235), np.full((G, G), 170), a * 255])
Image.fromarray(glow.astype(np.uint8), 'RGBA').save(f'{OUT}/glow.png')

# --- sparkle (4-point star) for path markers ---
yy, xx = (np.mgrid[0:G, 0:G] - G / 2 + 0.5) / (G / 2)
star = np.clip(1 - (np.abs(xx) ** 0.5 + np.abs(yy) ** 0.5) / 1.05, 0, 1) ** 1.5
core = np.clip(1 - np.hypot(xx, yy) * 2.2, 0, 1)
a = np.clip(star * 1.6 + core, 0, 1)
sp = np.dstack([np.full((G, G), 255), 220 + 35 * core, 120 + 120 * core, a * 255])
Image.fromarray(sp.astype(np.uint8), 'RGBA').save(f'{OUT}/sparkle.png')
print('textures done')

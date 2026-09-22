"""Voice/assets/ 大图 HSV 色相重映射：蓝→绿，红/品红→琥珀黄绿，饱和度明度不变。
分段线性映射（角度制）：
  [200,260] 蓝   → [130,150] 绿
  (260,300) 紫   → [150,75]  连续过渡（经过绿色段）
  [300,360) 品红 → [75,85]   黄绿/琥珀
  [0,15]    红   → [85,95]   琥珀
  其余色相不变；近灰像素按饱和度加权保护。
"""
import os
import numpy as np
from PIL import Image

ASSETS = os.path.join(os.path.dirname(__file__), '..', 'assets')
TARGETS = [
    'cover_hero.png',
    'section_bg.png',
    'gen-ch1-globe.png',
    'gen-ch2-phone.png',
    'gen-ch3-shield.png',
    'gen-voice-wave.png',
    'gen-toc-panel-flip.png',
]

def rgb_to_hsv(rgb):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    maxc = rgb.max(-1); minc = rgb.min(-1)
    v = maxc
    c = maxc - minc
    s = np.where(maxc > 0, c / np.maximum(maxc, 1e-9), 0)
    rc = np.where(c > 0, (maxc - r) / np.maximum(c, 1e-9), 0)
    gc = np.where(c > 0, (maxc - g) / np.maximum(c, 1e-9), 0)
    bc = np.where(c > 0, (maxc - b) / np.maximum(c, 1e-9), 0)
    h = np.where(maxc == r, bc - gc, np.where(maxc == g, 2.0 + rc - bc, 4.0 + gc - rc))
    h = (h / 6.0) % 1.0
    h = np.where(c == 0, 0.0, h)
    return h * 360.0, s, v

def hsv_to_rgb(h, s, v):
    h = (h % 360.0) / 60.0
    i = np.floor(h)
    f = h - i
    p = v * (1 - s)
    q = v * (1 - s * f)
    t = v * (1 - s * (1 - f))
    i = i.astype(int) % 6
    r = np.choose(i, [v, q, p, p, t, v])
    g = np.choose(i, [t, v, v, q, p, p])
    b = np.choose(i, [p, p, t, v, v, q])
    return np.stack([r, g, b], -1)

def remap_hue(h):
    h2 = h.copy()
    m = (h >= 200) & (h <= 260)
    h2[m] = 130 + (h[m] - 200) * (20 / 60)
    m = (h > 260) & (h < 300)
    h2[m] = 150 + (h[m] - 260) * ((75 - 150) / 40)
    m = (h >= 300) & (h < 360)
    h2[m] = 75 + (h[m] - 300) * (10 / 60)
    m = h < 15
    h2[m] = 85 + h[m] * (10 / 15)
    return h2

for name in TARGETS:
    path = os.path.join(ASSETS, name)
    im = Image.open(path).convert('RGBA')
    a = np.array(im).astype(np.float64)
    rgb = a[..., :3] / 255.0
    alpha = a[..., 3]
    h, s, v = rgb_to_hsv(rgb)
    h2 = remap_hue(h)
    # 近灰像素保护：饱和度越低，越少偏移
    w = np.clip((s - 0.05) / 0.15, 0, 1)
    hf = h + (h2 - h) * w
    out = hsv_to_rgb(hf, s, v)
    res = np.clip(out * 255.0, 0, 255).astype(np.uint8)
    res = np.dstack([res, alpha.astype(np.uint8)])
    Image.fromarray(res, 'RGBA').save(path)
    print('remapped', name)

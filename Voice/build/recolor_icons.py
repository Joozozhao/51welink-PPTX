"""按 alpha 保留的方式重着色 Voice/assets/icons/ 下的纯色图标 PNG。
文件名后缀决定目标色：2E6FE8→16A34A，F02D4E→F59E0B，0A1F44→0B3D2E；FFFFFF/9AA5B8 不变。
"""
import os
import numpy as np
from PIL import Image

ICONS = os.path.join(os.path.dirname(__file__), '..', 'assets', 'icons')
MAP = {
    '2E6FE8': (22, 163, 74),    # 通信蓝 → 翠绿
    'F02D4E': (245, 158, 11),   # 品牌红 → 琥珀橙
    '0A1F44': (11, 61, 46),     # 深海军蓝 → 深林绿
}

changed, skipped = [], []
for name in sorted(os.listdir(ICONS)):
    if not name.endswith('.png'):
        continue
    suffix = name.rsplit('-', 1)[-1][:-4].upper()
    if suffix not in MAP:
        skipped.append(name)
        continue
    path = os.path.join(ICONS, name)
    im = Image.open(path).convert('RGBA')
    a = np.array(im)
    mask = a[..., 3] > 0
    a[..., 0][mask], a[..., 1][mask], a[..., 2][mask] = MAP[suffix]
    Image.fromarray(a).save(path)
    changed.append(name)

print(f'recolored: {len(changed)}')
print(f'untouched: {len(skipped)} (white/gray)')

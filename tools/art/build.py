"""把 ChatGPT 画的原图（PNG）转成游戏用的 webp，放到 art/。
用法：python3 tools/art/build.py <原图文件夹>
- 首领、探险队、信物、遗珍：去掉近黑背景（变透明），再缩小
- 结局、奇遇：保留背景，只缩小
"""
import sys, os, glob
import numpy as np
from PIL import Image

SRC = sys.argv[1]
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'art')
os.makedirs(OUT, exist_ok=True)
SIZE = {'boss': (360, 540), 'ending': (960, 540), 'event': (720, 405), 'squad': (192, 192), 'token': (128, 128), 'relic': (128, 128)}
CUT = {'boss', 'squad', 'token', 'relic'}

def cut_bg(im, outside_only=False):
    a = np.asarray(im.convert('RGB')).astype(np.float32)
    h, w, _ = a.shape
    corners = np.concatenate([a[:8, :8].reshape(-1, 3), a[:8, -8:].reshape(-1, 3), a[-8:, :8].reshape(-1, 3), a[-8:, -8:].reshape(-1, 3)])
    bg = np.median(corners, axis=0)
    d = np.abs(a - bg).max(axis=2)
    alpha = np.clip((d - 14) / 46, 0, 1)
    if outside_only:
        # 首领：只去掉和画面边缘连着的黑底，人物身上的黑色衣服保留（不然台面会透过来）
        from scipy import ndimage
        lab, _ = ndimage.label(d < 30)
        edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
        outside = np.isin(lab, list(edge))
        outside = ndimage.binary_erosion(outside, iterations=1, border_value=1)
        alpha = np.where(outside, alpha, np.maximum(alpha, 0.94))
    k = np.maximum(alpha, 1e-3)[..., None]
    rgb = np.clip((a - bg * (1 - k)) / k, 0, 255)
    out = np.dstack([rgb, alpha * 255]).astype(np.uint8)
    return Image.fromarray(out, 'RGBA')

def fit(im, box):
    w, h = box
    # 按目标比例居中裁切，再缩放
    r = w / h; iw, ih = im.size
    if iw / ih > r:
        nw = int(ih * r); im = im.crop(((iw - nw) // 2, 0, (iw - nw) // 2 + nw, ih))
    elif iw / ih < r:
        nh = int(iw / r); im = im.crop((0, (ih - nh) // 2, iw, (ih - nh) // 2 + nh))
    return im.resize(box, Image.LANCZOS)

tot = 0
for f in sorted(glob.glob(os.path.join(SRC, '*.png'))):
    name = os.path.splitext(os.path.basename(f))[0]
    kind = name.split('_')[0]
    if kind not in SIZE: continue
    im = Image.open(f)
    im = fit(im, SIZE[kind])
    if kind in CUT: im = cut_bg(im, outside_only=(kind == 'boss'))
    dst = os.path.join(OUT, name + '.webp')
    im.save(dst, 'WEBP', quality=80 if kind in ('ending', 'event') else 82, method=6)
    tot += os.path.getsize(dst)
print('files', len(glob.glob(os.path.join(OUT, '*.webp'))), 'total KB', tot // 1024)

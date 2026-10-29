# like grid.py, but over a full-canvas render (canvas px), labelled in sheet coordinates
import sys, numpy as np
from PIL import Image, ImageDraw
ox, oy, w, h, X0, Y0, S = np.load('work/meta.npy')
T = lambda x, y: ((x - X0) * S + ox, (y - Y0) * S + oy)
def zoom(path, box, k, name, step=10):
    im = Image.open(path).convert('RGB')
    a, b = T(box[0], box[1]); c, d = T(box[2], box[3])
    cw, ch = int((box[2] - box[0]) * k), int((box[3] - box[1]) * k)
    o = im.crop((int(a), int(b), int(c), int(d))).resize((cw, ch), Image.LANCZOS)
    dr = ImageDraw.Draw(o, 'RGBA')
    for y in range(box[1] - box[1] % step + step, box[3], step):
        Y = (y - box[1]) * k; dr.line([(0, Y), (cw, Y)], fill=(255, 0, 0, 60 if y % 50 else 150)); dr.text((2, Y - 10), str(y), fill=(220, 0, 0, 255))
    for x in range(box[0] - box[0] % step + step, box[2], step):
        X = (x - box[0]) * k; dr.line([(X, 0), (X, ch)], fill=(0, 90, 255, 60 if x % 50 else 150)); dr.text((X + 2, 2), str(x), fill=(0, 60, 220, 255))
    o.save(name)
a = sys.argv[1:]
zoom(a[0], tuple(map(int, a[1:5])), float(a[5]), a[6])

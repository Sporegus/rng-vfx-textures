import numpy as np, json
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from parts import SEEDS, CUTS
ink = np.load('work/ink.npy').astype(np.float32); sil = np.load('work/sil.npy')
ox, oy, w, h, X0, Y0, S = np.load('work/meta.npy')
CH, CW = ink.shape
T = lambda p: ((p[0] - X0) * S + ox, (p[1] - Y0) * S + oy)
wall = Image.new('1', (CW, CH)); d = ImageDraw.Draw(wall)
def ext(c, k=2.5):
    import math
    c = list(c)
    for a, b, i in ((c[1], c[0], 0), (c[-2], c[-1], -1)):
        dx, dy = b[0] - a[0], b[1] - a[1]; L = math.hypot(dx, dy) or 1
        c[i] = (b[0] + dx / L * k, b[1] + dy / L * k)
    return c
for c in CUTS: d.line([T(p) for p in ext(c)], fill=1, width=5)
wall = np.asarray(wall)
lines = ink >= 0.5
fill = sil & ~lines & ~wall
core = lines & ~ndi.binary_dilation(~lines, iterations=9) & ~wall   # the solid black areas (clothes)
names = list(SEEDS); lab = np.zeros((CH, CW), np.int16)
for src in (fill, core):
    comp, n = ndi.label(src)
    for i, k in enumerate(names, 1):
        for p in SEEDS[k]:
            x, y = map(int, map(round, T(p)))
            if comp[y, x]: lab[comp == comp[y, x]] = i
miss = [(k, p) for k in names for p in SEEDS[k] if not (fill | core)[int(round(T(p)[1])), int(round(T(p)[0]))]]
print('seeds not on a region:', miss)
np.save('work/lab0.npy', lab)
rng = np.random.default_rng(7); col = rng.integers(40, 255, (len(names) + 1, 3)); col[0] = 255
img = col[lab].astype(np.uint8)
img[(lab == 0) & (fill | core)] = (255, 0, 0)        # unassigned areas in red
img[lines & ~core] = 0; img[wall & sil] = (255, 0, 255)
im = Image.fromarray(img); dr = ImageDraw.Draw(im)
for i, k in enumerate(names, 1):
    for p in SEEDS[k]:
        x, y = T(p); dr.text((x - 30, y), k.replace('Hair_', 'H.'), fill=(0, 0, 0))
im.save('work/lab0.png')
im.crop((700, 150, 2300, 2400)).resize((1000, 1406)).save('work/lab0-top.png')
im.crop((700, 1900, 2300, 4000)).resize((800, 1050)).save('work/lab0-bot.png')
print('unassigned px', int(((lab == 0) & (fill | core)).sum()))

# the leftover areas, each with a point well inside it (sheet px)
left = (lab == 0) & (fill | core)
comp, n = ndi.label(left)
out = []
for i, sl in enumerate(ndi.find_objects(comp), 1):
    m = comp[sl] == i; a = int(m.sum())
    if a < 400: continue
    dt = ndi.distance_transform_edt(m); y, x = np.unravel_index(dt.argmax(), dt.shape)
    x += sl[1].start; y += sl[0].start
    out.append((a, round((x - ox) / S + X0, 1), round((y - oy) / S + Y0, 1), 'core' if core[y, x] else 'fill'))
out.sort(reverse=True)
im = Image.open('work/lab0.png'); dr = ImageDraw.Draw(im)
for j, o in enumerate(out):
    x, y = T((o[1], o[2])); dr.ellipse((x - 14, y - 14, x + 14, y + 14), fill=(255, 255, 0)); dr.text((x - 6, y - 6), str(j), fill=(0, 0, 0))
    print(j, o)
im.crop((700, 150, 2300, 2400)).resize((1000, 1406)).save('work/lab0-top.png')
im.crop((700, 1900, 2300, 4000)).resize((800, 1050)).save('work/lab0-bot.png')

# Stage 2-3: cut Nova into layers, give each part its hidden overlap, render every layer
# on the full 3000x4000 canvas, and check that stacking them rebuilds her exactly.
import numpy as np, json, sys
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from parts import SEEDS, FEATURES, FEATURE_ORDER, MERGE, EXT, SPREAD, Z
FILL = np.array([0xbf, 0xe6, 0xff], np.float32); INK = np.array([5, 7, 15], np.float32)
LW = 12                                     # her line width on the canvas (px)
ink = np.load('work/ink.npy').astype(np.float32); sil = np.load('work/sil.npy'); lab0 = np.load('work/lab0.npy')
ox, oy, w, h, X0, Y0, S = np.load('work/meta.npy'); CH, CW = ink.shape
T = lambda p: ((p[0] - X0) * S + ox, (p[1] - Y0) * S + oy)
def poly(pts):
    im = Image.new('1', (CW, CH)); ImageDraw.Draw(im).polygon([T(p) for p in pts], fill=1); return np.asarray(im)
seeds = list(SEEDS); idx = {k: i for i, k in enumerate(Z, 1)}
lines = ink >= 0.5; anyink = ink > 0.004
area = sil | anyink                          # everything that is her
lab = np.zeros((CH, CW), np.int16)
for i, k in enumerate(seeds, 1): lab[lab0 == i] = idx[k]
# 1. areas the seeds didn't reach (cut walls, specks) take their nearest part
fillish = sil & ~lines
todo = fillish & (lab == 0)
if todo.any():
    _, (iy, ix) = ndi.distance_transform_edt(lab == 0, return_indices=True)
    lab[todo] = lab[iy[todo], ix[todo]]
# 2. every remaining line goes to the FRONTMOST part touching it
need = anyink & (lab == 0)
R = 16
for k in Z:
    m = lab == idx[k]
    if not m.any(): continue
    ys, xs = np.where(m); y0, y1, x0, x1 = max(ys.min() - R, 0), min(ys.max() + R + 1, CH), max(xs.min() - R, 0), min(xs.max() + R + 1, CW)
    near = ndi.distance_transform_edt(~m[y0:y1, x0:x1]) <= R
    sub = need[y0:y1, x0:x1] & near
    lab[y0:y1, x0:x1][sub] = idx[k]
left = need & (lab == 0)
if left.any():
    _, (iy, ix) = ndi.distance_transform_edt(lab == 0, return_indices=True); lab[left] = lab[iy[left], ix[left]]
# 3. the face features take their lines / areas
for k in FEATURE_ORDER:
    kind, pts = FEATURES[k]; m = poly(pts) & area
    if kind == 'ink': m &= anyink
    elif kind == 'fill': m &= ~lines
    tgt = MERGE.get(k, k); lab[m] = idx[tgt]
# (the white dot in her right pupil is its highlight)
hl = {}
for side, (cx, cy) in (('Right', (129.6, 245.2)), ('Left', (174.3, 223.5))):
    m = poly([(cx + 3.6 * np.cos(a), cy + 4.4 * np.sin(a)) for a in np.linspace(0, 2 * np.pi, 40)]) & sil & (ink < 0.5)
    hl[side] = m
np.save('work/lab.npy', lab)
# 4. her colours, then each part's own pixels
rgb = np.where(sil[..., None], FILL * (1 - ink[..., None]) + INK * ink[..., None], INK).astype(np.float32)
alpha = np.where(sil, 1.0, ink).astype(np.float32)
Image.fromarray(np.dstack([rgb, alpha * 255]).astype(np.uint8), 'RGBA').save('work/original.png')
vis = {k: (lab == idx[k]) & area for k in Z}
for side in ('Left', 'Right'):
    vis['Eye_Highlight_' + side] = hl[side]; vis['Pupil_' + side] &= ~hl[side]
dark = {k: (ink[vis[k]] >= 0.5).mean() > 0.6 if vis[k].any() else False for k in vis}   # mostly black parts (clothes)
dark['Skirt_Base'] = True
NOSTROKE = {'Eye_White_Left', 'Eye_White_Right'}
# 5. hidden overlap: grow under the parts in FRONT (never over the ones behind), outline its edge
order = Z[:]
pos = {k: i for i, k in enumerate(order)}
frontvis = np.zeros((CH, CW), bool); front_of = {}
full_order = order[:order.index('Pupil_Right') + 1] + ['Eye_Highlight_Left', 'Eye_Highlight_Right'] + order[order.index('Pupil_Right') + 1:]
for k in reversed(full_order):
    front_of[k] = frontvis.copy(); frontvis |= vis[k]
layers = {}
def box(m, pad):
    ys, xs = np.where(m)
    return max(ys.min() - pad, 0), min(ys.max() + pad + 1, CH), max(xs.min() - pad, 0), min(xs.max() + pad + 1, CW)
for k in order:
    v = vis[k]
    spread = next((d for p, d in SPREAD.items() if k.startswith(p)), LW)
    extra = np.zeros_like(v)
    for pts in EXT.get(k, []): extra |= poly(pts)
    y0, y1, x0, x1 = box(v | extra, spread + 4)
    vc, xc, fc = v[y0:y1, x0:x1], extra[y0:y1, x0:x1], front_of[k][y0:y1, x0:x1]
    grown = vc & sil[y0:y1, x0:x1]
    if grown.any(): grown = ndi.binary_dilation(grown, iterations=spread) & ~vc
    ext = (grown | xc) & fc & ~vc & sil[y0:y1, x0:x1]   # (only under fully opaque art)
    base = INK if dark[k] else FILL
    out = np.zeros((CH, CW, 4), np.float32); oc = out[y0:y1, x0:x1]
    if ext.any():
        shape = ndi.binary_fill_holes(grown | xc | vc)     # the part's own whole shape, before clipping
        d = ndi.distance_transform_edt(np.pad(shape, 1))[1:-1, 1:-1]
        edge = np.zeros_like(d) if (dark[k] or k in NOSTROKE) else np.clip(LW + 0.5 - d, 0, 1)   # outline along the hidden edge
        c = base * (1 - edge[..., None]) + INK * edge[..., None]
        oc[ext, :3] = c[ext]; oc[ext, 3] = 1
    out[v, :3] = rgb[v]; out[v, 3] = alpha[v]
    layers[k] = out
    Image.fromarray(np.round(out * [1, 1, 1, 255]).astype(np.uint8), 'RGBA').save(f'work/layers/{k}.png')
    print(f'{k:24s} visible {int(v.sum()):8d}  hidden {int(ext.sum()):8d}', 'black' if dark[k] else '')
# highlights are tiny extra layers on top of the pupils
for side in ('Left', 'Right'):
    k = 'Eye_Highlight_' + side; out = np.zeros((CH, CW, 4), np.float32); m = vis[k]
    out[m, :3] = rgb[m]; out[m, 3] = 1; layers[k] = out
    Image.fromarray(np.round(out * [1, 1, 1, 255]).astype(np.uint8), 'RGBA').save(f'work/layers/{k}.png')
json.dump(order[:order.index('Pupil_Right') + 1] + ['Eye_Highlight_Left', 'Eye_Highlight_Right'] + order[order.index('Pupil_Right') + 1:], open('work/order.json', 'w'))
# 6. the stacking check is check.py (stacks the saved layer PNGs and compares them with work/original.png)

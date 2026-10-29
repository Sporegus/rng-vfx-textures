# Turns Nova's animation sheets (from the artist) into frame packs the app plays.
#   python3 make_packs.py        -> src/frames/<anim>/NN.png and src/frames/packs.js
# Each pack: the frames cut from a sheet, background removed, edges cleaned, sized so her
# full height (halo to soles) is 74 sprite units like her other drawn poses, and placed by
# her hips (across) and the ground line (down). Frames face right; the app mirrors them.
import json, os
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', 'src', 'frames')
HEIGHT = 74            # her height in sprite units, as in cartoon.js
GROUND, CENTRE = 78, 24  # where her feet and hips go in the 48 x 80 sprite box
INK = np.array([5, 7, 15], np.float32)

# one entry per sheet: the grid of frames, which frames are drawn mirrored, timing
PACKS = {
  'walk': dict(sheet='walk-sheet.png', cols=4, grounds=[392, 812], tops=[0, 432], order=range(8),
               mirrored=[4, 5, 6, 7], fps=7, loop=True, stride=76),   # stride: sprite units she travels per cycle (two steps)
}

def cut(pack):
    im = Image.open(os.path.join(HERE, pack['sheet'])).convert('RGB'); A = np.asarray(im).astype(np.float32)
    bg = np.median(A[:6].reshape(-1, 3), axis=0)              # the sheet's background colour
    dist = np.sqrt(((A - bg) ** 2).sum(-1))
    W = A.shape[1]; cw = W // pack['cols']; frames = []
    for gy, top in zip(pack['grounds'], pack['tops']):
        for c in range(pack['cols']):
            x0, x1 = c * cw, (c + 1) * cw
            d = dist[top:gy - 3, x0:x1]
            lab, n = ndi.label(d > 60); sizes = ndi.sum(np.ones_like(lab), lab, range(1, n + 1))
            keep = ndi.binary_fill_holes(np.isin(lab, 1 + np.where(sizes > 300)[0]))
            alpha = np.clip((d - 25) / 50, 0, 1) * ndi.binary_dilation(keep, iterations=2)
            rgb = A[top:gy - 3, x0:x1].copy()
            # the sheet draws a thin light rim outside her black outline: take it off where a line is just inside
            darkpx = (rgb.sum(-1) < 200) & (alpha > 0.5)
            out = alpha < 0.5
            rim = (rgb.sum(-1) > 450) & ndi.binary_dilation(out, iterations=2) & ndi.binary_dilation(darkpx, iterations=3)
            alpha[rim] = 0
            # her outline is the outermost thing, so the soft edge is black line, and any
            # background colour still mixed into pixels near the edge becomes line too
            near = ~ndi.binary_erosion(alpha > 0.98, iterations=3)
            pinkish = (rgb[..., 0] - rgb[..., 2] > 15) & (rgb[..., 0] - rgb[..., 1] > 30)
            rgb[(alpha > 0) & (alpha <= 0.98)] = INK
            rgb[near & pinkish & (alpha > 0)] = INK
            # a clean black outline all the way round (the sheet's is thin and grey in places)
            body = alpha > 0.5
            dist_out = ndi.distance_transform_edt(~body)
            ring = (dist_out > 0) & (dist_out <= 2.6)
            rgb[ring] = INK; alpha = np.maximum(alpha, np.clip(2.6 - dist_out + 0.5, 0, 1) * (dist_out > 0))
            frames.append(np.dstack([rgb, alpha * 255]).astype(np.uint8))
    return frames

def hips(a):   # across: the middle of her black skirt
    h = a.shape[0]; band = a[int(h * 0.38):int(h * 0.56)]
    xs = np.where((band[..., :3].astype(int).sum(-1) < 150) & (band[..., 3] > 200))[1]
    return float(np.median(xs))

packs = {}
for name, p in PACKS.items():
    raw = cut(p)
    frames = [raw[i] for i in p['order']]
    frames = [f[:, ::-1] if i in p['mirrored'] else f for i, f in zip(p['order'], frames)]
    tall = max(f.shape[0] - np.where(f[..., 3].any(1))[0][0] for f in frames)   # tallest frame, halo to ground
    upx = HEIGHT / tall                                                        # sprite units per sheet px
    os.makedirs(os.path.join(OUT, name), exist_ok=True)
    meta = []
    for i, f in enumerate(frames):
        ys, xs = np.where(f[..., 3] > 0); y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        hx = hips(f)
        Image.fromarray(f[y0:y1, x0:x1], 'RGBA').save(os.path.join(OUT, name, f'{i + 1:02d}.png'), optimize=True)
        # where the trimmed image's top-left goes in the sprite box (units)
        meta.append({'src': f'frames/{name}/{i + 1:02d}.png', 'x': round(CENTRE - (hx - x0) * upx, 3), 'y': round(GROUND - (f.shape[0] - y0) * upx, 3),
                     'w': round((x1 - x0) * upx, 3), 'h': round((y1 - y0) * upx, 3)})
    packs[name] = {'fps': p['fps'], 'loop': p['loop'], 'frames': meta}
    # how fast she moves while it plays, so her feet stay planted (sprite units per second)
    if p.get('stride'): packs[name]['speed'] = round(p['stride'] * p['fps'] / len(meta), 2)
    print(name, len(meta), 'frames, x from', min(m['x'] for m in meta), 'to', max(m['x'] + m['w'] for m in meta), 'units; top', min(m['y'] for m in meta))
with open(os.path.join(OUT, 'packs.js'), 'w') as f:
    f.write('// Made by art/frames/make_packs.py from the artist\'s animation sheets. Do not edit by hand.\n')
    f.write('window.NovaFramePacks = ' + json.dumps(packs, indent=1) + ';\n')

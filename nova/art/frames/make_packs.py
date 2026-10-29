# Turns Nova's animation sheets (from the artist) into frame packs the app plays.
#   python3 make_packs.py        -> src/frames/<pack>/NN.png and src/frames/packs.js
# Each sheet is cut by sheets.py. Frames are sized so she's the same size on every sheet
# (her walk sets the size: 74 sprite units from halo to soles; SIZE corrects sheets the artist
# drew bigger or smaller) and placed by her hips (across) and the ground line (down).
# Frames face right; the app mirrors them when she faces left.
import json, os
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from sheets import cut_sheet
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', 'src', 'frames')
HEIGHT = 74              # her standing height in sprite units, as in cartoon.js
GROUND, CENTRE = 78, 24  # where her feet and hips go in the 48 x 80 sprite box

# how big each sheet draws her, compared with the walk sheet (bigger number = drawn bigger)
SIZE = {'walk': 1.0, 'run': 1.0, 'jump': 1.05, 'bored': 1.4, 'drag': 1.45, 'sleep': 1.6}
ERASE = {'drag': [[(20, 149), (480, 77), (480, 122), (20, 194)]]}   # its title badge touches a frame

# the packs: which sheet frames, in order. mirrored: frames drawn facing left.
#   fps or durations (ms per frame); loop (and loopFrom: frames before it play once, first);
#   stride: sprite units she travels per cycle, so her feet stay planted;
#   anchor: 'ground' (as drawn on the sheet's ground line) or 'feet' (her lowest point on the ground,
#   for frames whose height comes from the app, like being in the air)
PACKS = {
  'walk':      dict(sheet='walk', frames=range(8), mirrored=[4, 5, 6, 7], fps=7, loop=True, stride=76),
  'run':       dict(sheet='run', frames=range(6), fps=11, loop=True, stride=96),
  'jumpstart': dict(sheet='jump', frames=[0, 1], durations=[150, 90], loop=False),
  'jump':      dict(sheet='jump', frames=[2, 3], fps=4, loop=False, anchor='feet'),
  'land':      dict(sheet='jump', frames=[4, 5], durations=[140, 170], loop=False),
  'fall':      dict(sheet='jump', frames=[3], fps=1, loop=True, anchor='feet'),
  'dangle':    dict(sheet='drag', frames=range(4), durations=[500, 260, 260, 420], loop=True, align='grip'),
  'bored':     dict(sheet='bored', frames=range(6), durations=[1800, 600, 500, 700, 500, 1100], loop=True),
  'sleep':     dict(sheet='sleep', frames=range(6), durations=[900, 1200, 1200, 900, 1300, 1200], loop=True, loopFrom=1, align='box'),
}

def hips(a):
    """across: the middle of her black clothes, in the middle band of the frame"""
    h = a.shape[0]; band = a[int(h * 0.35):int(h * 0.7)]
    xs = np.where((band[..., :3].astype(int).sum(-1) < 150) & (band[..., 3] > 200))[1]
    return float(np.median(xs))
def grip(a):
    """the drag sheets' hand: the top of the drawing"""
    ys, xs = np.where(a[..., 3] > 128); top = ys.min()
    return float(np.median(xs[ys < top + 20])), float(top + 18)   # (a little into the fist)

def build(write=True):
    cuts = {}
    for name, p in PACKS.items():
        if p['sheet'] not in cuts: cuts[p['sheet']] = cut_sheet(os.path.join(HERE, p['sheet'] + '-sheet.png'), erase=ERASE.get(p['sheet'], ()))
    walk = cuts['walk']
    upx_walk = HEIGHT / max(f['ground'] for f in walk)             # sprite units per walk-sheet px
    packs = {}
    for name, p in PACKS.items():
        upx = upx_walk / SIZE[p['sheet']]
        src = cuts[p['sheet']]; meta = []
        os.makedirs(os.path.join(OUT, name), exist_ok=True)
        for i, fi in enumerate(p['frames']):
            f = src[fi]; a = f['rgba'][:, ::-1] if fi in p.get('mirrored', ()) else f['rgba']
            ys, xs = np.where(a[..., 3] > 0); y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
            ground = y1 if p.get('anchor') == 'feet' else f['ground']
            ax = {'box': (x0 + x1) / 2, 'grip': grip(a)[0]}.get(p.get('align'), None)
            if ax is None: ax = hips(a)
            if write:   # (64 colours: looks the same, about a ninth of the size)
                im = Image.fromarray(a[y0:y1, x0:x1], 'RGBA').quantize(colors=64, method=Image.FASTOCTREE, dither=Image.NONE)
                im.save(os.path.join(OUT, name, f'{i + 1:02d}.png'), optimize=True)
            meta.append({'src': f'frames/{name}/{i + 1:02d}.png', 'x': round(CENTRE - (ax - x0) * upx, 3), 'y': round(GROUND - (ground - y0) * upx, 3),
                         'w': round((x1 - x0) * upx, 3), 'h': round((y1 - y0) * upx, 3)})
        pk = {'loop': p['loop'], 'frames': meta}
        if 'durations' in p: pk['durations'] = p['durations']
        else: pk['fps'] = p['fps']
        if p.get('loopFrom'): pk['loopFrom'] = p['loopFrom']
        if p.get('stride'): pk['speed'] = round(p['stride'] * p['fps'] / len(meta), 2)
        if p.get('align') == 'grip':   # where her hand is, from her feet (sprite units), for holding her by it
            g = grip(src[p['frames'][0]]['rgba']); pk['grip'] = [0, round(-(src[p['frames'][0]]['ground'] - g[1]) * upx, 2)]
        packs[name] = pk
        print(f'{name:10s} {len(meta)} frames  tallest {max(m["h"] for m in meta):5.1f} units  widest {max(m["w"] for m in meta):5.1f}')
    if write:
        with open(os.path.join(OUT, 'packs.js'), 'w') as fh:
            fh.write('// Made by art/frames/make_packs.py from the artist\'s animation sheets. Do not edit by hand.\n')
            fh.write('window.NovaFramePacks = ' + json.dumps(packs, indent=1) + ';\n')
    return packs

if __name__ == '__main__':
    build()

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
SIZE = {'walk': 1.0, 'run': 1.0, 'jump': 1.05, 'bored': 1.4, 'drag': 1.45, 'sleep': 1.6,
        # standing sheets: sized so her body (halo to soles, not the marks around her) is as tall as in her walk
        'idle': 'stand', 'talk': 'stand', 'wave': 'stand', 'think': 'stand', 'point': 'stand', 'typing': 'stand',
        # sitting: as big as in her idle sheet, by the size of her crop top
        'sit': ('like', 'idle'),
        'shrug': 'stand', 'angry': 'stand', 'shy': 'stand', 'dance': 'stand', 'dizzy': ('like', 'idle'), 'cheer': ('like', 'idle')}
ERASE = {'drag': [[(20, 149), (480, 77), (480, 122), (20, 194)]]}   # its title badge touches a frame
# how to cut each sheet (see sheets.cut_sheet): the rows between header and captions, how she stands
CUT = {
  'idle':   dict(band=(205, 882), ground='feet', parts=False),            # (its arrows are the artist's notes)
  'talk':   dict(band=(200, 866), nrows=1, nframes=6, parts_above=0.55),
  'wave':   dict(band=(160, 916), nrows=1, parts_above=0.55),
  'think':  dict(band=(118, 946), ground='feet', parts_above=0.55),
  'point':  dict(band=(205, 941), nrows=1, parts_above=0.55),
  'typing': dict(band=(150, 916), ground='feet', parts_above=0.55),
  'sit':    dict(band=(250, 890), ground='feet', ledge=(590, 730), parts_above=0.55),
  # reactions: their titles, notes, number circles and loop arrows are left out with drop boxes
  'shrug': {'band': (270, 925), 'ground': 'feet', 'parts_above': 0.55, 'logo': (0, 0, 820, 275), 'drop': [(800, 20, 1110, 255), (1170, 40, 1448, 235), (48, 273, 116, 341), (401, 266, 469, 334), (761, 266, 829, 334), (1106, 266, 1174, 334)]},
  'angry': {'band': (195, 897), 'ground': 'feet', 'logo': (0, 0, 640, 235), 'drop': [(600, 40, 1448, 205)]},
  'cheer': {'band': (0, 908), 'ground': 'feet', 'parts_above': 0.5, 'logo': (0, 0, 645, 345), 'drop': [(1040, 0, 1448, 225), (205, 360, 295, 470)]},
  'dance': {'band': (0, 885), 'ground': 'feet', 'parts_above': 0.55, 'nframes': 8, 'logo': (0, 0, 1672, 218), 'drop': [(0, 222, 1672, 296)]},
  'dizzy': {'band': (235, 935), 'ground': 'feet', 'parts_above': 0.55, 'logo': (280, 0, 1180, 232), 'drop': [(48, 243, 116, 311), (463, 246, 531, 314), (823, 246, 891, 314), (1143, 246, 1211, 314)]},
  'shy': {'band': (205, 938), 'ground': 'feet', 'parts_above': 0.55, 'logo': (200, 0, 1250, 218), 'drop': [(35, 205, 106, 286), (383, 226, 451, 294), (738, 224, 806, 292), (1098, 226, 1166, 294)]},
}
SEAT = 46   # where the ledge she sits on is in the sprite box (the window's top edge)

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
  'idle':      dict(sheet='idle', frames=range(6), durations=[1300, 650, 110, 150, 550, 800], loop=True),
  'talk':      dict(sheet='talk', frames=range(6), fps=6, loop=True),
  'wave':      dict(sheet='wave', frames=range(4), fps=6, loop=True),
  'think':     dict(sheet='think', frames=range(4), durations=[700, 800, 800, 600], loop=True),
  'point':     dict(sheet='point', frames=range(3), durations=[160, 1100, 700], loop=True, loopFrom=1, tip=1),
  'work':      dict(sheet='typing', frames=range(4), fps=8, loop=True),
  'shrug':     dict(sheet='shrug', frames=range(4), durations=[600, 500, 700, 800], loop=True),
  'angry':     dict(sheet='angry', frames=range(4), durations=[500, 200, 450, 600], loop=True),
  'cheer':     dict(sheet='cheer', frames=range(4), durations=[180, 320, 320, 900], loop=False),
  'dance':     dict(sheet='dance', frames=range(8), fps=6, loop=True),
  'dizzy':     dict(sheet='dizzy', frames=range(4), fps=6, loop=True),
  'love':      dict(sheet='shy', frames=range(4), durations=[600, 600, 600, 800], loop=True),
  'sit':       dict(sheet='sit', frames=range(4), durations=[1500, 450, 650, 900], loop=True, anchor='seat'),
}

def hips(a):
    """across: the middle of her black clothes, in the middle band of the frame"""
    h = a.shape[0]; band = a[int(h * 0.35):int(h * 0.7)]
    xs = np.where((band[..., :3].astype(int).sum(-1) < 150) & (band[..., 3] > 200))[1]
    return float(np.median(xs))
def body_height(f):
    """halo to ground, for her body only (the biggest piece; marks like a '?' float apart)"""
    lab, n = ndi.label(f['rgba'][..., 3] > 0); sizes = ndi.sum(np.ones_like(lab), lab, range(1, n + 1))
    ys = ndi.find_objects(lab)[int(np.argmax(sizes))][0]
    return f['ground'] - ys.start
def top_width(a):
    """the width of her black crop top: the first big black shape from the top"""
    blk = ndi.binary_opening((a[..., :3].astype(int).sum(-1) < 150) & (a[..., 3] > 200), iterations=2)
    lab, n = ndi.label(blk); best = None
    for i, (ys, xs) in enumerate(ndi.find_objects(lab), 1):
        if (lab[ys, xs] == i).sum() > 0.004 * a.shape[0] * a.shape[1] and (best is None or ys.start < best[0]): best = (ys.start, xs.stop - xs.start)
    return best[1]
def grip(a):
    """the drag sheets' hand: the top of the drawing"""
    ys, xs = np.where(a[..., 3] > 128); top = ys.min()
    return float(np.median(xs[ys < top + 20])), float(top + 18)   # (a little into the fist)

def build(write=True):
    cuts = {}
    for name, p in PACKS.items():
        if p['sheet'] not in cuts: cuts[p['sheet']] = cut_sheet(os.path.join(HERE, p['sheet'] + '-sheet.png'), erase=ERASE.get(p['sheet'], ()), **CUT.get(p['sheet'], {}))
    walk = cuts['walk']
    upx_walk = HEIGHT / max(f['ground'] for f in walk)             # sprite units per walk-sheet px
    walk_h = max(f['ground'] for f in walk)
    for sh, v in list(SIZE.items()):
        if v == 'stand': SIZE[sh] = float(np.median([body_height(f) for f in cuts[sh]])) / walk_h
    for sh, v in list(SIZE.items()):
        if isinstance(v, tuple):
            ref = v[1]; ratio = np.median([top_width(f['rgba']) for f in cuts[sh]]) / np.median([top_width(f['rgba']) for f in cuts[ref]])
            SIZE[sh] = SIZE[ref] * float(ratio)
    print('sizes', {k: round(v, 2) for k, v in SIZE.items()})
    packs = {}
    for name, p in PACKS.items():
        upx = upx_walk / SIZE[p['sheet']]
        src = cuts[p['sheet']]; meta = []
        os.makedirs(os.path.join(OUT, name), exist_ok=True)
        for i, fi in enumerate(p['frames']):
            f = src[fi]; a = f['rgba'][:, ::-1] if fi in p.get('mirrored', ()) else f['rgba']
            ys, xs = np.where(a[..., 3] > 0); y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
            ground = {'feet': y1, 'seat': f.get('seat')}.get(p.get('anchor')) or f['ground']
            row = SEAT if p.get('anchor') == 'seat' else GROUND
            ax = {'box': (x0 + x1) / 2, 'grip': grip(a)[0]}.get(p.get('align'), None)
            if ax is None: ax = hips(a)
            if p.get('tip') == i:   # her fingertip (the rightmost point), for the app's pointing arrow
                ty, tx = np.where(a[..., 3] > 128); k = tx.argmax()
                tip = [round(CENTRE + (tx[k] - ax) * upx, 2), round(row - (ground - ty[k]) * upx, 2)]
            if write:   # (64 colours: looks the same, about a ninth of the size)
                im = Image.fromarray(a[y0:y1, x0:x1], 'RGBA').quantize(colors=64, method=Image.FASTOCTREE, dither=Image.NONE)
                im.save(os.path.join(OUT, name, f'{i + 1:02d}.png'), optimize=True)
            meta.append({'src': f'frames/{name}/{i + 1:02d}.png', 'x': round(CENTRE - (ax - x0) * upx, 3), 'y': round(row - (ground - y0) * upx, 3),
                         'w': round((x1 - x0) * upx, 3), 'h': round((y1 - y0) * upx, 3)})
        pk = {'loop': p['loop'], 'frames': meta}
        if 'durations' in p: pk['durations'] = p['durations']
        else: pk['fps'] = p['fps']
        if p.get('loopFrom'): pk['loopFrom'] = p['loopFrom']
        if p.get('tip') is not None: pk['tip'] = tip
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

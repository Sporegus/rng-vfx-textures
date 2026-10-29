# The layers the neutral drawing doesn't show: mouth shapes, expression eyes and brows,
# blush, shadows, ears, alternate hands (traced from the sheet's hand panel) and effects
# (traced from the sheet's extras panel). All on the same 3000x4000 canvas, in her colours.
import numpy as np, math, json
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
FILL = (0xbf, 0xe6, 0xff); INK = (5, 7, 15); INSIDE = (24, 30, 64); TONGUE = (112, 160, 226); SHADE = (150, 200, 238); PINK = (255, 135, 175)
ox, oy, w, h, X0, Y0, S = np.load('work/meta.npy'); CW, CH = 3000, 4000
T = lambda p: ((p[0] - X0) * S + ox, (p[1] - Y0) * S + oy)
SS = 4
def catmull(pts, n=12):
    if len(pts) < 3: return pts
    P = [pts[0]] + list(pts) + [pts[-1]]; out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1:i + 3]
        for j in range(n):
            t = j / n; t2, t3 = t * t, t * t * t
            out.append(tuple(0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3) for k in (0, 1)))
    out.append(pts[-1]); return out
class Pen:
    """draws in sheet px, 4x supersampled, into one full-canvas layer"""
    def __init__(self, box):   # box in sheet px
        a, b = T(box[:2]); c, d = T(box[2:])
        self.x0, self.y0 = int(a) - 4, int(b) - 4; self.x1, self.y1 = int(c) + 4, int(d) + 4
        self.im = Image.new('RGBA', ((self.x1 - self.x0) * SS, (self.y1 - self.y0) * SS), (0, 0, 0, 0))
    def P(self, p): x, y = T(p); return ((x - self.x0) * SS, (y - self.y0) * SS)
    def _paint(self, mask, col, alpha=255):
        layer = Image.new('RGBA', self.im.size, col + (0,)); layer.putalpha(mask.point(lambda v: v * alpha // 255)); self.im.alpha_composite(layer)
    def fill(self, pts, col, alpha=255, clip=None):
        m = Image.new('L', self.im.size, 0); ImageDraw.Draw(m).polygon([self.P(p) for p in pts], fill=255)
        if clip is not None: m = Image.fromarray(np.minimum(np.asarray(m), np.asarray(clip)))
        self._paint(m, col, alpha); return m
    def stroke(self, pts, width, col=INK, taper=True, smooth=True, alpha=255):
        pts = catmull(pts) if smooth else pts
        m = Image.new('L', self.im.size, 0); d = ImageDraw.Draw(m)
        # sample densely, draw discs whose size follows a taper
        dense = []
        for (xa, ya), (xb, yb) in zip(pts, pts[1:]):
            n = max(1, int(math.hypot(xb - xa, yb - ya) * 3))
            dense += [(xa + (xb - xa) * i / n, ya + (yb - ya) * i / n) for i in range(n)]
        dense.append(pts[-1]); N = len(dense)
        for i, p in enumerate(dense):
            t = i / max(N - 1, 1); k = (math.sin(math.pi * t) ** 0.6) * 0.8 + 0.2 if taper else 1
            r = width / 2 * k * S * SS; x, y = self.P(p); d.ellipse((x - r, y - r, x + r, y + r), fill=255)
        self._paint(m, col, alpha); return m
    def outline(self, pts, width, col=INK):
        return self.stroke(list(pts) + [pts[0], pts[1]], width, col, taper=False, smooth=False)
    def layer(self):
        small = self.im.resize((self.x1 - self.x0, self.y1 - self.y0), Image.LANCZOS)
        full = Image.new('RGBA', (CW, CH), (0, 0, 0, 0)); full.paste(small, (self.x0, self.y0)); return full
OUT = {}
def bleed(img):
    """soft edge pixels take the colour of the nearest solid pixel (no pale fringe)"""
    a = np.asarray(img).copy(); al = a[..., 3]
    white = (a[..., :3] > 250).all(-1)          # (resampling overshoot; not a colour she has)
    solid = (al >= 250) & ~white
    if solid.any() and (al > 0).any():
        ys, xs = np.where(al > 0); y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        sub = a[y0:y1, x0:x1]; sol = solid[y0:y1, x0:x1]
        _, (iy, ix) = ndi.distance_transform_edt(~sol, return_indices=True)
        edge = (sub[..., 3] > 0) & ~sol
        sub[edge, :3] = sub[iy[edge], ix[edge], :3]
    return Image.fromarray(a, 'RGBA')
def save(name, img): img = bleed(img); img.save(f'work/layers/{name}.png'); OUT[name] = img

# ---------- mouths (her mouth sits at 152.5, 256.5 on the sheet) ----------
MX, MY = 152.5, 256.5
M = lambda pts: [(MX + x, MY + y) for x, y in pts]
BOX = (MX - 9, MY - 6, MX + 9, MY + 10)
def ellipse(cx, cy, rx, ry, n=40): return [(cx + rx * math.cos(2 * math.pi * i / n), cy + ry * math.sin(2 * math.pi * i / n)) for i in range(n)]
def dshape(left, right, depth, sag=0.4, n=30):
    """open-mouth shape: a gently curved top edge between the corners and a round bottom"""
    (lx, ly), (rx, ry) = left, right; cx = (lx + rx) / 2
    top = [(lx + (rx - lx) * i / n, ly + (ry - ly) * i / n + sag * math.sin(math.pi * i / n)) for i in range(n + 1)]
    bot = [(cx + (rx - lx) / 2 * math.cos(math.pi * i / n), (ly + ry) / 2 + depth * math.sin(math.pi * i / n)) for i in range(1, n)]
    return top + bot
def open_mouth(name, shape, tongue=None, teeth=None, lw=1.25):
    p = Pen(BOX); m = p.fill(M(shape), INSIDE)
    if teeth: p.fill(M(teeth), FILL, clip=m)
    if tongue: p.fill(M(tongue), TONGUE, clip=m)
    p.outline(M(shape), lw); save(name, p.layer())
def line_mouth(name, pts, lw=1.25, extra=()):
    p = Pen(BOX); p.stroke(M(pts), lw)
    for e in extra: p.stroke(M(e), lw * 0.75)
    save(name, p.layer())
line_mouth('Mouth_Neutral', [(-4.2, 0.8), (-1.5, 1.5), (1.5, 0.8), (3.8, -1.6)])
line_mouth('Mouth_Smile', [(-5, -0.8), (-2.6, 1.4), (0, 2.0), (2.6, 1.3), (5, -0.9)])
line_mouth('Mouth_Frown', [(-4.5, 2.0), (-2, 0.3), (0, -0.2), (2, 0.3), (4.5, 2.0)])
line_mouth('Mouth_Smirk', [(-3.8, 1.2), (-1, 1.6), (2, 0.6), (3.8, -1.2)], extra=[[(3.1, -2.3), (4.7, -0.5)]])
line_mouth('Mouth_Pout', [(-2.4, 0.7), (-1.2, -0.3), (0, 0.6), (1.2, -0.3), (2.4, 0.7)], lw=1.1)
open_mouth('Mouth_Open_Small', ellipse(0, 1.6, 2.6, 1.7))
open_mouth('Mouth_Open_Medium', dshape((-4, -0.2), (4, -0.6), 4.6), tongue=ellipse(0.6, 4.4, 2.6, 1.6))
open_mouth('Mouth_Open_Large', dshape((-5.2, -0.6), (5.2, -1.0), 6.8), tongue=ellipse(0.8, 6.2, 3.6, 2.2), teeth=[(-5, -2), (5, -2), (5, 0.4), (-5, 0.8)])
open_mouth('Mouth_Talking_A', dshape((-3.6, 0), (3.6, -0.3), 6.0, sag=0.2), tongue=ellipse(0.5, 5.5, 2.4, 1.6))
open_mouth('Mouth_Talking_I', dshape((-5, 0.2), (5, 0), 2.6, sag=0.1), teeth=[(-5, -1), (5, -1), (5, 1.2), (-5, 1.4)])
open_mouth('Mouth_Talking_U', ellipse(0, 1.8, 1.8, 2.2))
open_mouth('Mouth_Talking_E', dshape((-4.6, 0), (4.6, -0.3), 3.8, sag=0.2), teeth=[(-5, -1), (5, -1), (5, 1.3), (-5, 1.5)], tongue=ellipse(0.5, 3.6, 2.4, 1.0))
open_mouth('Mouth_Talking_O', ellipse(0, 2.6, 3.0, 3.4), tongue=ellipse(0.3, 4.6, 2.0, 1.2))
open_mouth('Mouth_Laugh', dshape((-5.8, -1.6), (5.8, -2.0), 7.2, sag=1.2), tongue=ellipse(0.8, 6.4, 4.0, 2.4))
p = Pen(BOX); p.fill(M(dshape((-5.2, -0.6), (5.2, -1.0), 6.8)), INSIDE); save('Mouth_Interior', p.layer())
p = Pen(BOX); p.fill(M([(-5, -1.2), (5, -1.6), (5, 0.4), (-5, 0.8)]), FILL); save('Mouth_Teeth', p.layer())
p = Pen(BOX); p.fill(M(ellipse(0.8, 5.6, 3.6, 2.0)), TONGUE); save('Mouth_Tongue', p.layer())
p = Pen((139, 246, 147, 254)); p.stroke([(142.4, 249.2), (143.9, 250.7)], 1.0, taper=False); save('Nose', p.layer())

# ---------- expression eyes and brows ----------
def strokes(name, box, items):
    p = Pen(box)
    for pts, lw in items: p.stroke(pts, lw)
    save(name, p.layer())
strokes('Eye_Closed_Left', (148, 215, 208, 242), [([(154, 231), (165, 236), (178, 237.5), (190, 232.5), (197, 225)], 2.7), ([(194, 227), (203.5, 221)], 1.3)])
strokes('Eye_Closed_Right', (96, 238, 141, 257), [([(103.5, 246.5), (112, 250.5), (122, 252.5), (131, 250.5), (137.5, 246)], 2.3), ([(106, 248), (98.5, 244.5)], 1.2)])
strokes('Eye_Happy_Left', (148, 215, 205, 242), [([(155, 235), (164, 226), (176, 222), (188, 225), (196.5, 232)], 2.7)])
strokes('Eye_Happy_Right', (98, 236, 141, 256), [([(105.5, 251), (113.5, 244.5), (123, 242.5), (131, 244.5), (137.5, 249.5)], 2.3)])
strokes('Eyebrow_Left_Angry', (144, 194, 172, 224), [([(149, 219), (157.5, 210.5), (166.5, 201)], 2.0)])
strokes('Eyebrow_Left_Sad', (144, 194, 172, 224), [([(150, 205.5), (158, 205), (167, 208)], 1.8)])
strokes('Eyebrow_Left_Raised', (144, 188, 172, 218), [([(151, 208.5), (157, 201.5), (164.5, 194.5)], 1.8)])
strokes('Eyebrow_Right_Angry', (104, 216, 128, 234), [([(109.5, 221.5), (116, 224), (122.5, 228.5)], 2.0)])
strokes('Eyebrow_Right_Sad', (104, 216, 128, 234), [([(109.5, 228.5), (116, 226.5), (122.5, 222.5)], 1.8)])
strokes('Eyebrow_Right_Raised', (104, 212, 128, 230), [([(109.5, 220.5), (115, 219.6), (121, 220.5)], 1.8)])
for side, (cx, cy, rx, ry) in (('Left', (174.5, 227, 4.2, 5.2)), ('Right', (129.2, 248.6, 3.0, 3.6))):
    p = Pen((cx - 8, cy - 8, cx + 8, cy + 8)); p.fill(ellipse(cx, cy, rx, ry), FILL); p.outline(ellipse(cx, cy, rx, ry), 0.9); p.fill(ellipse(cx, cy, rx * 0.36, ry * 0.36), INK)
    save('Pupil_Small_' + side, p.layer())

# ---------- blush, shadows, ears, halo shading ----------
for side, (cx, cy) in (('Left', (186, 247.5)), ('Right', (118, 260))):
    p = Pen((cx - 12, cy - 8, cx + 12, cy + 8)); p.fill(ellipse(cx, cy, 7, 3.6), PINK, alpha=150)
    for i in (-3.5, 0, 3.5): p.stroke([(cx + i - 1.2, cy + 1.8), (cx + i + 1.2, cy - 1.8)], 0.9, taper=False)
    save('Blush_' + side, p.layer())
lay = lambda k: np.asarray(Image.open(f'work/layers/{k}.png'))
def shadow(name, under, casters, shift):
    base = lay(under)[..., 3] > 0; cast = np.zeros_like(base)
    for c in casters: cast |= lay(c)[..., 3] > 0
    sh = np.roll(cast, shift, axis=0) & base & ~cast
    sh = ndi.binary_opening(sh, iterations=2)
    out = np.zeros((CH, CW, 4), np.uint8); out[sh] = SHADE + (255,); save(name, Image.fromarray(out, 'RGBA'))
shadow('Face_Shadow', 'Face_Base', ['Hair_Bangs_Center', 'Hair_Bangs_Left', 'Hair_Side_Left_Upper', 'Hair_Side_Right_Upper'], 40)
shadow('Neck_Shadow', 'Neck', ['Face_Base'], 45)
for side, (cx, cy) in (('Right', (104, 240)), ('Left', (195.5, 233))):
    p = Pen((cx - 8, cy - 13, cx + 8, cy + 13)); e = ellipse(cx, cy, 4.6, 9.5); p.fill(e, FILL); p.outline(e, 1.4)
    p.stroke([(cx, cy - 4), (cx + (1.5 if side == 'Right' else -1.5), cy + 1), (cx, cy + 5)], 0.9)
    save('Ear_' + side, p.layer())
halo = lay('Halo_Base'); hm = (halo[..., 3] > 0) & (halo[..., 0] > 100)
ys, xs = np.where(hm); cy = (ys.min() + ys.max()) / 2
out = np.zeros((CH, CW, 4), np.uint8); out[hm & (np.arange(CH)[:, None] > cy)] = SHADE + (255,); save('Halo_Inner_Shading', Image.fromarray(out, 'RGBA'))

# ---------- traced from the sheet: hands and effects ----------
sheet = Image.open('sheet.png').convert('L')
def trace(box, k=4.0):
    """a sheet drawing -> (fill mask, ink alpha), enlarged k times, with the checker background removed"""
    c = np.asarray(sheet.crop(box)).astype(np.float32)
    c = ndi.gaussian_filter(c, 0.5)
    big = np.asarray(Image.fromarray(c).resize((int(c.shape[1] * k), int(c.shape[0] * k)), Image.BICUBIC)).astype(np.float32)
    a = np.clip((135 - big) / 20, 0, 1); lines = a > 0.5
    sealed = ndi.binary_dilation(lines, iterations=int(2 * k))
    lab, _ = ndi.label(~sealed); border = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    bg = np.isin(lab, border[border > 0]); bg = ndi.binary_dilation(bg, iterations=int(2 * k) + 3, mask=~lines)
    sil = ndi.binary_fill_holes(~bg)
    # drop specks (checkerboard noise): keep pieces of a real size
    comp, n = ndi.label(sil | lines); sizes = ndi.sum(np.ones_like(comp), comp, range(1, n + 1))
    keep = np.isin(comp, 1 + np.where(sizes > 40 * k * k)[0])
    return sil & keep, a * keep
def place(fillm, inka, k, anchor_src, anchor_dst, angle=0, mirror=False, scale=1.0):
    """put a traced drawing on the canvas: anchor_src (crop px at 1x) lands on anchor_dst (sheet px)"""
    rgba = np.zeros(fillm.shape + (4,), np.float32)
    rgba[fillm, :3] = FILL; rgba[fillm, 3] = 1
    a = inka[..., None]; rgba[..., :3] = rgba[..., :3] * (1 - a) + np.array(INK) * a; rgba[..., 3] = np.maximum(rgba[..., 3], inka)
    rgba[..., :3] *= rgba[..., 3:4]                  # premultiply for clean resampling
    im = Image.fromarray(np.round(rgba * [1, 1, 1, 255]).astype(np.uint8), 'RGBA')
    # canvas px per crop px (crop was enlarged k times; one sheet px is S canvas px)
    g = S * scale / k
    ax, ay = anchor_src[0] * k, anchor_src[1] * k; dx, dy = T(anchor_dst)
    t = math.radians(angle); c, s = math.cos(t) * g, math.sin(t) * g; m = -1 if mirror else 1
    # forward: canvas = R * diag(m,1) * (p - a) + d   -> inverse for PIL
    A = np.array([[c * m, -s, dx - (c * m * ax - s * ay)], [s * m, c, dy - (s * m * ax + c * ay)], [0, 0, 1]])
    Ai = np.linalg.inv(A)
    out = im.transform((CW, CH), Image.AFFINE, tuple(Ai[:2].ravel()), resample=Image.BICUBIC)
    arr = np.asarray(out).astype(np.float32); al = arr[..., 3:4] / 255
    arr[..., :3] = np.where(al > 0, arr[..., :3] / np.maximum(al, 1e-6), 0)
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGBA')
# hands: box on the sheet, wrist point and finger direction (in the crop), as drawn
HANDS = {'Open': ((497, 762, 548, 850), (25, 81), (0, -1)), 'Fist': ((546, 772, 584, 848), (19, 6), (0, 1)),
         'Point': ((586, 766, 628, 850), (18, 6), (0, 1)), 'Peace': ((678, 766, 720, 852), (19, 82), (0, -1)),
         'Relaxed_Sheet': ((722, 768, 765, 852), (30, 5), (0, 1))}
# her wrists in the neutral pose (sheet px) and which way her fingers point
WRIST = {'R': ((66, 436), (-24, 58)), 'L': ((240, 436), (24, 55))}   # (wrist a little up inside the sleeve)
K = 4.0
hand_len = {}
for nm, (box, wpt, wdir) in HANDS.items():
    fm, ia = trace(box, K)
    ys, xs = np.where(fm | (ia > 0.5)); far = max(math.hypot(x / K - wpt[0], y / K - wpt[1]) for x, y in zip(xs[::50], ys[::50]))
    hand_len[nm] = far
    for side, (dst, fdir) in WRIST.items():
        mirror = side == 'L'
        src_ang = math.degrees(math.atan2(wdir[1], -wdir[0] if mirror else wdir[0]))
        dst_ang = math.degrees(math.atan2(fdir[1], fdir[0]))
        sc = 66.0 / far                                   # her neutral hand, wrist (inside the sleeve) to fingertip, is about 66 sheet px
        extra = 22 if nm == 'Open' else 0
        img = place(fm, ia, K, wpt, dst, angle=dst_ang - src_ang, mirror=mirror, scale=sc)
        name = {'Relaxed_Sheet': 'Hand_%s_Relaxed_Alt' % side}.get(nm, f'Hand_{side}_{nm}')
        save(name, img)
        if nm == 'Open':   # a wave is her open hand, tilted outward
            save(f'Hand_{side}_Wave', place(fm, ia, K, wpt, dst, angle=dst_ang - src_ang + (25 if side == 'L' else -25), mirror=mirror, scale=sc))
print('hand lengths on the sheet', {k: round(v) for k, v in hand_len.items()})
# effects: box on the sheet -> where it goes around her (sheet px, centre) and size
FX = {'Effect_Sparkles': ((1027, 711, 1071, 763), (252, 150), 1.0), 'Effect_Hearts': ((1092, 714, 1138, 759), (255, 205), 0.9),
      'Effect_Angry_Mark': ((1159, 717, 1191, 753), (228, 140), 0.8), 'Effect_Sweat_Drop': ((1221, 711, 1248, 756), (222, 222), 0.8),
      'Effect_Speech_Bubble': ((1022, 812, 1075, 857), (262, 110), 1.2), 'Effect_Music_Notes': ((1087, 812, 1112, 852), (245, 175), 0.8),
      'Effect_Sleep_Z': ((1120, 812, 1165, 850), (238, 122), 1.0), 'Effect_Question_Mark': ((1178, 812, 1197, 852), (236, 128), 0.9),
      'Effect_Exclamation_Mark': ((1220, 812, 1236, 852), (236, 128), 0.9)}
# the sheet's sweat drop has a broken outline, so it is drawn clean instead
del FX['Effect_Sweat_Drop']
p = Pen((212, 208, 232, 238)); drop = [(222 + 5.2 * math.sin(t) * (1 - math.cos(t)) / 2 * 2, 233 - 11 * (1 + math.cos(t)) / 2) for t in np.linspace(0, 2 * math.pi, 60)]
p.fill(drop, (170, 215, 250)); p.outline(drop, 1.3); p.stroke([(219.5, 228), (219.8, 231)], 1.0, col=FILL, taper=False); save('Effect_Sweat_Drop', p.layer())
for nm, (box, ctr, sc) in FX.items():
    fm, ia = trace(box, K)
    cx, cy = (box[2] - box[0]) / 2, (box[3] - box[1]) / 2
    save(nm, place(fm, ia, K, (cx, cy), ctr, scale=sc))
json.dump(sorted(OUT), open('work/newart.json', 'w'))
print(len(OUT), 'new layers')

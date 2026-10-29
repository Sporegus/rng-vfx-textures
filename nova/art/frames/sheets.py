# Cuts the frames off one of Nova's animation sheets: finds each frame's ground line, takes the
# drawing above it, removes the background colour, the logo and the frame labels, and cleans the
# edges into a black outline. Frames come back in reading order with their ground line.
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
INK = np.array([5, 7, 15], np.float32)

def ground_rows(dark, skip_x=500):
    """the y of each row of frames' ground lines: rows of the sheet that are mostly dark line
    (looked for right of the logo, whose black title badge is long too)"""
    H, W = dark.shape; d = dark[:, skip_x:]; ys = [y for y in range(H) if d[y].sum() > (W - skip_x) * 0.25]; rows = []
    for y in ys:
        if rows and y - rows[-1][-1] <= 6: rows[-1].append(y)
        else: rows.append([y])
    out = []
    for r in rows:                      # (the labels just under a ground line can look like one too)
        if not out or min(r) - out[-1] > 120: out.append(min(r))
    return out

def remove_ledge(A, bg, rows):
    """paint out a drawn ledge she sits on (rows = (top, bottom) of the ledge and its posts): its
    fill lies wholly inside those rows, unlike hers, and its lines then have none of her fill nearby"""
    y0, y1 = rows
    light = (A.sum(-1) > 450) & (np.sqrt(((A - bg) ** 2).sum(-1)) > 60)
    lab, n = ndi.label(light); objs = ndi.find_objects(lab)
    ledge = np.zeros(light.shape, bool)
    for i, (ys, xs) in enumerate(objs):
        if ys.start >= y0 - 2 and ys.stop <= y1 + 2: ledge[ys, xs] |= lab[ys, xs] == i + 1
    A[ledge] = bg
    hers = light & ~ledge
    band = np.zeros(light.shape, bool); band[y0 - 2:y1 + 2] = True
    lonely = band & (A.sum(-1) < 300) & ~ndi.binary_dilation(hers, iterations=5)
    A[ndi.binary_dilation(lonely, iterations=1) & band] = bg

def cut_sheet(path, logo=(0, 0, 530, 220), erase=(), band=None, ground='line', parts=True, ledge=None, nrows=None, nframes=None, parts_above=None, drop=(), keep=(), whiteout=()):
    """erase: polygons (sheet px) painted over with the background first, for a title touching a frame.
    band: (top, bottom) rows holding the frames (between the header and the captions).
    ground: 'line' (a drawn ground line under each frame) or 'feet' (none: her lowest point is the ground).
    parts: keep small separate bits (motion lines, sparkles) with the nearest frame.
    ledge: rows of a drawn ledge to remove (she sits on it); each frame's 'seat' is its top.
    drop: more boxes (x0, y0, x1, y1) whose contents are left out: titles, notes, number circles
    whiteout: boxes where only white pixels are painted out (a white guide line running through her)
    keep: boxes whose contents are never dropped (something of hers inside a drop box)
    parts_above: only keep small bits higher than this share of the frame (the artist's notes sit low)
    nframes: frames per row; frames drawn touching are split where they're thinnest
    nrows: how many rows of frames (the lowest lines found; a row of black clothes can look like one too)"""
    im = Image.open(path).convert('RGB'); A = np.asarray(im).astype(np.float32).copy(); H, W = A.shape[:2]
    bg = np.median(A[H // 2 - 200:H // 2 + 200, :6].reshape(-1, 3), axis=0)
    if erase:
        from PIL import ImageDraw
        m = Image.new('1', (W, H)); [ImageDraw.Draw(m).polygon(p, fill=1) for p in erase]
        A[ndi.binary_dilation(np.asarray(m), iterations=4)] = bg   # (a little past the edge, so no outline is left)
    for x0, y0, x1, y1 in whiteout:
        sub = A[y0:y1, x0:x1]; white = (sub.min(-1) > 200) & (np.ptp(sub, axis=-1) < 40)
        sub[ndi.binary_dilation(white, iterations=2) & (sub.sum(-1) > 450)] = bg
    if ledge: remove_ledge(A, bg, ledge)
    top0, bottom = band or (0, H)
    dist = np.sqrt(((A - bg) ** 2).sum(-1)); dark = A.sum(-1) < 150
    if ground == 'line':
        d = dark.copy(); d[:top0] = False; d[bottom:] = False
        rows = ground_rows(d)
        if nrows: rows = rows[-nrows:]
    else:
        rows = [bottom + 3]
    frames = []
    for r, gy in enumerate(rows):
        top = rows[r - 1] + 8 if r else top0
        bandm = np.zeros((H, W), bool); bandm[top:gy - 3] = True
        fg = (dist > 60) & bandm
        lab, n = ndi.label(fg); objs = ndi.find_objects(lab); sizes = ndi.sum(np.ones_like(lab), lab, range(1, n + 1))
        ok = []
        for i, (ys, xs) in enumerate(objs):
            if sizes[i] < 30: continue
            if xs.stop <= logo[2] and ys.stop <= logo[3]: continue                  # the NOVA logo and title badge
            inside = lambda bs: any(xs.start >= b[0] and ys.start >= b[1] and xs.stop <= b[2] and ys.stop <= b[3] for b in bs)
            if inside(drop) and not inside(keep): continue
            if r and ys.stop <= top + 45: continue                                   # labels under the row above
            ok.append(i)
        big = max(sizes[i] for i in ok)
        bodies = [i for i in ok if sizes[i] >= 0.15 * big]
        bodies.sort(key=lambda i: objs[i][1].start)
        parts_of = {b: [b] for b in bodies}
        for i in ok:
            if i in parts_of or not parts: continue
            ys, xs = objs[i]
            def gap(b):
                by, bx = objs[b]
                dx = max(bx.start - xs.stop, xs.start - bx.stop, 0); dy = max(by.start - ys.stop, ys.start - by.stop, 0)
                return max(dx, dy)
            b = min(bodies, key=gap)
            if parts_above is not None:
                by = objs[b][0]
                if (ys.start + ys.stop) / 2 > by.start + parts_above * (by.stop - by.start): continue
            if gap(b) < 90: parts_of[b].append(i)
        feet = max(objs[b][0].stop for b in bodies) if ground == 'feet' else gy
        masks = [ndi.binary_fill_holes(np.isin(lab, [i + 1 for i in parts_of[b]])) for b in bodies]
        while nframes and len(masks) < nframes:
            wid = lambda m: np.ptp(np.where(m.any(0))[0])
            k = max(range(len(masks)), key=lambda j: wid(masks[j])); m = masks[k]
            xs = np.where(m.any(0))[0]; a0, a1 = xs.min() + int(0.3 * np.ptp(xs)), xs.min() + int(0.7 * np.ptp(xs))
            cut = a0 + int(np.argmin(m[:, a0:a1].sum(0)))
            left, right = m.copy(), m.copy(); left[:, cut:] = False; right[:, :cut] = False
            masks[k:k + 1] = [left, right]
        for keep in masks:
            f = clean(A, dist, keep, gy, feet)
            if ledge: f['seat'] = ledge[0] + 6 - f['top']   # (the ledge's top surface)
            frames.append(f)
    return frames

def clean(A, dist, keep, gy, ground_y):
    ys, xs = np.where(keep); H, W = keep.shape
    y0, y1, cx0, cx1 = ys.min(), min(gy - 3, ys.max() + 3), max(xs.min() - 6, 0), min(xs.max() + 7, W)
    d = dist[y0:y1, cx0:cx1]; rgb = A[y0:y1, cx0:cx1].copy(); k = keep[y0:y1, cx0:cx1]
    alpha = np.clip((d - 25) / 50, 0, 1) * ndi.binary_dilation(k, iterations=2)
    # (holes she encloses that show the background, like the middle of a thin halo, stay see-through)
    # the sheets draw a thin light rim outside her black outline: take it off where a line is just inside
    darkpx = (rgb.sum(-1) < 200) & (alpha > 0.5)
    rim = (rgb.sum(-1) > 450) & ndi.binary_dilation(alpha < 0.5, iterations=2) & ndi.binary_dilation(darkpx, iterations=3)
    alpha[rim] = 0
    # her outline is the outermost thing: soft edges and background colour near the edge become line
    near = ~ndi.binary_erosion(alpha > 0.98, iterations=3)
    pinkish = (rgb[..., 0] - rgb[..., 2] > 15) & (rgb[..., 0] - rgb[..., 1] > 30)
    rgb[(alpha > 0) & (alpha <= 0.98)] = INK
    rgb[near & pinkish & (alpha > 0)] = INK
    rgb[(d < 60) & (alpha > 0)] = INK   # (specks of background left inside her, like in a halo's hole)
    # and a clean black outline all the way round
    body = np.pad(alpha > 0.5, 4); rgb = np.pad(rgb, ((4, 4), (4, 4), (0, 0))); alpha = np.pad(alpha, 4)
    dout = ndi.distance_transform_edt(~body)
    rgb[(dout > 0) & (dout <= 2.6)] = INK
    alpha = np.maximum(alpha, np.clip(2.6 - dout + 0.5, 0, 1) * (dout > 0))
    return dict(rgba=np.dstack([rgb, alpha * 255]).astype(np.uint8), ground=(ground_y - y0) + 4, top=y0 - 4, left=cx0 - 4)

def halo_width(f):
    """width of her halo (a flat ring near the top): used to keep her the same size on every sheet"""
    a = f['rgba']; light = (a[..., 3] > 200) & (a[..., :3].astype(int).sum(-1) > 450)
    h = a.shape[0]; lab, n = ndi.label(light[:int(h * 0.45)])
    best = 0
    for i, s in enumerate(ndi.find_objects(lab), 1):
        w, hh = s[1].stop - s[1].start, s[0].stop - s[0].start
        sub = lab[s] == i
        if w > 2.2 * hh and w > 25 and sub.mean() < 0.55: best = max(best, w)    # wide, flat, mostly hollow
    return best or None

def cut_region(path, boxes, ground_y, keep=()):
    """everything drawn wholly inside the boxes (sheet px), cleaned like a frame: for an effect drawn
    on its own on the sheet (a burst) that's laid over a frame"""
    A = np.asarray(Image.open(path).convert('RGB')).astype(np.float32); H, W = A.shape[:2]
    bg = np.median(A[H // 2 - 200:H // 2 + 200, :6].reshape(-1, 3), axis=0)
    dist = np.sqrt(((A - bg) ** 2).sum(-1))
    lab, n = ndi.label(dist > 60); objs = ndi.find_objects(lab); mask = np.zeros((H, W), bool)
    for i, (ys, xs) in enumerate(objs):
        if (lab[ys, xs] == i + 1).sum() < 8: continue
        inside = lambda bs: any(xs.start >= b[0] and ys.start >= b[1] and xs.stop <= b[2] and ys.stop <= b[3] for b in bs)
        if inside(boxes) and not inside(keep): mask[ys, xs] |= lab[ys, xs] == i + 1
    return clean(A, dist, ndi.binary_fill_holes(mask), H + 3, ground_y)

def compose(base, extra):
    """lay extra over base, both placed where they are on the sheet"""
    L = min(base['left'], extra['left']); T = min(base['top'], extra['top'])
    R = max(base['left'] + base['rgba'].shape[1], extra['left'] + extra['rgba'].shape[1])
    B = max(base['top'] + base['rgba'].shape[0], extra['top'] + extra['rgba'].shape[0])
    im = Image.new('RGBA', (R - L, B - T), (0, 0, 0, 0))
    for f in (base, extra): im.alpha_composite(Image.fromarray(f['rgba']), (f['left'] - L, f['top'] - T))
    return dict(rgba=np.asarray(im), ground=base['top'] + base['ground'] - T, top=T, left=L)

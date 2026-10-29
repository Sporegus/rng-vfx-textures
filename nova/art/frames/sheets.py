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

def cut_sheet(path, logo=(0, 0, 530, 205), erase=()):
    """erase: polygons (sheet px) painted over with the background first, for a title touching a frame"""
    im = Image.open(path).convert('RGB'); A = np.asarray(im).astype(np.float32); H, W = A.shape[:2]
    bg = np.median(A[:, W // 2 - 50:W // 2 + 50][:8].reshape(-1, 3), axis=0)
    if erase:
        from PIL import ImageDraw
        m = Image.new('1', (W, H)); [ImageDraw.Draw(m).polygon(p, fill=1) for p in erase]
        A[np.asarray(m)] = bg
    dist = np.sqrt(((A - bg) ** 2).sum(-1)); dark = A.sum(-1) < 150
    rows = ground_rows(dark); frames = []
    for r, gy in enumerate(rows):
        top = rows[r - 1] + 8 if r else 0
        band = np.zeros((H, W), bool); band[top:gy - 3] = True
        fg = (dist > 60) & band
        lab, n = ndi.label(fg); objs = ndi.find_objects(lab); sizes = ndi.sum(np.ones_like(lab), lab, range(1, n + 1))
        ok = []
        for i, (ys, xs) in enumerate(objs):
            if sizes[i] < 30: continue
            if xs.stop <= logo[2] and ys.stop <= logo[3]: continue                  # the NOVA logo and title badge
            if r and ys.stop <= top + 45: continue                                   # labels under the row above
            ok.append(i)
        big = max(sizes[i] for i in ok)
        bodies = [i for i in ok if sizes[i] >= 0.15 * big]
        bodies.sort(key=lambda i: objs[i][1].start)
        parts = {b: [b] for b in bodies}
        for i in ok:
            if i in parts: continue
            ys, xs = objs[i]
            def gap(b):
                by, bx = objs[b]
                dx = max(bx.start - xs.stop, xs.start - bx.stop, 0); dy = max(by.start - ys.stop, ys.start - by.stop, 0)
                return max(dx, dy)
            b = min(bodies, key=gap)
            if gap(b) < 90: parts[b].append(i)
        for b in bodies:
            keep = np.isin(lab, [i + 1 for i in parts[b]])
            keep = ndi.binary_fill_holes(keep)
            frames.append(clean(A, dist, keep, gy))
    return frames

def clean(A, dist, keep, gy):
    ys, xs = np.where(keep); H, W = keep.shape
    y0, y1, cx0, cx1 = ys.min(), gy - 3, max(xs.min() - 6, 0), min(xs.max() + 7, W)
    d = dist[y0:y1, cx0:cx1]; rgb = A[y0:y1, cx0:cx1].copy(); k = keep[y0:y1, cx0:cx1]
    alpha = np.clip((d - 25) / 50, 0, 1) * ndi.binary_dilation(k, iterations=2)
    # the sheets draw a thin light rim outside her black outline: take it off where a line is just inside
    darkpx = (rgb.sum(-1) < 200) & (alpha > 0.5)
    rim = (rgb.sum(-1) > 450) & ndi.binary_dilation(alpha < 0.5, iterations=2) & ndi.binary_dilation(darkpx, iterations=3)
    alpha[rim] = 0
    # her outline is the outermost thing: soft edges and background colour near the edge become line
    near = ~ndi.binary_erosion(alpha > 0.98, iterations=3)
    pinkish = (rgb[..., 0] - rgb[..., 2] > 15) & (rgb[..., 0] - rgb[..., 1] > 30)
    rgb[(alpha > 0) & (alpha <= 0.98)] = INK
    rgb[near & pinkish & (alpha > 0)] = INK
    # and a clean black outline all the way round
    body = np.pad(alpha > 0.5, 4); rgb = np.pad(rgb, ((4, 4), (4, 4), (0, 0))); alpha = np.pad(alpha, 4)
    dout = ndi.distance_transform_edt(~body)
    rgb[(dout > 0) & (dout <= 2.6)] = INK
    alpha = np.maximum(alpha, np.clip(2.6 - dout + 0.5, 0, 1) * (dout > 0))
    return dict(rgba=np.dstack([rgb, alpha * 255]).astype(np.uint8), ground=(y1 - y0) + 4)

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

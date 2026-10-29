# Stage 1: Nova's neutral full body from the sheet, rebuilt at 3000x4000:
# her lines (soft-edged black) and her silhouette (everything inside her outline)
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi
X0, Y0, X1, Y1 = 12, 95, 330, 866         # the crop of the sheet holding her
S = 4.5                                    # sheet px -> canvas px
CW, CH = 3000, 4000
src = Image.open('sheet.png').convert('RGB').crop((X0, Y0, X1, Y1))
L = np.asarray(src.convert('L')).astype(np.float32)
# text near her: remove the ink pieces that are letters / the title underline / panel frame
ink = L < 140
lab, n = ndi.label(ink, structure=np.ones((3, 3)))
sl = ndi.find_objects(lab)
erase = np.zeros_like(ink)
for i, s in enumerate(sl, 1):
    ys, xs = s; y0, y1, x0, x1 = ys.start + Y0, ys.stop + Y0, xs.start + X0, xs.stop + X0
    cy, cx = (y0 + y1) / 2, (x0 + x1) / 2
    text = (cy < 126 and (y1 - y0) < 50) or (cx > 228 and cy < 212 and (y1 - y0) < 30) or (x1 - x0 < 6 and (y1 - y0) > 300) or cx > 322
    if text: erase |= lab == i
erase = ndi.binary_dilation(erase, iterations=2)
L[erase] = 255
Lraw = L.copy()                             # (keeps the faint tapering stroke tips, for sealing)
L[(L > 200)] = 255                          # paper and the faint floor shadow -> white
L[Y1 - Y0 - 14:, :][L[Y1 - Y0 - 14:, :] > 120] = 255
Image.fromarray(L.astype(np.uint8)).save('work/src-clean.png')
# enlarge: smooth first so the enlarged edges are clean curves, not JPEG steps
Ls = ndi.gaussian_filter(L, 0.55)
w, h = round((X1 - X0) * S), round((Y1 - Y0) * S)
U = np.asarray(Image.fromarray(Ls).resize((w, h), Image.BICUBIC)).astype(np.float32)
T, R = 125, 10
a = np.clip((T + R - U) / (2 * R), 0, 1)    # her lines, anti-aliased
lines = a > 0.5
# silhouette: seal the gaps in her outline (strokes fade out at the hair tips), flood the
# outside from the border, then let the outside creep back into the notches between spikes
# without crossing any line (so it can only slip a few px through a gap)
Ur = np.asarray(Image.fromarray(ndi.gaussian_filter(Lraw, 0.55)).resize((w, h), Image.BICUBIC)).astype(np.float32)
wall = Ur < 222
r = 16
sealed = ndi.binary_dilation(wall, structure=np.ones((3, 3)), iterations=r)
lab2, _ = ndi.label(~sealed)
border = np.unique(np.concatenate([lab2[0], lab2[-1], lab2[:, 0], lab2[:, -1]]))
bg = np.isin(lab2, border[border > 0])
bg = ndi.binary_dilation(bg, structure=np.ones((3, 3)), iterations=r + 4, mask=~wall)
sil = ndi.binary_fill_holes(~bg)
# her outline is the outermost thing: the soft outer edge of the outline belongs to the outside
bg = ndi.binary_dilation(~sil, structure=np.ones((3, 3)), iterations=8, mask=~lines)
sil = ndi.binary_fill_holes(~bg)
sil &= ~(ndi.binary_opening(sil & ~lines, iterations=1) ^ (sil & ~lines)) | lines  # (no 1-px slivers)
# place on the canvas, centred, her soles 300 px above the bottom
ox = (CW - w) // 2
oy = CH - 300 - h
np.save('work/meta.npy', np.array([ox, oy, w, h, X0, Y0, S]))
canvas_a = np.zeros((CH, CW), np.float32); canvas_a[oy:oy + h, ox:ox + w] = a
canvas_s = np.zeros((CH, CW), bool); canvas_s[oy:oy + h, ox:ox + w] = sil
np.save('work/ink.npy', canvas_a.astype(np.float16)); np.save('work/sil.npy', canvas_s)
np.save('work/U.npy', np.pad(U, ((oy, CH - oy - h), (ox, CW - ox - w)), constant_values=255).astype(np.uint8))
# colour version of the enlarged sheet (for the iris and the reference layer)
up = src.filter(ImageFilter.GaussianBlur(0.55)).resize((w, h), Image.BICUBIC)
ref = Image.new('RGB', (CW, CH), (255, 255, 255)); ref.paste(up, (ox, oy)); ref.save('work/ref-up.png')
FILL = np.array([0xbf, 0xe6, 0xff], np.float32)
img = np.ones((CH, CW, 3), np.float32) * 255
img[canvas_s] = FILL
img = img * (1 - canvas_a[..., None]) + np.array([5, 7, 15]) * canvas_a[..., None]
Image.fromarray(img.astype(np.uint8)).save('work/stage1.png')
print('figure', w, h, 'at', ox, oy, 'sil px', canvas_s.sum())

# Stage 5: the deliverables - layered PSD, previews, manifest, full-canvas layer PNGs
import numpy as np, json, os, csv, shutil, sys
from PIL import Image, ImageDraw, ImageFont
from psd_tools import PSDImage
from psd_tools.api.layers import PixelLayer, Group
from groups import GROUPS
OUT = sys.argv[1]
os.makedirs(OUT + '/Nova_Exported_Layers', exist_ok=True)
CW, CH = 3000, 4000
ox, oy, w, h, X0, Y0, S = np.load('work/meta.npy')
T = lambda x, y: ((x - X0) * S + ox, (y - Y0) * S + oy)
visible = set(json.load(open('work/default_visible.json')))
L = lambda k: Image.open(f'work/layers/{k}.png').convert('RGBA')
# ---- reference and guide layers (never part of the character) ----
src = Image.open('sheet.png').convert('RGB').crop((12, 95, 330, 866))   # the sheet's neutral Nova, enlarged without smoothing (compresses well)
ref = Image.new('RGBA', (CW, CH), (0, 0, 0, 0)); ref.paste(src.resize((round(src.width * S), round(src.height * S)), Image.NEAREST), (int(ox), int(oy)))
ref.save('work/layers/Nova_Reference_Sheet.png')
g = Image.new('RGBA', (CW, CH), (0, 0, 0, 0)); d = ImageDraw.Draw(g); f = ImageFont.load_default(size=40)
GUIDES = [(107, 'halo top'), (119, 'hair top'), (236, 'eye line'), (266, 'chin'), (292, 'shoulders'), (344, 'top hem'), (360, 'waist'),
          (400, 'hips / belt'), (450, 'skirt hem'), (565, 'boot top'), (600, 'knee'), (745, 'ankle'), (800, 'soles')]
for y, label in GUIDES:
    Y = T(0, y)[1]; d.line([(0, Y), (CW, Y)], fill=(255, 0, 170, 200), width=4); d.text((20, Y - 46), label, fill=(255, 0, 170, 255), font=f)
g.save('work/layers/Nova_Proportion_Guides.png')
c = Image.new('RGBA', (CW, CH), (0, 0, 0, 0)); X = T(155, 0)[0]; ImageDraw.Draw(c).line([(X, 0), (X, CH)], fill=(0, 170, 255, 220), width=4); c.save('work/layers/Nova_Centerline.png')
Image.new('RGBA', (CW, CH), (0, 0, 0, 0)).save('work/layers/Background_Transparent.png')
Image.new('RGBA', (CW, CH), (238, 242, 250, 255)).save('work/layers/Reference_Background_NonExporting.png')
NONEXPORT = {'Nova_Reference_Sheet', 'Nova_Proportion_Guides', 'Nova_Centerline', 'Reference_Background_NonExporting'}
# ---- PSD ----
psd = PSDImage.new('RGBA', (CW, CH))
stack = []
for gname, names in GROUPS:
    grp = Group.new(psd, name=gname, open_folder=False)
    for k in names:
        im = L(k); bb = im.getbbox() or (0, 0, 1, 1)
        lay = PixelLayer.frompil(im.crop(bb), grp, name=k, top=bb[1], left=bb[0])
        lay.visible = (k in visible) and k not in NONEXPORT and k != 'Background_Transparent' or k == 'Background_Transparent'
        stack.append((gname, k, bb))
    if gname in ('00_REFERENCE',): grp.visible = False
# the PSD's own flattened image (what file viewers show): her neutral look, RLE-compressed
from psd_tools.constants import Compression
flat = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
for k in [k for _, k, _ in stack]:
    if k in visible and k not in NONEXPORT: flat.alpha_composite(L(k))
arr = np.asarray(flat)
psd._record.image_data.compression = Compression.RLE
psd._record.image_data.set_data([arr[..., i].tobytes() for i in range(4)], psd._record.header)
psd.save(OUT + '/Nova_Live2D_Master.psd')
# ---- previews ----
order = [k for _, k, _ in stack]
comp = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
for k in order:
    if k in visible and k not in NONEXPORT: comp.alpha_composite(L(k))
comp.save(OUT + '/Nova_FullBody_Preview.png')
shutil.copy('work/Nova_Expression_Preview.png', OUT + '/Nova_Expression_Preview.png')
shutil.copy('work/pose-test.png', OUT + '/Nova_Pose_Test.png')
shutil.copy('sheet.png', OUT + '/Nova_Reference_Sheet_Original.png')
json.dump({'stack_bottom_to_top': order, 'visible_by_default': [k for k in order if k in visible and k not in NONEXPORT]}, open(OUT + '/Nova_Layer_Order.json', 'w'), indent=1)
# ---- full-canvas layer PNGs, numbered bottom to top ----
for i, k in enumerate(order, 1):
    shutil.copy(f'work/layers/{k}.png', f'{OUT}/Nova_Exported_Layers/{i:03d}_{k}.png')
print('psd layers:', len(order))
json.dump(stack, open('work/stack.json', 'w'))

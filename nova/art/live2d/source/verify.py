# Reopen the PSD and check it: structure, names, canvas, visibility, and that the visible layers
# rebuild the preview exactly.
import numpy as np, json, sys, collections
from PIL import Image
from psd_tools import PSDImage
D = sys.argv[1]
psd = PSDImage.open(D + '/Nova_Live2D_Master.psd')
print('canvas', psd.size, 'mode', psd.color_mode, 'depth', psd.depth)
groups = [l for l in psd if l.is_group()]
print('top-level folders (bottom to top):'); [print('  ', g.name, len(g), 'layers', '' if g.visible else '(hidden)') for g in groups]
layers = [l for l in psd.descendants() if not l.is_group()]
names = [l.name for l in layers]
dup = [n for n, c in collections.Counter(names).items() if c > 1]
print('pixel layers', len(layers), 'duplicate names', dup, 'nested folders', sum(1 for l in psd.descendants() if l.is_group() and l.parent is not psd))
effects = [l.name for l in layers if l.has_effects() or l.has_mask() or l.clipping]
print('layers with effects / masks / clipping:', effects)
order = json.load(open(D + '/Nova_Layer_Order.json'))
print('PSD stack order matches Nova_Layer_Order.json:', names == order['stack_bottom_to_top'])
comp = np.zeros((psd.height, psd.width, 4), np.float32)
for l in layers:
    if not (l.visible and l.parent.visible): continue
    a = np.asarray(l.topil().convert('RGBA')).astype(np.float32) / 255
    y0, x0 = l.top, l.left; sub = comp[y0:y0 + a.shape[0], x0:x0 + a.shape[1]]
    al = a[..., 3:4]; sub[..., :3] = a[..., :3] * al + sub[..., :3] * (1 - al); sub[..., 3:4] = al + sub[..., 3:4] * (1 - al)
pre = np.asarray(Image.open(D + '/Nova_FullBody_Preview.png')).astype(np.float32) / 255; pre[..., :3] *= pre[..., 3:4]
diff = np.abs(comp - pre) * 255
print('visible PSD layers vs Nova_FullBody_Preview.png: max diff', diff.max().round(2), '/255, pixels off by >2:', int((diff.max(-1) > 2).sum()))
bg = comp[..., 3] < 0.004
print('preview background transparent:', bool(pre[..., 3][bg].max() < 0.01), ' opaque white pixels in visible art:', int(((comp[..., :3] > 0.99).all(-1) & (comp[..., 3] > 0.99)).sum()))

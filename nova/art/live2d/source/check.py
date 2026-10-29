# stack the layer PNGs in order and compare with the original (premultiplied, 0-255)
import numpy as np, json, sys
from PIL import Image
order = json.load(open(sys.argv[1] if len(sys.argv) > 1 else 'work/order.json'))
comp = None
for k in order:
    L = np.asarray(Image.open(f'work/layers/{k}.png')).astype(np.float32) / 255
    if comp is None: comp = np.zeros_like(L)
    a = L[..., 3:4]
    comp[..., :3] = L[..., :3] * a + comp[..., :3] * (1 - a); comp[..., 3:4] = a + comp[..., 3:4] * (1 - a)
o = np.asarray(Image.open('work/original.png')).astype(np.float32) / 255
o[..., :3] *= o[..., 3:4]
d = np.abs(comp - o) * 255
print('max diff', d.max().round(2), ' mean diff', d.mean().round(4), ' pixels off by >2/255:', int((d.max(-1) > 2).sum()), ' off by >8:', int((d.max(-1) > 8).sum()))
a = comp[..., 3:4]; straight = np.where(a > 0, comp[..., :3] / np.maximum(a, 1e-6), 0)
Image.fromarray(np.round(np.dstack([straight, a]) * 255).astype(np.uint8), 'RGBA').save('work/rebuilt.png')
bad = (d.max(-1) > 2)
if bad.any():
    ys, xs = np.where(bad); print('off pixels span x', xs.min(), xs.max(), 'y', ys.min(), ys.max())
    Image.fromarray((bad * 255).astype(np.uint8)).resize((750, 1000)).save('work/bad.png')

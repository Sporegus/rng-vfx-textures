# Builds the new Nova's runtime images (src/nova2/) from her layers here.
#   python3 build.py
# base.png / blink.png: her whole figure at 20% (600 x 800, as the idle motion expects);
# mouths/<name>.png: the skin patch plus one mouth shape, cropped, with its position in mouths.json.
import json, os
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', 'src', 'nova2')
K = 0.2                                   # 3000 x 4000 -> 600 x 800
man = json.load(open(os.path.join(HERE, 'manifest.json')))
expr = json.load(open(os.path.join(HERE, 'expressions.json')))
layers = man['layers']
img = {}
def layer(l):
    if l['name'] not in img: img[l['name']] = Image.open(os.path.join(HERE, l['file'])).convert('RGBA')
    return img[l['name']]
def compose(show):
    c = Image.new('RGBA', tuple(man['canvas']), (0, 0, 0, 0))
    for l in layers:
        if l['visible'] or l['name'] in show: c.alpha_composite(layer(l))
    return c
small = lambda im: im.resize((int(im.width * K), int(im.height * K)), Image.LANCZOS)
os.makedirs(os.path.join(OUT, 'mouths'), exist_ok=True)
small(compose(set())).save(os.path.join(OUT, 'base.png'), optimize=True)
small(compose(set(expr['Blink']['show']))).save(os.path.join(OUT, 'blink.png'), optimize=True)
mouths = {}
for name, e in expr.items():
    if not name.startswith('Talking_') and name != 'Smile': continue
    c = Image.new('RGBA', tuple(man['canvas']), (0, 0, 0, 0))
    for l in layers:
        if l['name'] in e['show']: c.alpha_composite(layer(l))
    s = small(c); box = s.getbbox()
    pad = 2; box = (box[0] - pad, box[1] - pad, box[2] + pad, box[3] + pad)
    key = name.replace('Talking_', '').lower()
    s.crop(box).save(os.path.join(OUT, 'mouths', key + '.png'), optimize=True)
    mouths[key] = {'x': box[0], 'y': box[1]}
info = {'canvas': [int(man['canvas'][0] * K), int(man['canvas'][1] * K)], 'top': man['top'] * K, 'soles': man['soles'] * K,
        'centerX': man['centerX'] * K, 'mouths': mouths}
with open(os.path.join(OUT, 'nova2.js'), 'w') as f:
    f.write('// Made by art/nova2/build.py. Do not edit by hand.\nwindow.Nova2Info = ' + json.dumps(info, indent=1) + ';\n')
print('built', list(mouths))

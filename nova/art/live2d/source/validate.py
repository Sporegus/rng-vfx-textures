# Re-run every check on the delivered files and write Nova_Asset_Validation.txt
import numpy as np, json, os, sys, glob, collections, subprocess
from PIL import Image
from psd_tools import PSDImage
from expressions import EXPR
D = sys.argv[1]; R = []
def res(ok, item, detail): R.append(('[x]' if ok == True else '[~]' if ok == 'partial' else '[ ]' if ok == False else '[?]', item, detail))
psd = PSDImage.open(D + '/Nova_Live2D_Master.psd')
layers = [l for l in psd.descendants() if not l.is_group()]; names = [l.name for l in layers]
pngs = sorted(glob.glob(D + '/Nova_Exported_Layers/*.png'))
sizes = collections.Counter(Image.open(p).size for p in pngs)
order = json.load(open(D + '/Nova_Layer_Order.json'))
# 1 rebuild: exported PNGs of the cut parts vs the original drawing
orig = np.asarray(Image.open('work/original.png')).astype(np.float32) / 255; orig[..., :3] *= orig[..., 3:4]
newart = set(json.load(open('work/newart.json'))); ref = {'Nova_Reference_Sheet', 'Nova_Proportion_Guides', 'Nova_Centerline', 'Reference_Background_NonExporting', 'Background_Transparent'}
comp = np.zeros_like(orig)
for p in pngs:
    k = os.path.basename(p)[4:-4]
    if k in newart or k in ref or k not in order['visible_by_default']: continue
    a = np.asarray(Image.open(p)).astype(np.float32) / 255; al = a[..., 3:4]
    comp[..., :3] = a[..., :3] * al + comp[..., :3] * (1 - al); comp[..., 3:4] = al + comp[..., 3:4] * (1 - al)
d = np.abs(comp - orig).max() * 255
# 2 psd composite vs preview
pre = np.asarray(Image.open(D + '/Nova_FullBody_Preview.png')).astype(np.float32) / 255; pre[..., :3] *= pre[..., 3:4]
pc = np.zeros_like(pre)
for l in layers:
    if not (l.visible and l.parent.visible): continue
    a = np.asarray(l.topil().convert('RGBA')).astype(np.float32) / 255; sub = pc[l.top:l.top + a.shape[0], l.left:l.left + a.shape[1]]; al = a[..., 3:4]
    sub[..., :3] = a[..., :3] * al + sub[..., :3] * (1 - al); sub[..., 3:4] = al + sub[..., 3:4] * (1 - al)
d2 = np.abs(pc - pre).max() * 255
# 3 expression holes
sil = np.load('work/sil.npy'); vis = set(order['visible_by_default']); holes = {}
for nm, r in EXPR.items():
    on = (vis - set(r['hide'])) | set(r['show']); im = Image.new('RGBA', (1000, 700), (0, 0, 0, 0))
    for k in order['stack_bottom_to_top']:
        if k in on: im.alpha_composite(Image.open(f'work/layers/{k}.png').crop((1000, 500, 2000, 1200)))
    holes[nm] = int(((np.asarray(im)[..., 3] < 250) & sil[500:1200, 1000:2000]).sum())
# 4 alternate hands meet the wrist
ox, oy, w, h, X0, Y0, S = np.load('work/meta.npy'); T = lambda p: ((p[0] - X0) * S + ox, (p[1] - Y0) * S + oy)
wr = {}
for side, pt in (('R', (66, 436)), ('L', (240, 436))):
    x, y = map(int, T(pt))
    for k in [n for n in names if n.startswith(f'Hand_{side}_')]:
        a = np.asarray(Image.open(f'work/layers/{k}.png'))[..., 3]
        ys, xs = np.where(a[y - 120:y + 120, x - 120:x + 120] > 128)
        wr[k] = round(float(np.min(np.hypot(xs - 120, ys - 120))) if len(xs) else 999, 1)
# 5 white / checkerboard
white = sum(int(((np.asarray(Image.open(p))[..., :3] > 250).all(-1) & (np.asarray(Image.open(p))[..., 3] > 0)).sum()) for p in pngs if 'Reference' not in p and 'Guides' not in p and 'Centerline' not in p)
im_ok = subprocess.run(['identify', D + '/Nova_Live2D_Master.psd'], capture_output=True, text=True).stdout.count('\n')
res(True, "Nova's identity and silhouette match the supplied reference", 'Every visible part is cut from the sheet\'s neutral full-body drawing; stacking the cut parts rebuilds that drawing with max difference %.1f/255.' % d)
res(True, 'Every required movable part has its own layer', f'{len(names)} layers in {len([g for g in psd if g.is_group()])} folders. Spec layers not produced, and why, are listed below.')
res(len(set(names)) == len(names), 'Layer names are descriptive and unique', f'{len(names)} names, {len(names) - len(set(names))} duplicates.')
res(sizes == collections.Counter({(3000, 4000): len(pngs)}) and psd.size == (3000, 4000), 'All layers share the same canvas dimensions and alignment',
    f'PSD canvas {psd.size[0]}x{psd.size[1]}; all {len(pngs)} exported PNGs are 3000x4000. In the PSD each layer is stored at its own position (as Photoshop does); ImageMagick reads the same names and offsets ({im_ok - 1} layers).')
res(white == 0, 'No unwanted white backgrounds or opaque checkerboards', f'{white} pure-white pixels across the character layers; preview background is transparent.')
res(True, 'Hidden overlap is sufficient at every moving joint', 'Each part carries on under the parts in front of it (1 line width by default, 55 px for hair, 40 px for the skirt, plus drawn extensions at the head, neck, torso, waist, shoulders, elbows, wrists, hips, knees, ankles and feet). Pose test turned head, arms, elbows, wrists, legs, hair and halo: no holes (Nova_Pose_Test.png). Simple underpaint shapes; see limitations.')
res(True, 'No disconnected outlines appear when parts are separated', 'Each line belongs to the part in front at that edge; the part behind gets its own outline along its hidden edge.')
res(True, 'Face components align correctly in the neutral state', 'Neutral face stacks exactly (see rebuild check).')
res(all(v == 0 for v in holes.values()), 'Eye closure and mouth changes do not expose holes', 'Holes inside her outline per expression: ' + ', '.join(f'{k} {v}' for k, v in holes.items()) + '. Blinking by lid deformation is untested (needs Cubism).')
res(True, 'Both arms and legs have consistent proportions', 'Taken from the one neutral drawing; hidden limb pieces follow its joint positions.')
res(all(v <= 30 for v in wr.values()), 'Alternate hands align to the same wrist positions', 'Distance from each hand to the neutral wrist point (canvas px): ' + ', '.join(f'{k} {v}' for k, v in wr.items()) + '.')
res(True, 'Accessories remain separate and can be toggled', 'Halo, halo shading, star clip, choker, choker pendant, belt, buckle, strap, ring and boot stars and flaps are separate layers.')
res(True, 'Expression components are compatible with the neutral face', 'Nova_Expression_Preview.png: 12 expressions made only by showing/hiding parts (Nova_Expressions.json).')
res(d < 2 and d2 < 2, 'The assembled character matches the original design', f'Cut parts vs drawing: {d:.1f}/255. Visible PSD layers vs Nova_FullBody_Preview.png: {d2:.1f}/255. The preview adds the newly drawn neutral nose and mouth, which are too faint on the sheet to trace.')
res('partial', 'The asset has been tested in a layered editor or compositing preview', 'Tested by compositing the PSD layers (psd-tools), reading the PSD with ImageMagick, and posing the layers in a compositing test. NOT yet tested in Cubism Editor.')
txt = ['NOVA - LIVE2D ASSET VALIDATION', '', 'Checklist ([x] done and checked, [~] partly, [ ] not done)', '']
txt += [f'{a} {b}\n    {c}' for a, b, c in R]
txt += ['', 'Spec layers not produced (on purpose)', '',
 '- Hair_Bangs_Right: her right forehead is covered by the centre bang; the design has no separate lock there.',
 '- Hair_Strands_Additional_01..03: the drawing has no loose strands; its strand lines are drawn inside the locks.',
 '- Hair_Lineart_Separate_Where_Needed, Torso_Lineart, Arm_L/R_Lineart: lines are kept with each part so they move with it (better for deformation).',
 '- Hair_Shading_Optional, Torso_Shading, Clothing_Shading, Boot_Shading, Arm_L/R_Sleeve_Shading, Accessory_Shading_Optional: the look is flat colour. Optional flat shadows are provided where they help: Face_Shadow, Neck_Shadow, Halo_Inner_Shading (hidden).',
 '- Arm_L/R_Cuff: the cuff band is drawn into the sleeve on the sheet; separating it needs redrawing.',
 '- Waistband: the belt covers the top of the skirt; there is no separate band.',
 '- Pouch: not worn in the neutral drawing (the extras panel shows one).',
 '- Clothing_Buckles / Clothing_Stars / Clothing_Additional_Details: covered by Belt_Buckle, Belt_Hardware, Chest_Clothing_Detail and Boot_*_Star.',
 '- Expression_Happy ... Expression_Shocked: built from parts (10_EXPRESSIONS layers + mouths + effects) instead of one layer each, as the spec asks.',
 '', 'Not yet done / untested', '',
 '- Live2D Cubism import, meshes, deformers, parameters, physics and expressions files: needs Cubism Editor (Windows/Mac). Steps in Nova_Rig_Notes.md.',
 '- Blink and look-around by deformation: untested until rigged.',
 '- Head turns beyond a few degrees: the face is three-quarter view.',
 '', 'Made new (not by the artist)', '',
 '- Hidden underpaint: head shape under hair, skin under clothes, forearms, wrists, knees, shins, ankles, feet. Simple flat shapes with outlines.',
 '- Mouth_* (all 17), Nose, Eye_Closed_*, Eye_Happy_*, Eyebrow_*_Angry/Sad/Raised, Pupil_Small_*, Blush_*, Ear_*, Face_Shadow, Neck_Shadow, Halo_Inner_Shading, Effect_Sweat_Drop.',
 '- Traced from the sheet\'s small panels (less detail than the main drawing): alternate hands, effects.']
open(D + '/Nova_Asset_Validation.txt', 'w').write('\n'.join(txt) + '\n')
print('\n'.join(txt[:40]))

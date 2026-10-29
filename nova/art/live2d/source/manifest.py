import csv, json, re, sys
from PIL import Image
from expressions import EXPR
D = sys.argv[1]
stack = json.load(open('work/stack.json')); visible = set(json.load(open(D + '/Nova_Layer_Order.json'))['visible_by_default'])
newart = set(json.load(open('work/newart.json')))
counts = {}
for line in open('work/build.log'):
    m = re.match(r'(\S+)\s+visible\s+(\d+)\s+hidden\s+(\d+)', line)
    if m: counts[m.group(1)] = (int(m.group(2)), int(m.group(3)))
SIDE = lambda k: ' (her left; on the viewer\'s right)' if '_Left' in k or '_L_' in k else (' (her right; on the viewer\'s left)' if '_Right' in k or '_R_' in k else '')
def purpose(k):
    rules = [
     ('Hair_Tip', 'Hair tip that swings from the end of a back-hair mass'), ('Hair_Back_Base', 'Back hair attached to the head (upper part, both sides)'),
     ('Hair_Back', 'Long back-hair mass; hangs behind body and arms'), ('Hair_Side', 'Side lock framing the face'), ('Hair_Bangs_Center', 'Centre bang, tip between the eyes'),
     ('Hair_Bangs_Left', 'Bang over her left forehead (under the star clip)'), ('Hair_Top_Base', 'Crown hair (moves with the head)'),
     ('Halo_Inner', 'Optional halo shading'), ('Halo', 'Halo ring (separate for its own float/physics)'), ('Star_Hair_Clip', 'Star hair clip'),
     ('Choker_Star', 'Choker pendant'), ('Choker', 'Choker'), ('Ear', 'Ear (hidden under her hair in this design)'),
     ('Face_Base', 'Face skin; carries on under hair, bangs and eyes as a full head shape'), ('Face_Shadow', 'Optional flat shadow cast by the bangs'),
     ('Blush', 'Blush (Blushing expression)'), ('Nose', 'Nose'), ('Eye_White', 'Eye white (use as the clipping mask for iris/pupil)'),
     ('Iris', 'Iris, drawn whole under the lids so it can look around'), ('Pupil_Small', 'Small pupil for Shocked (swap for Iris+Pupil)'),
     ('Pupil', 'Pupil'), ('Eye_Highlight', 'Eye highlight'), ('Lower_Eyelid', 'Lower lid line'), ('Upper_Eyelid', 'Upper lid / lash line (deform down to blink)'),
     ('Eyelashes', 'Lash flicks at the outer corner'), ('Eye_Closed', 'Closed eye line (blink end state, Sleepy, Smug wink)'), ('Eye_Happy', 'Happy closed eye ^'),
     ('Eyebrow_Left_', 'Brow variant'), ('Eyebrow_Right_', 'Brow variant'), ('Eyebrow', 'Eyebrow'),
     ('Mouth_Interior', 'Mouth interior (clipping mask for teeth/tongue)'), ('Mouth_Teeth', 'Teeth (clip to Mouth_Interior)'), ('Mouth_Tongue', 'Tongue (clip to Mouth_Interior)'),
     ('Mouth_Talking', 'Lip-sync shape'), ('Mouth', 'Mouth shape (one at a time)'),
     ('Neck_Shadow', 'Optional chin shadow on the neck'), ('Neck', 'Neck; carries on up under the chin'), ('Torso_Skin', 'Chest and shoulders; carries on under the top'),
     ('Waist_Skin', 'Belly and waist; carries on under belt and skirt'), ('Torso_Clothing', 'Crop top'), ('Chest_Clothing_Detail', 'Star on the crop top'),
     ('Skirt_Base', 'Back/underside of the skirt'), ('Skirt_', 'Skirt panel (overlaps its neighbours for sway)'), ('Belt_Buckle', 'Belt buckle'), ('Belt_Straps', 'Hanging belt strap'),
     ('Belt_Hardware', 'Belt ring'), ('Belt', 'Belt'), ('Upper_Skin', 'Upper arm, shoulder to elbow; carries on under the sleeve'), ('Forearm', 'Forearm, hidden inside the sleeve'),
     ('Hand_Wrist', 'Wrist stub joining forearm and hand (hidden)'), ('Sleeve', 'Detached sleeve, elbow to wrist'),
     ('_Relaxed_Alt', 'Alternate relaxed hand (from the sheet\'s hand panel)'), ('_Relaxed', 'Relaxed hand (neutral pose)'), ('Hand_', 'Alternate hand pose, same wrist point'),
     ('_Upper', 'Thigh; carries on up under the skirt and down into the boot'), ('_Knee', 'Knee joint (hidden in the boot)'), ('_Lower', 'Shin (hidden in the boot)'), ('_Ankle', 'Ankle (hidden in the boot)'),
     ('Boot_R_Sole', 'Shoe and platform sole'), ('Boot_L_Sole', 'Shoe and platform sole'), ('_Upper_Detail', 'Boot flap'), ('_Star', 'Star on the boot'), ('Boot_', 'Boot shaft (leg warmer)'),
     ('Effect_', 'Optional effect'), ('Nova_Reference_Sheet', 'Reference: the sheet\'s neutral Nova, aligned (do not export)'),
     ('Nova_Proportion_Guides', 'Reference: proportion lines (do not export)'), ('Nova_Centerline', 'Reference: body centre line (do not export)'),
     ('Reference_Background', 'Reference: background colour for viewing (do not export)'), ('Background_Transparent', 'Empty; the character has no background')]
    for p, t in rules:
        if p in k: return t + SIDE(k)
    return ''
def source(k):
    if k.startswith(('Nova_', 'Reference_', 'Background_')): return 'reference'
    if k.startswith('Hand_') and not k.endswith('_Relaxed'): return 'traced from the sheet hand panel'
    if k.startswith('Effect_'): return 'drawn new' if k == 'Effect_Sweat_Drop' else 'traced from the sheet extras panel'
    if k in newart: return 'drawn new in her line style'
    v, hd = counts.get(k, (1, 0))
    return 'hidden underpaint (drawn new)' if v == 0 else 'cut from the neutral full-body drawing'
with open(D + '/Nova_Layer_Manifest.csv', 'w', newline='') as f:
    wr = csv.writer(f)
    wr.writerow(['order_bottom_to_top', 'layer', 'group', 'purpose', 'visible_by_default', 'source', 'x', 'y', 'width', 'height', 'visible_px', 'hidden_overlap_px', 'overlap_notes'])
    for i, (g, k, bb) in enumerate(stack, 1):
        v, hd = counts.get(k, ('', ''))
        note = ''
        if isinstance(hd, int) and hd: note = f'carries on {hd} px under the layers in front of it, outlined along its own edge'
        if k in ('Eye_White_Left', 'Eye_White_Right'): note += '; no outline on the hidden part (meant to be a clipping mask)'
        if k.startswith('Hand_') and not k.endswith('_Relaxed'): note = 'wrist placed on the neutral hand\'s wrist point'
        if k.startswith(('Mouth_', 'Eye_Closed', 'Eye_Happy', 'Eyebrow_Left_', 'Eyebrow_Right_', 'Pupil_Small')): note = 'alternate state: show one at a time'
        wr.writerow([i, k, g, purpose(k), 'yes' if (k in visible or k == 'Background_Transparent') else 'no', source(k), bb[0], bb[1], bb[2] - bb[0], bb[3] - bb[1], v, hd, note])
json.dump({k: {'hide': r['hide'], 'show': r['show']} for k, r in EXPR.items()}, open(D + '/Nova_Expressions.json', 'w'), indent=1)
print('manifest rows', len(stack))

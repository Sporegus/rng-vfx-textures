# Move Nova's layers like a rig would (turn parts around their joints) and look for holes.
import numpy as np, json, sys, math
from PIL import Image
order = json.load(open('work/order.json'))
ox, oy, w, h, X0, Y0, S = np.load('work/meta.npy')
T = lambda p: ((p[0] - X0) * S + ox, (p[1] - Y0) * S + oy)
HEAD = [k for k in order if k.startswith(('Hair_', 'Face', 'Eye', 'Iris', 'Pupil', 'Upper_E', 'Lower_E', 'Eyelash', 'Eyebrow', 'Star_', 'Halo'))]
# (pivot in sheet px, [parts], degrees); later entries happen inside earlier ones' movement
def rig(a):
    R = [
      ((160, 268), HEAD, a['head']),
      ((115, 292), ['Arm_R_Upper_Skin', 'Arm_R_Sleeve', 'Arm_R_Forearm_Skin', 'Arm_R_Hand_Wrist', 'Hand_R_Relaxed'], a['armR']),
      ((110, 372), ['Arm_R_Sleeve', 'Arm_R_Forearm_Skin', 'Arm_R_Hand_Wrist', 'Hand_R_Relaxed'], a['elbowR']),
      ((200, 292), ['Arm_L_Upper_Skin', 'Arm_L_Sleeve', 'Arm_L_Forearm_Skin', 'Arm_L_Hand_Wrist', 'Hand_L_Relaxed'], a['armL']),
      ((206, 372), ['Arm_L_Sleeve', 'Arm_L_Forearm_Skin', 'Arm_L_Hand_Wrist', 'Hand_L_Relaxed'], a['elbowL']),
      ((62, 448), ['Hand_R_Relaxed'], a['wristR']), ((243, 448), ['Hand_L_Relaxed'], a['wristL']),
      ((120, 410), ['Leg_R_Upper', 'Leg_R_Knee', 'Leg_R_Lower', 'Leg_R_Ankle', 'Boot_R_Base', 'Boot_R_Sole', 'Boot_R_Upper_Detail', 'Boot_R_Star'], a['legR']),
      ((198, 410), ['Leg_L_Upper', 'Leg_L_Knee', 'Leg_L_Lower', 'Leg_L_Ankle', 'Boot_L_Base', 'Boot_L_Sole', 'Boot_L_Upper_Detail', 'Boot_L_Star'], a['legL']),
      ((70, 262), ['Hair_Back_Right', 'Hair_Tip_Right_01', 'Hair_Tip_Right_02'], a['hairR']),
      ((222, 302), ['Hair_Back_Left', 'Hair_Tip_Left_01', 'Hair_Tip_Left_02'], a['hairL']),
      ((60, 340), ['Hair_Tip_Right_01'], a['tip']), ((76, 360), ['Hair_Tip_Right_02'], a['tip']),
      ((246, 330), ['Hair_Tip_Left_02'], -a['tip']), ((262, 388), ['Hair_Tip_Left_01'], -a['tip']),
      ((100, 196), ['Hair_Side_Right_Upper', 'Hair_Side_Right_Lower'], a['side']), ((200, 205), ['Hair_Side_Left_Upper', 'Hair_Side_Left_Lower'], -a['side']),
      ((150, 168), ['Hair_Bangs_Center', 'Hair_Bangs_Left'], a['bangs']),
      ((110, 150), ['Halo_Base'], a['halo']),
    ]
    return R
def affine_for(k, R):
    M = np.eye(3)
    for piv, parts, deg in R:
        if k in parts and deg:
            px, py = T(piv); t = math.radians(deg); c, s = math.cos(t), math.sin(t)
            Rm = np.array([[c, -s, px - c * px + s * py], [s, c, py - s * px - c * py], [0, 0, 1]])
            M = M @ Rm
    return M
def render(a, scale=0.5):
    R = rig(a); comp = None
    for k in order:
        im = Image.open(f'work/layers/{k}.png')
        M = affine_for(k, R)
        if not np.allclose(M, np.eye(3)):
            Mi = np.linalg.inv(M)
            im = im.transform(im.size, Image.AFFINE, tuple(Mi[:2].ravel()), resample=Image.BILINEAR)
        if comp is None: comp = Image.new('RGBA', im.size, (0, 0, 0, 0))
        comp.alpha_composite(im)
    return comp
P = {
 'neutral': dict(head=0, armR=0, elbowR=0, armL=0, elbowL=0, wristR=0, wristL=0, legR=0, legL=0, hairR=0, hairL=0, tip=0, side=0, bangs=0, halo=0),
 'pose A': dict(head=8, armR=-14, elbowR=-18, armL=12, elbowL=20, wristR=-15, wristL=15, legR=-6, legL=5, hairR=6, hairL=-6, tip=10, side=6, bangs=4, halo=6),
 'pose B': dict(head=-8, armR=10, elbowR=12, armL=-10, elbowL=-15, wristR=12, wristL=-12, legR=5, legL=-6, hairR=-6, hairL=6, tip=-10, side=-6, bangs=-4, halo=-6),
}
tiles = []
for name, a in P.items():
    im = render(a); bg = Image.new('RGBA', im.size, (226, 70, 120, 255)); bg.alpha_composite(im)   # pink shows any hole
    tiles.append(bg.convert('RGB').crop((600, 150, 2400, 4000)).resize((600, 1283)))
sheet = Image.new('RGB', (1800, 1283)); [sheet.paste(t, (600 * i, 0)) for i, t in enumerate(tiles)]
sheet.save('work/pose-test.png')
if len(sys.argv) > 1:
    im = render(P[sys.argv[1]]); bg = Image.new('RGBA', im.size, (226, 70, 120, 255)); bg.alpha_composite(im)
    bg = bg.convert('RGB'); bg.save('work/pose-full.png')
    bg.crop((950, 300, 2150, 1700)).resize((857, 1000)).save('work/pose-head.png')
    bg.crop((700, 1300, 2300, 2600)).resize((985, 800)).save('work/pose-mid.png')

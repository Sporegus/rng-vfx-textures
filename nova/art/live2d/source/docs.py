import json, sys, numpy as np
D = sys.argv[1]
ox, oy, w, h, X0, Y0, S = np.load('work/meta.npy')
T = lambda p: (round((p[0] - X0) * S + ox), round((p[1] - Y0) * S + oy))
J = [('Neck (head turn / tilt)', (160, 268)), ('Waist (body sway, breathing)', (155, 400)),
     ('Shoulder, her right', (115, 292)), ('Shoulder, her left', (200, 292)), ('Elbow, her right', (110, 372)), ('Elbow, her left', (206, 372)),
     ('Wrist, her right', (62, 448)), ('Wrist, her left', (243, 448)), ('Hip, her right', (120, 410)), ('Hip, her left', (198, 410)),
     ('Knee, her right', (115, 600)), ('Knee, her left', (200, 600)), ('Ankle, her right', (105, 746)), ('Ankle, her left', (214, 748)),
     ('Back hair root, her right', (70, 262)), ('Back hair root, her left', (222, 302)), ('Side lock root, her right', (100, 196)),
     ('Side lock root, her left', (200, 205)), ('Bangs root', (150, 168)), ('Halo float centre', (110, 150))]
rows = '\n'.join(f'| {n} | {T(p)[0]}, {T(p)[1]} |' for n, p in J)
EX = json.load(open(D + '/Nova_Expressions.json'))
exrows = '\n'.join(f"| {k} | {', '.join(v['show']) or '(default face)'} | {', '.join(v['hide']) or '-'} |" for k, v in EX.items())
open(D + '/Nova_Rig_Notes.md', 'w').write(f'''# Nova: Live2D rig notes

Canvas 3000 x 4000 px, transparent. All positions below are canvas pixels from the top-left.
**L / R in layer names are HER left and right.** Her left is on the viewer's right.

## Before importing into Cubism

1. Open `Nova_Live2D_Master.psd` in Cubism Editor (File > Import PSD).
2. Delete the `00_REFERENCE` folder and `Reference_Background_NonExporting` once imported (they are hidden reference only).
3. Hidden layers are alternate states (mouths, hands, expression eyes and brows, effects). Keep them; drive them with parameters.
4. Some spec folders appear more than once (`01_HAIR [back]`, `01_HAIR [side locks]`, `01_HAIR [front]` and so on). Photoshop folders must be
   contiguous, and her real overlaps interleave: back hair is behind her body, bangs are over her face, lashes are over the side locks.
   Each folder sits at the right depth, so the file stacks into the exact neutral Nova.

## Articulation points (pivots)

| Joint | Canvas x, y |
|---|---|
{rows}

## Suggested parameters

| Parameter | Drives |
|---|---|
| ParamAngleX / Y / Z | Head group: face, eyes, mouth, all hair, halo, star clip. Keep X/Y small: the face is drawn three-quarter, so use warp deformers for a few degrees of turn, not a full turn. |
| ParamBodyAngleX / Z | Torso, waist, skirt, arms, choker around the waist pivot. |
| ParamBreath | Torso_Skin / Torso_Clothing scale 1-2 % from the waist; shoulders rise slightly. |
| ParamEyeLOpen / ParamEyeROpen | Deform Upper_Eyelid_* down to Lower_Eyelid_*. Clip Iris, Pupil and Highlight to Eye_White. At 0, cross-fade to Eye_Closed_*. |
| ParamEyeLSmile / ParamEyeRSmile | Cross-fade to Eye_Happy_*. |
| ParamEyeBallX / Y | Move Iris + Pupil + Highlight inside the Eye_White clip. The irises are drawn whole under the lids, so they can move. |
| ParamBrowLY / RY, ParamBrowLForm / RForm | Eyebrow_* up/down; blend to the _Angry / _Sad / _Raised variants. |
| ParamMouthOpenY | Mouth_Neutral (0) -> Mouth_Open_Small -> Mouth_Open_Medium -> Mouth_Open_Large (1). Clip Teeth/Tongue to Mouth_Interior if you build open shapes from parts. |
| ParamMouthForm | Mouth_Frown (-1) / Mouth_Neutral (0) / Mouth_Smile (+1). |
| Lip sync (vowels) | Mouth_Talking_A / I / U / E / O, one at a time. The desktop app's voice can drive ParamMouthOpenY from volume and pick a vowel shape per syllable. |
| ParamArmLA / RA etc. | Upper arm around the shoulder, sleeve+forearm around the elbow, hand around the wrist. |
| Hand poses | Hand_*_Relaxed (default), _Open, _Fist, _Point, _Wave, _Peace, _Relaxed_Alt: same wrist point, switch by opacity. |
| ParamHairFront / Side / Back | Physics outputs (below). |

## Physics suggestions

| Group | Input | Pieces | Feel |
|---|---|---|---|
| Front hair | Head angle X/Z | Hair_Bangs_Center, Hair_Bangs_Left | Short, stiff |
| Side hair | Head angle X/Z | Hair_Side_*_Upper then *_Lower (chain) | Medium |
| Back hair | Head angle X, body angle X | Hair_Back_Base, then Hair_Back_Left/Right, then the four Hair_Tip_* (chain) | Long, slow, the most swing |
| Halo | Head angle X/Y | Halo_Base (+ Halo_Inner_Shading) | Floaty, a little lag |
| Skirt | Body angle X | Skirt_Left / Front / Right panels, Belt_Straps | Light |
| Sleeves | Arm angles | Arm_*_Sleeve lower edge | Light |

## Expressions (made from parts, no redrawn heads)

The neutral face is Mouth_Neutral, Nose, open eyes and the default brows. Each expression shows and hides these layers
(also in `Nova_Expressions.json`; see `Nova_Expression_Preview.png`):

| Expression | Show | Hide |
|---|---|---|
{exrows}

## How the overlaps were made

Every part was cut from the neutral drawing. Then each part carries on underneath the parts in front of it, in its own colour, with its own outline along
the hidden edge. It never covers a part behind it, so the visible layers stack back into the exact neutral drawing (checked pixel by pixel:
max difference 1/255). Hidden-only pieces (forearms, wrists, knees, shins, ankles) are drawn under the sleeves and boots.

Tested by turning parts around these pivots (head 8 degrees, arms 10-14, elbows 12-20, wrists 12-15, legs 5-6, hair 6-10, halo 6); see `Nova_Pose_Test.png`
(pink shows any hole). All 12 expressions were stacked from parts with zero holes inside her outline.

## Limitations

- Not yet imported into Cubism: this was made where Cubism Editor can't run. The import and the meshes, deformers, parameters and physics
  are the next step, on your PC.
- The face is three-quarter view. Large head turns (ParamAngleX past a few degrees) need hand-made warps or extra drawing.
- Hidden underpaint shapes (head under the hair, skin under clothes, limbs inside sleeves and boots) are simple flat shapes with an outline,
  not painted by the artist. They're fine for small and medium motion; big motions reveal their plain shapes.
- New drawings, not from the artist: all mouth shapes, closed/happy eyes, brow variants, small pupils, blush, ears, shadows and the sweat drop.
  They're drawn in her line weight and colours. Hand poses and the other effects are traced from the sheet's small panels, so they have less detail.
  The sheet's "Fist" is a half-closed hand.
- Colours: hologram blue fill, black lines, as chosen. Each part is its own layer, so recolouring is a fill per layer.
''')
print('rig notes written')

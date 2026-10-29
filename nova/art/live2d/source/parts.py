# Nova's parts: where each one is on the sheet (sheet px). Seeds are points inside a part;
# cuts are invisible walls that split her hair where the drawing has no line.
# L / R are HER left and right (her left is on the viewer's right).
SEEDS = {
  'Hair_Back_Left': [(230, 360), (249.3, 346.3)], 'Hair_Back_Right': [(86.7, 339.4), (68.4, 386.6), (73.8, 282.6), (59.6, 359.4)], 'Hair_Back_Base': [(76.4, 259.2), (215, 285), (67.1, 230.1), (232.9, 252.6)],
  'Hair_Top_Base': [(98, 180.3), (81.8, 171)], 'Hair_Bangs_Center': [(122, 200)], 'Hair_Bangs_Left': [(165, 180)],
  'Hair_Side_Left_Upper': [(208, 225)], 'Hair_Side_Left_Lower': [(204, 272)],
  'Hair_Side_Right_Upper': [(100, 232)], 'Hair_Side_Right_Lower': [(100, 285)],
  'Hair_Tip_Left_01': [(292, 402)], 'Hair_Tip_Left_02': [(270, 346)], 'Hair_Tip_Right_01': [(35, 358)], 'Hair_Tip_Right_02': [(60, 377)],
  'Halo_Base': [(116, 135), (130.2, 147.2)], 'Star_Hair_Clip': [(195, 176)],
  'Face_Base': [(149, 230)], 'Upper_Eyelid_Left': [(168.7, 220.6)], 'Upper_Eyelid_Right': [(123.3, 240.6)], 'Neck': [(168, 265.2), (186.9, 274.1)], 'Choker': [(165, 273)],
  'Torso_Skin': [(161, 290)], 'Torso_Clothing': [(140, 325), (178, 326)], 'Chest_Clothing_Detail': [(154, 318)],
  'Waist_Skin': [(153, 359), (182, 340), (131.6, 352.6)],
  'Arm_L_Upper_Skin': [(195, 320)], 'Arm_R_Upper_Skin': [(122, 330)],
  'Arm_L_Sleeve': [(234.4, 430.8), (209.1, 450.3)], 'Arm_R_Sleeve': [(82, 410)],
  'Hand_L_Relaxed': [(247.8, 468.8), (248.4, 453.4)], 'Hand_R_Relaxed': [(52, 464), (52, 480.8)],
  'Belt': [(140, 384), (190.4, 377), (177.8, 377.2), (125.6, 389.4), (135.1, 395.2), (114, 384.1), (179.1, 369.4)], 'Belt_Buckle': [(158, 393)], 'Belt_Straps': [(178.9, 424.1), (188.9, 462.6)], 'Belt_Hardware': [(186.2, 402.6), (177.3, 405.2)],
  'Skirt_Left_Panel': [(115, 425)], 'Skirt_Front_Panel': [(155, 428)], 'Skirt_Right_Panel': [(210, 415)], 'Skirt_Base': [(153.3, 454.3), (158.4, 443.7)],
  'Leg_R_Upper': [(115, 520)], 'Leg_L_Upper': [(195, 520)],
  'Boot_R_Base': [(100, 650)], 'Boot_L_Base': [(225, 680)],
  'Boot_R_Upper_Detail': [(68, 598), (57.8, 613.4)], 'Boot_L_Upper_Detail': [(238, 593), (258.4, 622.8)], 'Boot_R_Star': [(60.7, 702.6)], 'Boot_L_Star': [(251.8, 687.7)],
  'Boot_R_Sole': [(92.9, 731.9), (48, 758.3), (128, 736.1), (136.2, 735), (120.2, 727.7)], 'Boot_L_Sole': [(200, 782), (269.3, 742.6), (250.4, 768.8), (168, 739.9), (283.6, 725), (278.4, 734.6)],
}
CUTS = [
  [(107, 206), (110, 185), (137, 164)],            # top of the centre bang
  [(137, 164), (165, 152), (203, 149)],            # top of her left bang
  [(200, 209), (203, 149)],                        # her left bang / left side lock
  [(203, 149), (232, 150)],                        # top of her left side lock
  [(222, 238), (238, 234)],                        # her left side lock / back hair
  [(192, 257), (216, 257)],                        # her left side lock: upper / lower
  [(107, 206), (95, 195), (93, 222), (97, 248), (86, 268)],   # top and outer edge of her right side lock
  [(92, 255), (109, 255)],                         # her right side lock: upper / lower
  [(95, 195), (78, 199)],                          # top hair / back hair (her right)
  [(5, 260), (90, 260)],                           # back hair base / back hair (her right)
  [(196, 302), (246, 302)],                        # back hair base / back hair (her left)
  [(234, 339), (259, 313)], [(258, 402), (262, 371)],   # bases of her left tips
  [(68, 349), (57, 312)], [(68, 350), (85, 368)],       # bases of her right tips
  [(133, 385), (129, 452)], [(181, 380), (186, 452)],   # skirt panels
]

import math
def ell(cx, cy, rx, ry, n=48, a0=0):
    return [(cx + rx * math.cos(a0 + 2 * math.pi * i / n), cy + ry * math.sin(a0 + 2 * math.pi * i / n)) for i in range(n)]
def capsule(a, b, ra, rb, n=24):
    (x0, y0), (x1, y1) = a, b; ang = math.atan2(y1 - y0, x1 - x0)
    pts = [(x1 + rb * math.cos(ang - math.pi / 2 + math.pi * i / n), y1 + rb * math.sin(ang - math.pi / 2 + math.pi * i / n)) for i in range(n + 1)]
    pts += [(x0 + ra * math.cos(ang + math.pi / 2 + math.pi * i / n), y0 + ra * math.sin(ang + math.pi / 2 + math.pi * i / n)) for i in range(n + 1)]
    return pts

# the face: these shapes say which lines and areas belong to each eye, brow and so on
FEATURES = {   # part: (kind, polygon) - kind 'all' takes lines and fill, 'ink' only lines, 'fill' only fill
  'Eye_White_Left':  ('fill', [(156, 233), (160, 224), (166, 218), (176, 216.5), (186, 216), (192, 216.5), (197, 222), (196, 232), (188, 236), (178, 238.5), (168, 238), (158, 236.5)]),
  'Eye_White_Right': ('fill', [(111, 246), (116, 243.5), (124, 243), (130, 243.5), (136, 246), (135, 252), (130, 255), (121, 254.5), (114, 252)]),
  'Iris_Left':  ('all', ell(174.5, 225.8, 10.6, 12.4)),
  'Iris_Right': ('all', ell(129.2, 248.2, 6.9, 7.3)),
  'Pupil_Left':  ('ink', ell(174.3, 223.5, 4.4, 8.2)),
  'Pupil_Right': ('ink', ell(129.6, 245.2, 3.9, 4.6)),
  'Lower_Eyelid_Left':  ('ink', [(151, 236.2), (160, 235.6), (170, 236.4), (177, 237.6), (172, 241.5), (156, 241.5), (150, 239.5)]),
  'Lower_Eyelid_Right': ('ink', [(115, 251.4), (122, 253), (129, 254.3), (130, 258), (120, 257.6), (114, 255.4)]),
  'Upper_Eyelid_Left':  ('ink', [(146, 236), (150, 222), (160, 212), (175, 203), (195, 198), (199, 206), (196, 210.5), (196, 216.5), (186, 216.6), (175, 216.6), (166, 218.2), (160, 224.5), (156.5, 232.5), (152, 238.5)]),
  'Upper_Eyelid_Right': ('ink', [(104, 241), (112, 236), (125, 235.5), (135, 237.5), (138.5, 242), (138, 246.5), (133.2, 246.2), (129, 243.4), (124, 243), (116, 243.2), (111, 246.2), (106, 246)]),
  'Eyelashes_Left':  ('ink', [(195, 199), (207, 201), (208, 215.5), (197, 216.6), (196, 210.5), (199, 206), (181, 228), (190, 228), (190, 235), (181, 235)][:6] + []),
  'Eyelash_Low_Left': ('ink', [(180.5, 228), (190, 228), (190, 235.5), (180.5, 235.5)]),
  'Eyelashes_Right': ('ink', [(96, 240), (106, 240.5), (106, 249), (96, 250)]),
  'Eyebrow_Left':  ('ink', [(148.5, 215.5), (151, 209), (161.5, 198.5), (166.5, 199.5), (157, 212), (151.5, 217)]),
  'Eyebrow_Right': ('ink', [(110, 223), (120, 223.5), (120, 229.5), (110, 228.5)]),
  'Choker_Star': ('ink', [(153, 277.5), (164, 277.5), (164, 287), (153, 287)]),
}
FEATURE_ORDER = ['Choker_Star', 'Eye_White_Left', 'Eye_White_Right', 'Iris_Left', 'Iris_Right', 'Lower_Eyelid_Left', 'Lower_Eyelid_Right',
                 'Upper_Eyelid_Left', 'Upper_Eyelid_Right', 'Pupil_Left', 'Pupil_Right', 'Eyelashes_Left', 'Eyelash_Low_Left', 'Eyelashes_Right',
                 'Eyebrow_Left', 'Eyebrow_Right']
MERGE = {'Eyelash_Low_Left': 'Eyelashes_Left'}   # (two pieces, one layer)

# hidden overlap: where each part carries on underneath the parts in front of it (sheet px)
EXT = {
  # her long back hair carries on behind her body and arms
  'Hair_Back_Right': [[(96, 258), (150, 262), (150, 420), (104, 410)]],
  'Hair_Back_Left': [[(165, 300), (215, 300), (222, 410), (170, 420)]],
  'Hair_Back_Base': [[(150, 250), (232, 250), (240, 305), (150, 305)]],
  'Face_Base': [ell(150, 213, 46, 52), [(148, 196), (208, 196), (208, 244), (148, 244)], [(96, 234), (142, 234), (142, 260), (96, 260)]],
  'Neck': [[(147, 250), (192, 248), (194, 292), (146, 292)]],
  'Torso_Skin': [[(128, 284), (192, 284), (195, 348), (125, 348)]],
  'Waist_Skin': [[(124, 336), (196, 336), (199, 406), (120, 406)]],
  'Arm_R_Upper_Skin': [capsule((118, 330), (110, 378), 11, 11)],
  'Arm_L_Upper_Skin': [capsule((196, 330), (206, 378), 11, 11)],
  'Arm_R_Forearm_Skin': [capsule((110, 372), (63, 452), 9.5, 7)],
  'Arm_L_Forearm_Skin': [capsule((206, 372), (242, 452), 9.5, 7)],
  'Arm_R_Hand_Wrist': [capsule((66, 436), (58, 460), 7.5, 7.5)],
  'Arm_L_Hand_Wrist': [capsule((239, 436), (246, 460), 7.5, 7.5)],
  'Hand_R_Relaxed': [[(50, 428), (76, 428), (73, 452), (48, 452)]],
  'Hand_L_Relaxed': [[(228, 428), (253, 428), (256, 452), (231, 452)]],
  'Leg_R_Upper': [[(95, 392), (152, 392), (153, 446), (86, 446)], [(87, 556), (141, 556), (138, 602), (92, 602)]],
  'Leg_L_Upper': [[(165, 392), (222, 392), (233, 446), (164, 446)], [(169, 556), (229, 556), (226, 602), (173, 602)]],
  'Leg_R_Knee': [ell(115, 600, 22, 20)], 'Leg_L_Knee': [ell(200, 600, 22, 20)],
  'Leg_R_Lower': [capsule((115, 600), (105, 742), 20, 14)], 'Leg_L_Lower': [capsule((200, 600), (214, 742), 20, 14)],
  'Leg_R_Ankle': [ell(105, 746, 15, 13)], 'Leg_L_Ankle': [ell(214, 748, 15, 13)],
  'Boot_R_Sole': [[(44, 698), (140, 698), (146, 746), (38, 752)]],
  'Boot_L_Sole': [[(170, 702), (281, 702), (286, 746), (164, 746)]],
  'Skirt_Base': [[(102, 378), (224, 373), (240, 440), (160, 452), (90, 449)]],
  'Eye_White_Left': [FEATURES['Eye_White_Left'][1]], 'Eye_White_Right': [FEATURES['Eye_White_Right'][1]],
  'Iris_Left': [ell(174.5, 225.8, 10.6, 12.4)], 'Iris_Right': [ell(129.2, 248.2, 6.9, 7.3)],
  'Pupil_Left': [ell(174.3, 223.5, 4.4, 8.2)], 'Pupil_Right': [ell(129.6, 245.2, 3.9, 4.6)],
}
# how far (canvas px) each part also carries on under its neighbours in front (default: one line width)
SPREAD = {'Hair_': 55, 'Skirt_': 40, 'Torso_Clothing': 20, 'Belt': 18, 'Boot_': 20}

# back to front
Z = ['Hair_Tip_Left_01', 'Hair_Tip_Left_02', 'Hair_Tip_Right_01', 'Hair_Tip_Right_02', 'Hair_Back_Left', 'Hair_Back_Right', 'Hair_Back_Base',
     'Halo_Base',
     'Arm_R_Hand_Wrist', 'Arm_L_Hand_Wrist', 'Hand_R_Relaxed', 'Hand_L_Relaxed', 'Arm_R_Forearm_Skin', 'Arm_L_Forearm_Skin',
     'Neck', 'Torso_Skin', 'Waist_Skin', 'Torso_Clothing', 'Chest_Clothing_Detail', 'Choker', 'Choker_Star',
     'Arm_R_Upper_Skin', 'Arm_L_Upper_Skin', 'Arm_R_Sleeve', 'Arm_L_Sleeve',
     'Skirt_Base', 'Leg_R_Knee', 'Leg_L_Knee', 'Leg_R_Lower', 'Leg_L_Lower', 'Leg_R_Ankle', 'Leg_L_Ankle',
     'Leg_R_Upper', 'Leg_L_Upper', 'Boot_R_Sole', 'Boot_L_Sole', 'Boot_R_Base', 'Boot_L_Base', 'Boot_R_Upper_Detail', 'Boot_L_Upper_Detail', 'Boot_R_Star', 'Boot_L_Star',
     'Skirt_Left_Panel', 'Skirt_Right_Panel', 'Skirt_Front_Panel', 'Belt', 'Belt_Buckle', 'Belt_Straps', 'Belt_Hardware',
     'Face_Base', 'Eye_White_Left', 'Eye_White_Right', 'Iris_Left', 'Iris_Right', 'Pupil_Left', 'Pupil_Right',
     'Lower_Eyelid_Left', 'Lower_Eyelid_Right',
     'Hair_Side_Left_Lower', 'Hair_Side_Right_Lower', 'Hair_Side_Left_Upper', 'Hair_Side_Right_Upper',
     'Upper_Eyelid_Left', 'Upper_Eyelid_Right', 'Eyelashes_Left', 'Eyelashes_Right', 'Eyebrow_Left', 'Eyebrow_Right',
     'Hair_Bangs_Center', 'Hair_Bangs_Left', 'Hair_Top_Base', 'Star_Hair_Clip']

# the final stacking order follows the PSD folders (see groups.py)
from groups import STACK as _STACK
Z = [k for k in _STACK if k in Z]

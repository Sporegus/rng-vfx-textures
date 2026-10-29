# Nova's expressions, each assembled from her face parts (nothing redrawn per expression)
import json
from PIL import Image, ImageDraw, ImageFont
EYES = ['Eye_White_{s}', 'Iris_{s}', 'Pupil_{s}', 'Eye_Highlight_{s}', 'Upper_Eyelid_{s}', 'Lower_Eyelid_{s}', 'Eyelashes_{s}']
open_eye = lambda s: [e.format(s=s) for e in EYES]
EXPR = {   # hide / show (on top of the neutral face: Mouth_Neutral, Nose)
  'Neutral':   dict(hide=[], show=[]),
  'Happy':     dict(hide=['Mouth_Neutral', 'Eyebrow_Left', 'Eyebrow_Right'], show=['Mouth_Open_Medium', 'Eyebrow_Left_Raised', 'Eyebrow_Right_Raised']),
  'Excited':   dict(hide=['Mouth_Neutral', 'Eyebrow_Left', 'Eyebrow_Right'], show=['Mouth_Laugh', 'Eyebrow_Left_Raised', 'Eyebrow_Right_Raised', 'Effect_Sparkles']),
  'Smug':      dict(hide=['Mouth_Neutral'] + open_eye('Left'), show=['Mouth_Smirk', 'Eye_Closed_Left']),
  'Angry':     dict(hide=['Mouth_Neutral', 'Eyebrow_Left', 'Eyebrow_Right'], show=['Mouth_Frown', 'Eyebrow_Left_Angry', 'Eyebrow_Right_Angry', 'Effect_Angry_Mark']),
  'Confused':  dict(hide=['Mouth_Neutral', 'Eyebrow_Left', 'Eyebrow_Right'], show=['Mouth_Pout', 'Eyebrow_Left_Sad', 'Eyebrow_Right_Raised', 'Effect_Question_Mark']),
  'Surprised': dict(hide=['Mouth_Neutral', 'Eyebrow_Left', 'Eyebrow_Right'], show=['Mouth_Talking_O', 'Eyebrow_Left_Raised', 'Eyebrow_Right_Raised', 'Effect_Exclamation_Mark']),
  'Sad':       dict(hide=['Mouth_Neutral', 'Eyebrow_Left', 'Eyebrow_Right'], show=['Mouth_Frown', 'Eyebrow_Left_Sad', 'Eyebrow_Right_Sad']),
  'Sleepy':    dict(hide=open_eye('Left') + open_eye('Right'), show=['Eye_Closed_Left', 'Eye_Closed_Right', 'Effect_Sleep_Z']),
  'Teasing':   dict(hide=['Mouth_Neutral'] + open_eye('Left'), show=['Mouth_Open_Small', 'Eye_Happy_Left', 'Eyebrow_Right_Raised']),
  'Blushing':  dict(hide=['Mouth_Neutral', 'Eyebrow_Left', 'Eyebrow_Right'], show=['Mouth_Smile', 'Eyebrow_Left_Sad', 'Eyebrow_Right_Sad', 'Blush_Left', 'Blush_Right', 'Effect_Hearts']),
  'Shocked':   dict(hide=['Mouth_Neutral', 'Eyebrow_Left', 'Eyebrow_Right', 'Iris_Left', 'Iris_Right', 'Pupil_Left', 'Pupil_Right', 'Eye_Highlight_Left', 'Eye_Highlight_Right'],
                    show=['Mouth_Open_Large', 'Pupil_Small_Left', 'Pupil_Small_Right', 'Eyebrow_Left_Raised', 'Eyebrow_Right_Raised', 'Effect_Sweat_Drop']),
}
def stack(final_order):
    return final_order
if __name__ == '__main__':
    order = json.load(open('work/full_order.json'))
    visible = set(json.load(open('work/default_visible.json')))
    cache = {}
    L = lambda k: cache.setdefault(k, Image.open(f'work/layers/{k}.png').crop((900, 280, 2350, 1500)))
    tiles = []
    for name, r in EXPR.items():
        on = (visible - set(r['hide'])) | set(r['show'])
        im = Image.new('RGBA', (1450, 1220), (255, 255, 255, 0))
        for k in order:
            if k in on: im.alpha_composite(L(k))
        bg = Image.new('RGBA', im.size, (246, 248, 255, 255)); bg.alpha_composite(im)
        t = bg.convert('RGB').resize((435, 366)); d = ImageDraw.Draw(t)
        d.rectangle((0, 330, 435, 366), fill=(20, 24, 44)); d.text((12, 340), name, fill=(255, 255, 255), font=ImageFont.load_default(size=22))
        tiles.append(t)
    sheet = Image.new('RGB', (435 * 4, 366 * 3), (20, 24, 44))
    for i, t in enumerate(tiles): sheet.paste(t, ((i % 4) * 435, (i // 4) * 366))
    sheet.save('work/Nova_Expression_Preview.png'); print('ok')

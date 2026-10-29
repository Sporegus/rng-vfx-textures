import sys
from PIL import Image, ImageDraw
im = Image.open('sheet.png').convert('RGB')
def zoom(box, k, name, step=10):
    c = im.crop(box).resize(((box[2]-box[0])*k, (box[3]-box[1])*k), Image.LANCZOS)
    o = Image.new('RGB', c.size); o.paste(c)
    d = ImageDraw.Draw(o, 'RGBA')
    for y in range(box[1] - box[1] % step + step, box[3], step):
        Y = (y - box[1]) * k; d.line([(0, Y), (o.width, Y)], fill=(255, 0, 0, 70 if y % 50 else 150))
        d.text((2, Y - 10), str(y), fill=(220, 0, 0, 255))
    for x in range(box[0] - box[0] % step + step, box[2], step):
        X = (x - box[0]) * k; d.line([(X, 0), (X, o.height)], fill=(0, 90, 255, 70 if x % 50 else 150))
        d.text((X + 2, 2), str(x), fill=(0, 60, 220, 255))
    o.save(name)
a = sys.argv[1:]
zoom(tuple(map(int, a[:4])), int(a[4]), a[5])

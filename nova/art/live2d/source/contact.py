import numpy as np, json, sys
from PIL import Image, ImageDraw
order = json.load(open('work/order.json'))
names = sys.argv[2:] or order
cell = int(sys.argv[1]) if len(sys.argv) > 1 else 260
cols = 8; rows = (len(names) + cols - 1) // cols
sheet = Image.new('RGB', (cols * cell, rows * (cell + 16)), (60, 64, 92)); d = ImageDraw.Draw(sheet)
for i, k in enumerate(names):
    im = Image.open(f'work/layers/{k}.png'); bb = im.getbbox()
    x, y = (i % cols) * cell, (i // cols) * (cell + 16)
    if bb:
        c = im.crop(bb); c.thumbnail((cell - 8, cell - 8))
        bg = Image.new('RGB', c.size, (60, 64, 92)); bg.paste(c, (0, 0), c)
        sheet.paste(bg, (x + (cell - c.width) // 2, y + (cell - c.height) // 2))
    d.text((x + 4, y + cell), k, fill=(255, 255, 255))
sheet.save('work/contact.png'); print(sheet.size)

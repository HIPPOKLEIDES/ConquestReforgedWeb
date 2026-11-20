# Landing page picture for the "Minecraft Fashion" entry of the Bedrock card (site.json bedrockCard):
# the items for sale, standing on wooden shelves on a dark, warmly lit background.
#   python -I landing-image.py <out.webp> <still.webp> [<still.webp> ...]
# Called by fetch-persona.mjs. The card shows the picture whole (tall, about 1 : 2.2) and, in its menu, as a
# wide strip from the top (site.json "pos").
import sys
from PIL import Image, ImageDraw, ImageFilter

W, H = 720, 1440
out, files = sys.argv[1], sys.argv[2:9]

# background: dark wood, warm light from above the middle
bg = Image.new('RGB', (W, H), (13, 9, 6))
glow = Image.new('L', (W, H), 0)
ImageDraw.Draw(glow).ellipse((-W * .25, H * .05, W * 1.25, H * .85), fill=255)
glow = glow.filter(ImageFilter.GaussianBlur(170))
bg = Image.composite(Image.new('RGB', (W, H), (74, 52, 33)), bg, glow)
# faint vertical planks
planks = Image.new('L', (W, H), 0)
d = ImageDraw.Draw(planks)
for x in range(0, W, 90):
    d.line((x, 0, x, H), fill=40, width=3)
bg = Image.composite(Image.new('RGB', (W, H), (8, 5, 3)), bg, planks.filter(ImageFilter.GaussianBlur(1)))

def piece(f):
    im = Image.open(f).convert('RGBA')
    return im.crop(im.getchannel('A').point(lambda a: 255 if a > 24 else 0).getbbox())

pieces = [piece(f) for f in files]
# the card puts its logo and title over the middle, so that stays empty: the first two items on a top shelf
# (also what the card's menu strip shows), the rest in rows of two below the title
rows = [(H * .04, H * .27, pieces[:2])]
rest = [pieces[i:i + 2] for i in range(2, len(pieces), 2)]
for r, row in enumerate(rest):
    t = H * .60 + H * .37 * r / len(rest)
    rows.append((t, t + H * .37 / len(rest), row))
for t, b, row in rows:
    rh = b - t
    shelf_y = int(b - rh * .06)
    # shelf board with a shadow under it
    sh = Image.new('L', (W, H), 0)
    ImageDraw.Draw(sh).rectangle((30, shelf_y + 8, W - 30, shelf_y + 40), fill=200)
    bg = Image.composite(Image.new('RGB', (W, H), (0, 0, 0)), bg, sh.filter(ImageFilter.GaussianBlur(14)))
    d = ImageDraw.Draw(bg)
    d.rectangle((24, shelf_y, W - 24, shelf_y + 16), fill=(84, 58, 34))
    d.rectangle((24, shelf_y + 6, W - 24, shelf_y + 16), fill=(52, 36, 22))
    d.line((24, shelf_y, W - 24, shelf_y), fill=(176, 116, 52), width=2)
    cw = W / len(row)
    for c, im in enumerate(row):
        s = min(cw * .8 / im.width, rh * .78 / im.height, 2.2)
        im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
        x = int(cw * c + (cw - im.width) / 2)
        y = shelf_y - im.height + 4
        # soft contact shadow, then the piece
        cs = Image.new('L', (W, H), 0)
        ImageDraw.Draw(cs).ellipse((x + im.width * .12, shelf_y - 10, x + im.width * .88, shelf_y + 12), fill=170)
        bg = Image.composite(Image.new('RGB', (W, H), (0, 0, 0)), bg, cs.filter(ImageFilter.GaussianBlur(10)))
        bg.paste(im, (x, y), im)

# darken the edges a little
v = Image.new('L', (W, H), 0)
ImageDraw.Draw(v).rectangle((0, 0, W, H), outline=255, width=60)
bg = Image.composite(Image.new('RGB', (W, H), (0, 0, 0)), bg, v.filter(ImageFilter.GaussianBlur(60)).point(lambda a: a * .7))
bg.save(out, 'WEBP', quality=86, method=6)
print('wrote', out)

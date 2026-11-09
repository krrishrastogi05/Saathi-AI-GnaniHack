"""Remove the solid background from the speaking GIFs and save animated WebP with soft alpha.

Usage: python tools/key_speaking.py
Reads assets/{male,female}_speaking_transparent.gif, writes web/public/avatars/{male,female}-speaking.webp.
Only background connected to the image border is removed, so blue clothes inside the figure stay.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageSequence, ImageChops

ROOT = Path(__file__).parent.parent
KEY = (255, 0, 255)


def cut(frame):
    rgb = frame.convert('RGB')
    w, h = rgb.size
    filled = rgb.copy()
    for xy in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1), (w // 2, 0), (0, h // 2), (w - 1, h // 2)]:
        if filled.getpixel(xy) != KEY:
            ImageDraw.floodfill(filled, xy, KEY, thresh=60)
    diff = ImageChops.difference(filled, Image.new('RGB', (w, h), KEY)).convert('L')
    alpha = diff.point(lambda v: 0 if v == 0 else 255)
    alpha = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))  # trim teal fringe, soften edge
    out = rgb.convert('RGBA')
    out.putalpha(alpha)
    return out


for who in ('male', 'female'):
    src = Image.open(ROOT / 'assets' / f'{who}_speaking_transparent.gif')
    frames, durs = [], []
    for f in ImageSequence.Iterator(src):
        frames.append(cut(f))
        durs.append(f.info.get('duration', 160))
    dst = ROOT / 'web' / 'public' / 'avatars' / f'{who}-speaking.webp'
    frames[0].save(dst, save_all=True, append_images=frames[1:], duration=durs, loop=0, lossless=False, quality=90, method=6)
    print('wrote', dst.name, len(frames), 'frames')

"""Cut the brand avatar sheet into PNGs for the app.

Usage: python tools/crop_avatars.py assets/avatar-sheet.png
Boxes are in the 1536x1024 sheet layout and scale to the real image size.
Output: web/public/avatars/{male,female}-{portrait,happy,thinking,surprised,listening,wink}.png
"""
import sys
from pathlib import Path
from PIL import Image

W, H = 1536, 1024
BOXES = {
    'male-portrait': (25, 42, 455, 512),
    'female-portrait': (466, 42, 880, 512),
}
EXPR = ['happy', 'thinking', 'surprised', 'listening', 'wink']
COLS = [40, 170, 300, 430, 560]  # left edge of each expression cell
for i, e in enumerate(EXPR):
    BOXES[f'male-{e}'] = (COLS[i], 622, COLS[i] + 125, 752)
    BOXES[f'female-{e}'] = (COLS[i], 815, COLS[i] + 125, 945)

sheet = Path(sys.argv[1])
im = Image.open(sheet).convert('RGBA')
sx, sy = im.width / W, im.height / H
out = Path(__file__).parent.parent / "web" / "public" / "avatars"
for name, (l, t, r, b) in BOXES.items():
    tile = im.crop((round(l * sx), round(t * sy), round(r * sx), round(b * sy)))
    tile.thumbnail((320, 320))  # portraits are shown at most ~160px; 2x for sharp phone screens
    tile.save(out / f'{name}.png', optimize=True)
    print('wrote', name)

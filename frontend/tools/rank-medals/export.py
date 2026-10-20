"""Rank medallion stills: masters -> public/assets/ranks/medals/<TIER>-<px>.webp

    node tools/rank-medals/render.mjs <masters> 1536 <tiers>   # see render.mjs
    python3 tools/rank-medals/export.py <masters>

Each family is cropped to one square that holds all its divisions (laurels and
crest included), so a family's divisions line up and fill the space alike.
"""
import glob
import os
import sys

from PIL import Image

masters = sys.argv[1]
out = os.path.join(os.path.dirname(__file__), "..", "..", "public", "assets", "ranks", "medals")
os.makedirs(out, exist_ok=True)
ims = {os.path.basename(f)[:-4]: Image.open(f).convert("RGBA") for f in glob.glob(os.path.join(masters, "*.png"))}
W = next(iter(ims.values())).width
boxes = {}
for key, im in ims.items():
    b = im.split()[3].point(lambda v: 255 if v > 6 else 0).getbbox()
    fam = key.split("_")[0]
    u = boxes.get(fam, b)
    boxes[fam] = (min(u[0], b[0]), min(u[1], b[1]), max(u[2], b[2]), max(u[3], b[3]))
# The sealed medallion has no laurels or crest; give it the same room the
# finished medallions use, so it sits at the same size beside them.
ROOM = {"SEALED": 1.36}
crops = {}
for fam, (x0, y0, x1, y1) in boxes.items():
    cx, cy, half = (x0 + x1) / 2, (y0 + y1) / 2, max(x1 - x0, y1 - y0) / 2 * ROOM.get(fam, 1.04)
    crops[fam] = (int(cx - half), int(cy - half), int(cx + half), int(cy + half))
total = 0
for key, im in sorted(ims.items()):
    c = crops[key.split("_")[0]]
    sq = Image.new("RGBA", (c[2] - c[0], c[3] - c[1]), (0, 0, 0, 0))
    sq.alpha_composite(im.crop((max(0, c[0]), max(0, c[1]), min(W, c[2]), min(W, c[3]))), (max(0, -c[0]), max(0, -c[1])))
    for px in (192, 384, 768):
        path = os.path.join(out, f"{key}-{px}.webp")
        sq.resize((px, px), Image.LANCZOS).save(path, "WEBP", quality=90, method=6)
        total += os.path.getsize(path)
print(len(ims), "medallions,", total // 1024, "KB")

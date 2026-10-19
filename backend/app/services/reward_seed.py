"""The opening catalogue (2026-10-18): the 16 gifts from the old portal's
Reward Charts, with tidied names, their photos (bundled in
app/assets/rewards) and prices re-tuned to the coin system.

Prices are weeks of steady work: a student doing 3 DPS sheets a week earns
about 200 coins (live data, 18 Oct: median 58 a week, top quarter 113,
regular students 216-361). 19 Oct (Shailesh): rewards start at 2,000 coins
and climb gradually to 6,800, so the cheapest gift is about 10 weeks of
steady work and the backpack about 34; they must be earned. Seeding adds
missing items only and never overwrites an admin's edits (seed_key)."""
from __future__ import annotations

import shutil
from pathlib import Path

from sqlalchemy.orm import Session

from app.models import RewardItem
from app.services.reward_images import REWARD_UPLOAD_DIR

ASSETS = Path(__file__).resolve().parent.parent / "assets" / "rewards"

# (seed key, name, description, coins)
OPENING_ITEMS = [
    ("writing-kit", "Hauser XO Writing Kit", "A complete writing set: pens, pencil, ruler, sharpener and eraser in one pack.", 2000),
    ("mandala-book", "Mandala Colouring Book", "Page after page of mandala patterns to colour in, slowly and calmly.", 2200),
    ("gel-pens-12", "Luxor Gelaxy Gel Pens, 12 Colours", "Refillable gel pens in 12 bright colours.", 2400),
    ("flying-disc", "Skydisc Flying Disc", "An aerodynamic flying disc for the park, the beach or the playground.", 2600),
    ("tic-tac-toe-3d", "3D Tic-Tac-Toe", "The classic game played in three dimensions. Think two moves ahead to win.", 2800),
    ("gel-pen-jar", "Cello Aqua Gel Pen Jar, 25 Pens", "A jar of 25 smooth, waterproof blue gel pens.", 3000),
    ("india-map-jigsaw", "India Map Jigsaw, 104 Pieces", "Piece together every state of India in this 104-piece puzzle.", 3300),
    ("sliding-puzzle", "Drift Number Sliding Puzzle", "The classic 15 puzzle with magnetic tiles: slide them back into order.", 3600),
    ("dual-tip-markers", "Dual-Tip Art Markers, 12 Colours", "A marker on one end and a highlighter on the other, in 12 colours.", 3900),
    ("brush-pens-24", "Dual-Tip Brush Pens, 24 Shades", "A brush tip and a fine liner in 24 shades, for drawing and lettering.", 4200),
    ("steel-bottle", "PEXPO Steel Water Bottle, 1 Litre", "A stainless steel sports bottle with a sipper cap.", 4500),
    ("parker-pen", "Parker Vector Ball Pen", "The classic Parker Vector with a chrome trim.", 4900),
    ("football", "Vector X Football, Size 5", "A durable match ball for turf, grass and hard ground.", 5300),
    ("science-kit", "Electricity & Magnetism Science Kit", "More than 100 experiments with a motor, magnets and circuits.", 5700),
    ("dartboard", "Magnetic Dartboard, 15 Inch", "Magnetic darts that stick without a point, with 4 darts, for indoors and out.", 6200),
    ("backpack", "Lightweight School Backpack", "A roomy, light backpack for school and days out.", 6800),
]


def _SeedImage(Key: str) -> str | None:
    Source = ASSETS / f"{Key}.webp"
    if not Source.exists():
        return None
    REWARD_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    Target = REWARD_UPLOAD_DIR / f"starter-{Key}.webp"
    if not Target.exists():
        shutil.copyfile(Source, Target)
    return f"/uploads/rewards/{Target.name}"


# 19 Oct re-price: the opening prices (18 Oct) -> the new ladder. Applied once
# at start-up to items still at their opening price, so a price an admin has
# already changed in the Catalogue is left alone. Rewards already unlocked keep
# the price they were unlocked at (stored on the order).
OPENING_PRICES_18_OCT = {
    "writing-kit": 800, "mandala-book": 1000, "gel-pens-12": 1200, "flying-disc": 1400,
    "tic-tac-toe-3d": 1600, "gel-pen-jar": 1800, "india-map-jigsaw": 2000, "sliding-puzzle": 2200,
    "dual-tip-markers": 2400, "brush-pens-24": 2800, "steel-bottle": 3200, "parker-pen": 3600,
    "football": 4000, "science-kit": 4400, "dartboard": 4800, "backpack": 5200,
}


def ApplyRepriceOct19(Db: Session) -> int:
    New = {Key: Price for Key, _, _, Price in OPENING_ITEMS}
    Changed = 0
    for Item in Db.query(RewardItem).filter(RewardItem.seed_key.in_(list(OPENING_PRICES_18_OCT))).all():
        if Item.price_coins == OPENING_PRICES_18_OCT[Item.seed_key] and Item.price_coins != New[Item.seed_key]:
            Item.price_coins = New[Item.seed_key]
            Changed += 1
    if Changed:
        Db.commit()
    return Changed


def SeedRewardItems(Db: Session) -> int:
    Known = {Key for (Key,) in Db.query(RewardItem.seed_key).filter(RewardItem.seed_key.isnot(None)).all()}
    Added = 0
    for Index, (Key, Name, Description, Price) in enumerate(OPENING_ITEMS):
        if Key in Known:
            _SeedImage(Key)  # a fresh server still gets the photo file
            continue
        Db.add(RewardItem(seed_key=Key, name=Name, description=Description, price_coins=Price, image_url=_SeedImage(Key), sort_order=(Index + 1) * 10, is_active=True))
        Added += 1
    if Added:
        Db.commit()
    ApplyRepriceOct19(Db)
    return Added

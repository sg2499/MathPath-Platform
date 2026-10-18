"""Reward photos (2026-10-18): every photo is checked, turned the right way
up, padded to a square and saved as an 800px WebP under uploads/rewards/
(kept across deploys, like student photos). Pillow comes with qrcode[pil]."""
from __future__ import annotations

import io
import secrets
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError

REWARD_UPLOAD_DIR = Path("uploads/rewards")
MAX_BYTES = 5 * 1024 * 1024
SIDE = 800


class RewardImageError(ValueError):
    pass


def SquareWebp(Data: bytes) -> bytes:
    if not Data:
        raise RewardImageError("Choose a photo to upload.")
    if len(Data) > MAX_BYTES:
        raise RewardImageError("The photo is bigger than 5 MB. Choose a smaller one.")
    try:
        with Image.open(io.BytesIO(Data)) as Probe:
            Probe.verify()
        Picture = Image.open(io.BytesIO(Data))
        Picture.load()
    except (UnidentifiedImageError, OSError, SyntaxError):
        raise RewardImageError("That file isn't a photo we can read. Use a JPG, PNG or WebP.")
    if Picture.format not in ("JPEG", "PNG", "WEBP"):
        raise RewardImageError("Use a JPG, PNG or WebP photo.")
    if Picture.width < 200 or Picture.height < 200:
        raise RewardImageError("The photo is too small. Use one at least 200 × 200 pixels.")
    Picture = ImageOps.exif_transpose(Picture)
    HasAlpha = Picture.mode in ("RGBA", "LA") or (Picture.mode == "P" and "transparency" in Picture.info)
    Picture = Picture.convert("RGBA" if HasAlpha else "RGB")
    Picture.thumbnail((SIDE * 4, SIDE * 4))
    Side = int(max(Picture.size) * 1.08)
    Canvas = Image.new("RGBA" if HasAlpha else "RGB", (Side, Side), (255, 255, 255, 0) if HasAlpha else (255, 255, 255))
    Canvas.paste(Picture, ((Side - Picture.width) // 2, (Side - Picture.height) // 2), Picture if HasAlpha else None)
    Canvas = Canvas.resize((SIDE, SIDE), Image.LANCZOS)
    Out = io.BytesIO()
    Canvas.save(Out, "WEBP", quality=84, method=6)
    return Out.getvalue()


def SaveRewardImage(Data: bytes, Prefix: str) -> str:
    REWARD_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    Safe = "".join(Ch if Ch.isalnum() or Ch in "-_" else "-" for Ch in Prefix)[:40] or "reward"
    Name = f"{Safe}-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}-{secrets.token_hex(3)}.webp"
    (REWARD_UPLOAD_DIR / Name).write_bytes(SquareWebp(Data))
    return f"/uploads/rewards/{Name}"

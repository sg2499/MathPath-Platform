"""The rank ladder exists twice: the server's RANK_TIERS and the copy the
frontend uses for the rank cut scene (frontend/lib/rankTiers.ts). This keeps
the two identical, so "N XP to Bronze II" always matches what the server does."""
import pathlib
import re

from app.services.economy_service import RANK_TIERS


def test_frontend_rank_ladder_matches_the_server():
    ts = (pathlib.Path(__file__).resolve().parents[2] / "frontend" / "lib" / "rankTiers.ts").read_text()
    rows = [(t, int(x)) for t, x in re.findall(r'\{ tier: "([A-Z_]+)", xp: (\d+) \}', ts)]
    assert rows == [(r["tier"], r["xp"]) for r in RANK_TIERS]

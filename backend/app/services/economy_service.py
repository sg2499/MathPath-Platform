import random
from typing import Optional, Dict, Any, Tuple
from sqlalchemy.orm import Session
from app.models.models import UserEconomy, EconomyTransaction, CollectiblesDictionary, UserCollectibles

# ---------------------------------------------------------
# AAA GAMIFICATION PROGRESSION CURVE
# ---------------------------------------------------------
# 34 Tier system based on R6 Siege.
# The curve gets exponentially steeper in Emerald and Diamond.
RANK_TIERS = [
    {"tier": "COPPER_V", "xp": 0},
    {"tier": "COPPER_IV", "xp": 500},
    {"tier": "COPPER_III", "xp": 1100},
    {"tier": "COPPER_II", "xp": 1800},
    {"tier": "COPPER_I", "xp": 2600},

    {"tier": "BRONZE_V", "xp": 3500},
    {"tier": "BRONZE_IV", "xp": 4500},
    {"tier": "BRONZE_III", "xp": 5600},
    {"tier": "BRONZE_II", "xp": 6800},
    {"tier": "BRONZE_I", "xp": 8100},

    {"tier": "SILVER_V", "xp": 9500},
    {"tier": "SILVER_IV", "xp": 11000},
    {"tier": "SILVER_III", "xp": 12600},
    {"tier": "SILVER_II", "xp": 14300},
    {"tier": "SILVER_I", "xp": 16100},

    {"tier": "GOLD_V", "xp": 18000},
    {"tier": "GOLD_IV", "xp": 20000},
    {"tier": "GOLD_III", "xp": 22100},
    {"tier": "GOLD_II", "xp": 24300},
    {"tier": "GOLD_I", "xp": 26600},

    {"tier": "PLATINUM_V", "xp": 29000},
    {"tier": "PLATINUM_IV", "xp": 31500},
    {"tier": "PLATINUM_III", "xp": 34100},
    {"tier": "PLATINUM_II", "xp": 36800},
    {"tier": "PLATINUM_I", "xp": 39600},

    {"tier": "EMERALD_V", "xp": 43000},
    {"tier": "EMERALD_IV", "xp": 46600},
    {"tier": "EMERALD_III", "xp": 50400},
    {"tier": "EMERALD_II", "xp": 54400},
    {"tier": "EMERALD_I", "xp": 58600},

    {"tier": "DIAMOND_III", "xp": 65000},
    {"tier": "DIAMOND_II", "xp": 72000},
    {"tier": "DIAMOND_I", "xp": 80000},

    {"tier": "CHAMPION", "xp": 100000}, # Infinite Cap
]

def calculate_rank_from_xp(xp: int) -> str:
    """Evaluates absolute XP and returns the precise Rank Tier string."""
    current_tier = "COPPER_V"
    for r in RANK_TIERS:
        if xp >= r["xp"]:
            current_tier = r["tier"]
        else:
            break
    return current_tier

# ---------------------------------------------------------
# RNG LOOT DROP ENGINE
# ---------------------------------------------------------
RARITY_WEIGHTS = {
    "COMMON": 60.0,
    "UNCOMMON": 25.0,
    "RARE": 10.0,
    "EPIC": 4.0,
    "LEGENDARY": 1.0
}

def roll_loot_drop(base_chance_percent: float, multiplier: float = 1.0) -> bool:
    """
    Rolls a dice to see if a loot pack drops based on performance.
    E.g., completing a Mock might have a 20% base chance. A perfect score applies a 2.5x multiplier (50%).
    """
    final_chance = min(base_chance_percent * multiplier, 100.0)
    roll = random.uniform(0.0, 100.0)
    return roll <= final_chance

def roll_rarity(boost_luck: bool = False) -> str:
    """
    Rolls the RNG wheel for the rarity of an item.
    If 'boost_luck' is True (e.g. from an Elite Chest), Common is eliminated.
    """
    weights = RARITY_WEIGHTS.copy()
    if boost_luck:
        weights["COMMON"] = 0.0
        weights["UNCOMMON"] = 50.0
        weights["RARE"] = 30.0
        weights["EPIC"] = 15.0
        weights["LEGENDARY"] = 5.0

    total_weight = sum(weights.values())
    roll = random.uniform(0, total_weight)
    
    current = 0.0
    for rarity, weight in weights.items():
        if weight == 0:
            continue
        current += weight
        if roll <= current:
            return rarity
    return "COMMON"

# ---------------------------------------------------------
# LEDGER & TRANSACTION SERVICE
# ---------------------------------------------------------

class EconomyService:
    @staticmethod
    def get_user_economy(db: Session, user_id: str) -> UserEconomy:
        econ = db.query(UserEconomy).filter(UserEconomy.user_id == user_id).first()
        if not econ:
            econ = UserEconomy(user_id=user_id, current_xp=0, coin_balance=0, lifetime_coins_earned=0, quantum_fragments=0)
            db.add(econ)
            db.commit()
            db.refresh(econ)
        return econ

    @staticmethod
    def award_xp_and_coins(
        db: Session, 
        user_id: str, 
        xp_amount: int, 
        coin_amount: int, 
        source_action: str, 
        reference_id: Optional[str] = None
    ) -> Tuple[UserEconomy, bool]:
        """
        The absolute immutable ledger transaction. 
        Safely awards XP and Coins, logs the transaction, and checks for Rank Ups.
        """
        econ = EconomyService.get_user_economy(db, user_id)
        
        # 1. Update Balances
        econ.current_xp += xp_amount
        if coin_amount > 0:
            econ.coin_balance += coin_amount
            econ.lifetime_coins_earned += coin_amount
        
        # 2. Evaluate Rank Jump
        old_rank = econ.current_rank_tier
        new_rank = calculate_rank_from_xp(econ.current_xp)
        ranked_up = old_rank != new_rank
        if ranked_up:
            econ.current_rank_tier = new_rank
            
        # 3. Log the Transaction Immutably
        if xp_amount > 0 or coin_amount > 0:
            tx = EconomyTransaction(
                user_id=user_id,
                transaction_type="EARN",
                amount_xp=xp_amount,
                amount_coins=coin_amount,
                source_action=source_action,
                reference_id=reference_id
            )
            db.add(tx)
            
        db.commit()
        db.refresh(econ)
        
        return econ, ranked_up

    @staticmethod
    def _accuracy_multiplier(accuracy_percent: float) -> float:
        """The one performance-to-reward curve used everywhere in the economy.

        Shared by every activity type (DPS, assessment, mock) so "how much
        better performance pays" is decided in exactly one place. <50% = 0.5x,
        50-75% = 1.0x, 75-90% = 1.5x, 90-100% (not perfect) = 2.0x, a perfect
        100% = 2.5x.
        """
        if accuracy_percent == 100.0:
            return 2.5
        if accuracy_percent >= 90.0:
            return 2.0
        if accuracy_percent >= 75.0:
            return 1.5
        if accuracy_percent < 50.0:
            return 0.5
        return 1.0

    @staticmethod
    def _accuracy_tier_label(accuracy_percent: float) -> str:
        """Display-facing tier name for _accuracy_multiplier's bands, so the
        reward modal can show a plain-language tier chip ("Excellent") next
        to the bonus it produced, instead of a raw percentage or multiplier.
        """
        if accuracy_percent == 100.0:
            return "PERFECT"
        if accuracy_percent >= 90.0:
            return "EXCELLENT"
        if accuracy_percent >= 75.0:
            return "GREAT"
        if accuracy_percent < 50.0:
            return "NEEDS_PRACTICE"
        return "FAIR"

    @staticmethod
    def evaluate_assignment_performance(
        db: Session,
        user_id: str,
        accuracy_percent: float,
        base_xp: int = 200,
        assignment_id: str = "N/A"
    ) -> Dict[str, Any]:
        """
        Legacy flat-base-XP engine. Superseded by evaluate_activity_performance()
        below for all live completion paths (DPS, assessments, mocks) as of the
        student-portal economy unification -- kept only because
        backend/scripts/backfill_mock_gamification.py (already run to
        completion for the round-9 backfill) references it and shouldn't be
        rewritten retroactively. Do not wire this into any new call site.
        """
        multiplier = EconomyService._accuracy_multiplier(accuracy_percent)

        final_xp = int(base_xp * multiplier)
        final_coins = int(25 * multiplier) if accuracy_percent >= 50.0 else 0

        # RNG Drop chance for an Alpha Pack (Base 10% * Multiplier)
        dropped_pack = roll_loot_drop(base_chance_percent=10.0, multiplier=multiplier)
        pack_type = None
        if dropped_pack:
            # If accuracy is perfect, drop an Elite Chest instead
            pack_type = "ELITE_CHEST" if accuracy_percent == 100.0 else "ALPHA_PACK"

        # Update Ledger
        econ, ranked_up = EconomyService.award_xp_and_coins(
            db, user_id, final_xp, final_coins,
            source_action="ASSIGNMENT_COMPLETION", reference_id=assignment_id
        )

        return {
            "awarded_xp": final_xp,
            "awarded_coins": final_coins,
            "new_rank": econ.current_rank_tier,
            "ranked_up": ranked_up,
            "dropped_pack": pack_type
        }

    # ---------------------------------------------------------
    # UNIFIED ACTIVITY ECONOMY (DPS / ASSESSMENT / MOCK)
    # ---------------------------------------------------------
    # One formula for every activity type a student can complete, so XP and
    # coins are fair and consistent regardless of which module or level an
    # activity belongs to, and regardless of how long any individual DPS
    # sheet, assessment, or mock exam happens to be configured for.
    #
    # Reward has two layers, both driven by real performance data:
    #   1. Base pay is proportional to the activity's own admin-configured
    #      allotted duration_seconds (never the student's actual time taken).
    #      This means the size of the reward reflects the size of the
    #      activity -- a 30-minute mock always pays a bigger base than a
    #      20-minute DPS sheet -- and a slower (but still accurate) student
    #      is never punished for the sheet being long.
    #   2. On top of that base, TWO multipliers stack: an accuracy multiplier
    #      (see _accuracy_multiplier, unchanged) and a speed multiplier (see
    #      _speed_bonus, new as of 2026-08-26) based on how much of the
    #      allotted time the student actually used. This is what makes two
    #      students who both score 90% on the same 20-minute sheet earn
    #      different rewards if one finished in 10 minutes and the other used
    #      the full 20 -- speed now matters, on top of accuracy, exactly as
    #      requested. The speed bonus is deliberately the smaller of the two
    #      multipliers (a "nudge", not a second accuracy-sized swing), and it
    #      never goes negative -- a student who uses the full allotted time,
    #      or whose timing data is missing/invalid, simply gets no bonus,
    #      never a penalty.
    #
    # Every number returned to the frontend under "reward_breakdown" is
    # expressed as three additions (base, then an accuracy bonus, then a
    # speed bonus) that sum to EXACTLY the awarded total -- never as a
    # multiplier -- so the reward modal can show a parent or student "why" in
    # plain addition instead of math they'd have to be a developer to follow.
    # The speed bonus figure is deliberately computed as a REMAINDER (total
    # minus the other two rounded pieces) rather than independently rounded,
    # so the three displayed numbers always sum to the displayed total with
    # no possibility of an off-by-one mismatch.
    #
    # Because every module/level can configure its own duration per DPS,
    # assessment, and mock, this formula never needs manual re-tuning as new
    # content is added -- it reads directly from each attempt's own stored
    # duration_seconds every time. (DPS sheets are now a flat 1200 seconds --
    # 20 minutes -- across every module/level/lesson as of the 2026-08-26
    # timer standardization, so their base pay is effectively a constant; the
    # formula doesn't special-case this, it just falls out of every DPS
    # attempt sharing the same duration_seconds.)
    GAMIFICATION_XP_RATE_PER_MINUTE = 5.0    # weight-1.0 (DPS) baseline: a flat 20-min DPS sheet = 100 base XP
    GAMIFICATION_COIN_RATE_PER_MINUTE = 2.0  # weight-1.0 (DPS) baseline: a flat 20-min DPS sheet = 40 base coins
    ACTIVITY_WEIGHTS = {
        "DPS": 1.0,          # routine, frequent, lowest stakes
        "ASSESSMENT": 1.3,   # gates level progression
        "MOCK": 1.5,         # competitive, leaderboard-visible, highest stakes
    }
    MIN_DURATION_MINUTES = 1.0
    MAX_DURATION_MINUTES = 180.0  # guards against a misconfigured (0, negative, or absurd) duration ever producing a buggy payout

    # Speed bonus bands, keyed off how much of the allotted time the student
    # actually used (time_taken_seconds / duration_seconds). Deliberately
    # "subtle" per product decision -- these are nudges on top of the
    # accuracy multiplier, never a second accuracy-sized swing, and never a
    # penalty for using the full time. Ordered fastest-first; the first band
    # whose ratio ceiling isn't exceeded wins.
    SPEED_TIERS = [
        {"tier": "LIGHTNING", "max_ratio": 0.50, "bonus": 0.15},
        {"tier": "FAST", "max_ratio": 0.75, "bonus": 0.08},
    ]
    SPEED_TIER_STEADY = "STEADY"  # slower than the last band above, or missing/invalid timing data

    @staticmethod
    def _speed_bonus(time_taken_seconds: int | float | None, duration_seconds: int | float | None) -> Tuple[str, float]:
        """Returns (tier_label, bonus_fraction), e.g. ("FAST", 0.08).

        Missing or invalid timing data (None, zero/negative allotted
        duration) always resolves to STEADY / 0.0 -- never guesses, and
        never turns into a penalty.
        """
        if not time_taken_seconds or not duration_seconds or duration_seconds <= 0:
            return EconomyService.SPEED_TIER_STEADY, 0.0
        ratio = max(0.0, float(time_taken_seconds)) / float(duration_seconds)
        for band in EconomyService.SPEED_TIERS:
            if ratio <= band["max_ratio"]:
                return band["tier"], band["bonus"]
        return EconomyService.SPEED_TIER_STEADY, 0.0

    @staticmethod
    def evaluate_activity_performance(
        db: Session,
        user_id: str,
        accuracy_percent: float,
        activity_type: str,
        duration_seconds: int | float | None,
        time_taken_seconds: int | float | None = None,
        reference_id: str = "N/A",
    ) -> Dict[str, Any]:
        """
        The single XP/coin formula for DPS sheets, assessments, and mock
        exams alike. See the module-level comment above for the two-layer
        (allotted-duration base, then accuracy + speed multipliers) design.
        """
        weight = EconomyService.ACTIVITY_WEIGHTS.get(activity_type, 1.0)
        raw_minutes = float(duration_seconds or 0) / 60.0
        duration_minutes = max(
            EconomyService.MIN_DURATION_MINUTES,
            min(raw_minutes, EconomyService.MAX_DURATION_MINUTES),
        )

        accuracy_multiplier = EconomyService._accuracy_multiplier(accuracy_percent)
        accuracy_tier = EconomyService._accuracy_tier_label(accuracy_percent)
        speed_tier, speed_bonus_fraction = EconomyService._speed_bonus(time_taken_seconds, duration_seconds)

        base_xp = EconomyService.GAMIFICATION_XP_RATE_PER_MINUTE * duration_minutes * weight
        base_coins = EconomyService.GAMIFICATION_COIN_RATE_PER_MINUTE * duration_minutes * weight

        xp_after_accuracy = base_xp * accuracy_multiplier
        final_xp = max(0, round(xp_after_accuracy * (1.0 + speed_bonus_fraction)))

        coins_after_accuracy = base_coins * accuracy_multiplier
        final_coins = (
            max(0, round(coins_after_accuracy * (1.0 + speed_bonus_fraction)))
            if accuracy_percent >= 50.0
            else 0
        )

        # Addition-only breakdown for the reward modal. The speed bonus line
        # is a REMAINDER (total minus the other two rounded pieces), not an
        # independently-rounded figure, so base + accuracyBonus + speedBonus
        # always sums to exactly the awarded total shown above it -- see the
        # module comment for why this matters.
        xp_base_display = round(base_xp)
        xp_accuracy_bonus_display = round(xp_after_accuracy) - xp_base_display
        xp_speed_bonus_display = final_xp - xp_base_display - xp_accuracy_bonus_display

        if final_coins > 0:
            coins_base_display = round(base_coins)
            coins_accuracy_bonus_display = round(coins_after_accuracy) - coins_base_display
            coins_speed_bonus_display = final_coins - coins_base_display - coins_accuracy_bonus_display
        else:
            coins_base_display = coins_accuracy_bonus_display = coins_speed_bonus_display = 0

        # Loot-pack drops stay mock-exclusive for now -- Collector's Vault,
        # where a dropped pack would actually be seen and opened, isn't built
        # out yet for DPS/assessment content.
        dropped_pack = None
        pack_type = None
        if activity_type == "MOCK":
            dropped_pack = roll_loot_drop(base_chance_percent=10.0, multiplier=accuracy_multiplier)
            if dropped_pack:
                pack_type = "ELITE_CHEST" if accuracy_percent == 100.0 else "ALPHA_PACK"

        econ, ranked_up = EconomyService.award_xp_and_coins(
            db, user_id, final_xp, final_coins,
            source_action=f"{activity_type}_COMPLETION", reference_id=reference_id,
        )

        return {
            "awarded_xp": final_xp,
            "awarded_coins": final_coins,
            "new_rank": econ.current_rank_tier,
            "ranked_up": ranked_up,
            "dropped_pack": pack_type,
            "reward_breakdown": {
                "xp": {
                    "base": xp_base_display,
                    "accuracyBonus": xp_accuracy_bonus_display,
                    "speedBonus": xp_speed_bonus_display,
                    "total": final_xp,
                },
                "coins": {
                    "base": coins_base_display,
                    "accuracyBonus": coins_accuracy_bonus_display,
                    "speedBonus": coins_speed_bonus_display,
                    "total": final_coins,
                },
                "accuracyTier": accuracy_tier,
                "accuracyPercent": round(accuracy_percent, 1),
                "speedTier": speed_tier,
                "timeTakenSeconds": int(time_taken_seconds) if time_taken_seconds else None,
                "allottedSeconds": int(duration_seconds) if duration_seconds else None,
                "activityType": activity_type,
            },
        }

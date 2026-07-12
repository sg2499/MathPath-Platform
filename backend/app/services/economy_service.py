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
    # Reward is proportional to the activity's own admin-configured allotted
    # duration_seconds -- NOT the student's actual time_taken_seconds. Two
    # deliberate reasons: (1) time_taken_seconds is derived after submission,
    # and the student-portal audit that led to this found it had historically
    # been the source of real timing bugs (see the AUTO_SUBMITTED timestamp
    # fixes) -- keying the reward off a field that can itself be wrong would
    # let that bug corrupt payouts too. duration_seconds is fixed and correct
    # the instant the attempt starts. (2) This program explicitly rewards
    # speed -- paying by time *taken* would mean a fast, accurate student
    # earns LESS than a slow one for the same accuracy on the same content,
    # which is backwards. Paying by allotted duration means the size of the
    # reward reflects the size of the activity, not how quickly any one
    # student finished it; the accuracy multiplier is what rewards quality.
    #
    # Because every module/level can configure its own duration per DPS,
    # assessment, and mock, this formula never needs manual re-tuning as new
    # content is added -- it reads directly from each attempt's own stored
    # duration_seconds every time.
    GAMIFICATION_MINUTE_RATE = 500.0 / 60.0 / 1.5  # derived from the mock exam's pre-existing 500 XP / 60-minute baseline at ACTIVITY_WEIGHTS["MOCK"]
    ACTIVITY_WEIGHTS = {
        "DPS": 1.0,          # routine, frequent, lowest stakes
        "ASSESSMENT": 1.3,   # gates level progression
        "MOCK": 1.5,         # competitive, leaderboard-visible, highest stakes
    }
    COIN_XP_RATIO = 0.05  # unchanged from the original mock formula (25 coins / 500 xp)
    MIN_DURATION_MINUTES = 1.0
    MAX_DURATION_MINUTES = 180.0  # guards against a misconfigured (0, negative, or absurd) duration ever producing a buggy payout

    @staticmethod
    def evaluate_activity_performance(
        db: Session,
        user_id: str,
        accuracy_percent: float,
        activity_type: str,
        duration_seconds: int | float | None,
        reference_id: str = "N/A",
    ) -> Dict[str, Any]:
        """
        The single XP/coin formula for DPS sheets, assessments, and mock
        exams alike. See the module-level comment above for why the reward
        is based on the activity's allotted duration rather than the
        student's actual time taken.
        """
        weight = EconomyService.ACTIVITY_WEIGHTS.get(activity_type, 1.0)
        raw_minutes = float(duration_seconds or 0) / 60.0
        duration_minutes = max(
            EconomyService.MIN_DURATION_MINUTES,
            min(raw_minutes, EconomyService.MAX_DURATION_MINUTES),
        )
        multiplier = EconomyService._accuracy_multiplier(accuracy_percent)

        base_xp = EconomyService.GAMIFICATION_MINUTE_RATE * duration_minutes * weight
        final_xp = max(0, round(base_xp * multiplier))
        final_coins = max(0, round(final_xp * EconomyService.COIN_XP_RATIO)) if accuracy_percent >= 50.0 else 0

        # Loot-pack drops stay mock-exclusive for now -- Collector's Vault,
        # where a dropped pack would actually be seen and opened, isn't built
        # out yet for DPS/assessment content.
        dropped_pack = None
        pack_type = None
        if activity_type == "MOCK":
            dropped_pack = roll_loot_drop(base_chance_percent=10.0, multiplier=multiplier)
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
        }

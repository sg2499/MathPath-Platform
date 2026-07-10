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
    def evaluate_assignment_performance(
        db: Session, 
        user_id: str, 
        accuracy_percent: float, 
        base_xp: int = 200, 
        assignment_id: str = "N/A"
    ) -> Dict[str, Any]:
        """
        The core Multiplier Engine ensuring high performance yields more XP & Drops, 
        rather than just volume grinding.
        """
        # Multiplier scaling: <50% = 0.5x, >90% = 2.0x, 100% = 2.5x
        multiplier = 1.0
        if accuracy_percent == 100.0:
            multiplier = 2.5
        elif accuracy_percent >= 90.0:
            multiplier = 2.0
        elif accuracy_percent >= 75.0:
            multiplier = 1.5
        elif accuracy_percent < 50.0:
            multiplier = 0.5
            
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

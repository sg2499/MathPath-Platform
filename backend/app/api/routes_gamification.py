import uuid
import random
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.dependencies import get_current_user
from app.models.models import (
    User,
    UserLootbox,
    UserCollectibles,
    CollectiblesDictionary,
    UserEconomy,
    EconomyTransaction
)

router = APIRouter(prefix="/api/student/gamification", tags=["gamification"])

@router.get("/vault")
def get_vault_data(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns un-opened lootboxes, acquired collectibles (joined with dict),
    and quantum_fragments balance.
    """
    # 1. Economy
    economy = db.query(UserEconomy).filter_by(user_id=current_user.id).first()
    fragments = economy.quantum_fragments if economy else 0

    # 2. Unopened Lootboxes
    boxes = db.query(UserLootbox).filter(
        UserLootbox.user_id == current_user.id,
        UserLootbox.is_opened == False
    ).order_by(UserLootbox.created_at.desc()).all()

    # 3. Collectibles
    # Join with dictionary to get full data
    collectibles_query = db.query(UserCollectibles, CollectiblesDictionary).join(
        CollectiblesDictionary, UserCollectibles.collectible_id == CollectiblesDictionary.id
    ).filter(
        UserCollectibles.user_id == current_user.id
    ).all()

    collectibles_list = []
    for uc, cd in collectibles_query:
        collectibles_list.append({
            "id": uc.id,
            "collectible_id": cd.id,
            "name": cd.name,
            "description": cd.description,
            "rarity": cd.rarity,
            "type": cd.type,
            "series": cd.series,
            "model_3d_url": cd.model_3d_url,
            "image_url": cd.image_url,
            "acquired_via": uc.acquired_via,
            "acquired_at": uc.created_at.isoformat() if uc.created_at else None
        })

    return {
        "quantum_fragments": fragments,
        "lootboxes": [
            {
                "id": b.id,
                "box_type": b.box_type,
                "acquired_via": b.acquired_via,
                "created_at": b.created_at.isoformat() if b.created_at else None
            } for b in boxes
        ],
        "collectibles": collectibles_list
    }

@router.post("/vault/unbox")
def unbox_lootbox(
    payload: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Unboxes a specific lootbox. Roll rng, return item or fragments if duplicate.
    """
    lootbox_id = payload.get("lootbox_id")
    if not lootbox_id:
        raise HTTPException(status_code=400, detail="Missing lootbox_id")
        
    box = db.query(UserLootbox).filter(
        UserLootbox.id == lootbox_id,
        UserLootbox.user_id == current_user.id,
        UserLootbox.is_opened == False
    ).first()
    
    if not box:
        raise HTTPException(status_code=404, detail="Lootbox not found or already opened")
        
    # Mark opened
    box.is_opened = True
    box.opened_at = func.now()
    
    # Simple RNG logic based on box_type
    # Alpha Pack: Common 60%, Uncommon 30%, Rare 9%, Epic 1%
    # Elite Chest: Uncommon 40%, Rare 40%, Epic 15%, Legendary 5%
    rng = random.random()
    if box.box_type == "ELITE_CHEST":
        if rng < 0.40: target_rarity = "UNCOMMON"
        elif rng < 0.80: target_rarity = "RARE"
        elif rng < 0.95: target_rarity = "EPIC"
        else: target_rarity = "LEGENDARY"
    else: # Default ALPHA_PACK
        if rng < 0.60: target_rarity = "COMMON"
        elif rng < 0.90: target_rarity = "UNCOMMON"
        elif rng < 0.99: target_rarity = "RARE"
        else: target_rarity = "EPIC"
        
    # Pick a random collectible of that rarity
    possible_items = db.query(CollectiblesDictionary).filter_by(rarity=target_rarity).all()
    if not possible_items:
        # Fallback to any if none in that rarity
        possible_items = db.query(CollectiblesDictionary).all()
        
    if not possible_items:
        raise HTTPException(status_code=500, detail="No collectibles exist in the database")
        
    won_item = random.choice(possible_items)
    
    # Check if duplicate
    existing = db.query(UserCollectibles).filter(
        UserCollectibles.user_id == current_user.id,
        UserCollectibles.collectible_id == won_item.id
    ).first()
    
    economy = db.query(UserEconomy).filter_by(user_id=current_user.id).first()
    if not economy:
        economy = UserEconomy(user_id=current_user.id)
        db.add(economy)
        
    is_duplicate = False
    fragments_awarded = 0
    
    if existing:
        is_duplicate = True
        # Award fragments based on rarity
        fragment_map = {
            "COMMON": 10,
            "UNCOMMON": 25,
            "RARE": 100,
            "EPIC": 400,
            "LEGENDARY": 1000,
            "MYTHIC": 2500
        }
        fragments_awarded = fragment_map.get(won_item.rarity, 10)
        economy.quantum_fragments += fragments_awarded
        
        tx = EconomyTransaction(
            user_id=current_user.id,
            transaction_type="EARN",
            amount_coins=fragments_awarded, # Reusing amount_coins as fragments for tx history
            source_action="DUPLICATE_DISMANTLE",
            reference_id=won_item.id
        )
        db.add(tx)
    else:
        # Give item
        new_uc = UserCollectibles(
            user_id=current_user.id,
            collectible_id=won_item.id,
            acquired_via=f"UNBOX_{box.box_type}"
        )
        db.add(new_uc)
        
    db.commit()
    
    return {
        "success": True,
        "is_duplicate": is_duplicate,
        "fragments_awarded": fragments_awarded,
        "item": {
            "id": won_item.id,
            "name": won_item.name,
            "description": won_item.description,
            "rarity": won_item.rarity,
            "type": won_item.type,
            "series": won_item.series,
            "model_3d_url": won_item.model_3d_url,
            "image_url": won_item.image_url
        }
    }

import sys
import os
import uuid
import random

# Add backend directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal
from app.models.models import CollectiblesDictionary

def generate_collectibles():
    # Massive list of collectibles imitating Siege/Apex lore
    collectibles = [
        # TITLES (COMMON to MYTHIC)
        {"name": "The Apprentice", "type": "TITLE", "rarity": "COMMON", "series": "Initiation"},
        {"name": "Number Cruncher", "type": "TITLE", "rarity": "COMMON", "series": "Initiation"},
        {"name": "Problem Solver", "type": "TITLE", "rarity": "UNCOMMON", "series": "Initiation"},
        {"name": "Equation Sniper", "type": "TITLE", "rarity": "RARE", "series": "The Tactician"},
        {"name": "Calculus Warlord", "type": "TITLE", "rarity": "EPIC", "series": "The Warlord"},
        {"name": "The Abacus Prodigy", "type": "TITLE", "rarity": "LEGENDARY", "series": "The Legends"},
        {"name": "Apex Scholar", "type": "TITLE", "rarity": "LEGENDARY", "series": "The Legends"},
        {"name": "Chaos Bringer", "type": "TITLE", "rarity": "MYTHIC", "series": "The Voidborn Relics"},
        {"name": "God of Mathematics", "type": "TITLE", "rarity": "MYTHIC", "series": "The Celestial Armory"},
        
        # AVATARS
        {"name": "Default Cadet", "type": "AVATAR", "rarity": "COMMON", "series": "Initiation", "image_url": "/assets/avatars/cadet.png"},
        {"name": "Neon Hacker", "type": "AVATAR", "rarity": "RARE", "series": "CyberSec", "image_url": "/assets/avatars/neon_hacker.png"},
        {"name": "Crimson Knight", "type": "AVATAR", "rarity": "EPIC", "series": "The Warlord", "image_url": "/assets/avatars/crimson_knight.png"},
        {"name": "Celestial Being", "type": "AVATAR", "rarity": "LEGENDARY", "series": "The Celestial Armory", "image_url": "/assets/avatars/celestial.png"},
        {"name": "Void Entity", "type": "AVATAR", "rarity": "MYTHIC", "series": "The Voidborn Relics", "image_url": "/assets/avatars/void_entity.png"},

        # CHARMS (3D Desk Items)
        {"name": "Bronze Abacus Charm", "type": "CHARM", "rarity": "COMMON", "series": "Initiation", "model_3d_url": "bronze_abacus.glb"},
        {"name": "Silver Geode Charm", "type": "CHARM", "rarity": "UNCOMMON", "series": "Earthly Treasures", "model_3d_url": "silver_geode.glb"},
        {"name": "Gold Fibonacci Charm", "type": "CHARM", "rarity": "RARE", "series": "The Tactician", "model_3d_url": "gold_fib.glb"},
        {"name": "Plasma Reactor Charm", "type": "CHARM", "rarity": "EPIC", "series": "CyberSec", "model_3d_url": "plasma_reactor.glb"},
        {"name": "Singularity Core Charm", "type": "CHARM", "rarity": "LEGENDARY", "series": "The Legends", "model_3d_url": "singularity.glb"},
        {"name": "Mythic Pet: Cyber Owl Egg", "type": "CHARM", "rarity": "MYTHIC", "series": "Evolution Matrix", "model_3d_url": "cyber_owl_egg.glb"},
        {"name": "Mythic Pet: Abyssal Dragon Core", "type": "CHARM", "rarity": "MYTHIC", "series": "Evolution Matrix", "model_3d_url": "dragon_core.glb"},

        # BANNERS
        {"name": "Standard Grid", "type": "BANNER", "rarity": "COMMON", "series": "Initiation", "image_url": "/assets/banners/grid.png"},
        {"name": "Synthwave Horizon", "type": "BANNER", "rarity": "EPIC", "series": "CyberSec", "image_url": "/assets/banners/synthwave.png"},
        {"name": "Celestial Supernova", "type": "BANNER", "rarity": "LEGENDARY", "series": "The Celestial Armory", "image_url": "/assets/banners/supernova.png"},
        {"name": "Event Horizon", "type": "BANNER", "rarity": "MYTHIC", "series": "The Voidborn Relics", "image_url": "/assets/banners/event_horizon.png"},
    ]

    return collectibles

def seed_db():
    db = SessionLocal()
    items = generate_collectibles()
    added_count = 0
    
    try:
        # Check what exists
        existing = {item.name for item in db.query(CollectiblesDictionary.name).all()}
        
        for item in items:
            if item["name"] not in existing:
                new_item = CollectiblesDictionary(
                    id=str(uuid.uuid4()),
                    name=item["name"],
                    type=item.get("type", "AVATAR"),
                    rarity=item["rarity"],
                    series=item.get("series", "General"),
                    description=f"A {item['rarity']} {item.get('type', 'item').lower()} from the {item.get('series', 'General')} series.",
                    image_url=item.get("image_url", ""),
                    model_3d_url=item.get("model_3d_url", "")
                )
                db.add(new_item)
                added_count += 1
        
        db.commit()
        print(f"Successfully added {added_count} new Gamification Collectibles to the Dictionary.")
        
    except Exception as e:
        print(f"Error seeding DB: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    print("Seeding Gamification Collectibles Dictionary...")
    seed_db()

'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PackageOpen, Sparkles, Lock, Trophy } from 'lucide-react';
import { AlphaPackUnboxCinematic } from './AlphaPackUnboxCinematic';
import { cn } from '@/lib/utils';

interface VaultItem {
  id: str;
  name: str;
  rarity: 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
  isUnopenedPack?: boolean;
}

// Dummy data to simulate the user's vault
const MY_INVENTORY: VaultItem[] = [
  { id: '1', name: 'Alpha Pack', rarity: 'COMMON', isUnopenedPack: true },
  { id: '2', name: 'Elite Chest', rarity: 'LEGENDARY', isUnopenedPack: true },
  { id: '3', name: 'Galactic Abacus', rarity: 'EPIC', isUnopenedPack: false },
  { id: '4', name: 'Newton\'s Apple', rarity: 'RARE', isUnopenedPack: false },
];

export function CollectorVaultWorkspace() {
  const [activeTab, setActiveTab] = useState<'COLLECTION' | 'UNBOX'>('UNBOX');
  const [unboxingPack, setUnboxingPack] = useState<VaultItem | null>(null);

  const packs = MY_INVENTORY.filter(i => i.isUnopenedPack);
  const collection = MY_INVENTORY.filter(i => !i.isUnopenedPack);

  if (unboxingPack) {
    return (
      <AlphaPackUnboxCinematic 
        pack={unboxingPack} 
        onComplete={() => setUnboxingPack(null)} 
      />
    );
  }

  return (
    <div className="flex flex-col w-full h-full min-h-screen bg-slate-950 text-white p-8">
      
      {/* Header */}
      <div className="flex items-center justify-between mb-8 border-b border-slate-800 pb-6">
        <div>
          <h1 className="text-4xl font-black tracking-tighter uppercase drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
            Collector's Vault
          </h1>
          <p className="text-slate-400 mt-1 text-sm font-semibold uppercase tracking-widest">
            Unlock and showcase your absolute highest achievements.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-8">
        <button
          onClick={() => setActiveTab('UNBOX')}
          className={cn(
            "px-6 py-3 rounded-md font-black uppercase tracking-widest transition-all duration-300",
            activeTab === 'UNBOX' 
              ? "bg-indigo-600 text-white shadow-[0_0_20px_rgba(79,70,229,0.5)]" 
              : "bg-slate-900 text-slate-500 hover:bg-slate-800"
          )}
        >
          Unbox Packs ({packs.length})
        </button>
        <button
          onClick={() => setActiveTab('COLLECTION')}
          className={cn(
            "px-6 py-3 rounded-md font-black uppercase tracking-widest transition-all duration-300",
            activeTab === 'COLLECTION' 
              ? "bg-indigo-600 text-white shadow-[0_0_20px_rgba(79,70,229,0.5)]" 
              : "bg-slate-900 text-slate-500 hover:bg-slate-800"
          )}
        >
          My Collection
        </button>
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="flex-1 w-full"
        >
          {activeTab === 'UNBOX' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
              {packs.map((pack) => (
                <motion.div
                  key={pack.id}
                  whileHover={{ scale: 1.05, y: -5 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setUnboxingPack(pack)}
                  className={cn(
                    "relative flex flex-col items-center justify-center p-8 rounded-xl border-2 cursor-pointer transition-all overflow-hidden",
                    pack.rarity === 'LEGENDARY' 
                      ? "border-yellow-500/50 bg-gradient-to-b from-yellow-900/40 to-black hover:shadow-[0_0_30px_rgba(234,179,8,0.4)]"
                      : "border-cyan-500/50 bg-gradient-to-b from-cyan-900/40 to-black hover:shadow-[0_0_30px_rgba(6,182,212,0.4)]"
                  )}
                >
                  <PackageOpen className={cn("w-16 h-16 mb-4", pack.rarity === 'LEGENDARY' ? 'text-yellow-400' : 'text-cyan-400')} />
                  <span className="font-black uppercase tracking-widest text-center">
                    {pack.name}
                  </span>
                  <span className="text-xs text-slate-400 mt-2 font-bold uppercase">Click to Unbox</span>
                </motion.div>
              ))}
            </div>
          )}

          {activeTab === 'COLLECTION' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
              {collection.map((item) => (
                <div
                  key={item.id}
                  className="relative flex flex-col items-center justify-center p-8 rounded-xl border border-slate-800 bg-slate-900/50"
                >
                  {/* Pseudo 3D Pedestal */}
                  <div className="w-24 h-6 bg-slate-800 rounded-[100%] absolute bottom-6 opacity-50 blur-md" />
                  
                  <Trophy className="w-16 h-16 mb-6 text-slate-300 z-10 relative drop-shadow-xl" />
                  <span className="font-black uppercase tracking-widest text-center text-sm z-10">
                    {item.name}
                  </span>
                  <span className="text-[10px] text-slate-500 mt-1 font-bold uppercase z-10">
                    {item.rarity}
                  </span>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

    </div>
  );
}

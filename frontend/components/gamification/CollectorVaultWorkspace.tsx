'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PackageOpen, Sparkles, Lock, Trophy } from 'lucide-react';
import { AlphaPackUnboxCinematic } from './AlphaPackUnboxCinematic';
import { cn } from '@/lib/utils';

interface VaultItem {
  id: string;
  name: string;
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
    <div className="flex flex-col w-full h-full gap-6">
      {/* Vault Hero Block (Standardized to Trophy Room Style) */}
      <section className="math-dashboard-hero math-dashboard-hero-student math-dashboard-hero-clean shrink-0">
        <div className="pointer-events-none absolute -right-16 -top-20 h-60 w-60 rounded-full bg-indigo-300/18 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-1/3 h-36 w-36 rounded-full bg-cyan-300/16 blur-3xl" />
        
        <div className="relative flex items-start justify-between gap-5">
          <div className="flex flex-col gap-5">
            <div className="math-block-header w-fit">
              <Sparkles size={14} />
              Collector's Vault
            </div>
            
            <div className="flex flex-col gap-3">
              <h1 className="flex items-center gap-3 text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-[2.35rem]">
                Unlock <span className="text-orange-500 dark:text-orange-400">Mythic</span> Rewards
              </h1>
              <p className="math-subtitle max-w-4xl lg:whitespace-nowrap">
                Redeem caches earned from dedicated practice and exceptional Mock Exam performance. Unlock premium avatars, prestigious mastery titles, and exclusive 3D companions.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Tabs (Standardized to Trophy Room Style) */}
      <div className="flex items-center space-x-4 shrink-0">
        <button 
          onClick={() => setActiveTab("UNBOX")}
          className={`px-8 py-3 rounded-full font-bold transition-all ${
            activeTab === "UNBOX" 
              ? "bg-orange-500 text-white shadow-lg shadow-orange-500/30 scale-105" 
              : "bg-white dark:bg-slate-800 text-slate-500 hover:text-white hover:bg-orange-500"
          }`}
        >
          Decrypt Caches ({packs.length})
        </button>
        <button 
          onClick={() => setActiveTab("COLLECTION")}
          className={`px-8 py-3 rounded-full font-bold transition-all ${
            activeTab === "COLLECTION" 
              ? "bg-orange-500 text-white shadow-lg shadow-orange-500/30 scale-105" 
              : "bg-white dark:bg-slate-800 text-slate-500 hover:text-white hover:bg-orange-500"
          }`}
        >
          The Codex
        </button>
      </div>

      {/* Main Grid Workspace */}
      <section className="math-dashboard-workspace flex-1 overflow-hidden relative rounded-[2rem] border border-white/40 dark:border-white/10 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] dark:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] bg-white/40 dark:bg-slate-900/40 backdrop-blur-3xl p-4 sm:p-5 lg:p-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.3 }}
            className="w-full h-full overflow-y-auto custom-scrollbar pr-2"
          >
            {activeTab === 'UNBOX' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
                {packs.map((pack) => (
                  <motion.div
                    key={pack.id}
                    whileHover={{ scale: 1.05, y: -5 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setUnboxingPack(pack)}
                    className={cn(
                      "relative group flex flex-col items-center justify-center p-8 rounded-[2rem] cursor-pointer transition-all overflow-hidden h-72",
                      pack.rarity === 'LEGENDARY' 
                        ? "bg-gradient-to-b from-yellow-500/20 to-black/50 border border-yellow-500/30 hover:shadow-[0_0_40px_rgba(234,179,8,0.3)] hover:border-yellow-400"
                        : pack.rarity === 'EPIC'
                        ? "bg-gradient-to-b from-purple-500/20 to-black/50 border border-purple-500/30 hover:shadow-[0_0_40px_rgba(168,85,247,0.3)] hover:border-purple-400"
                        : "bg-gradient-to-b from-cyan-500/20 to-black/50 border border-cyan-500/30 hover:shadow-[0_0_40px_rgba(6,182,212,0.3)] hover:border-cyan-400"
                    )}
                  >
                    <div className="absolute inset-0 bg-[url('/assets/noise.png')] opacity-10 mix-blend-overlay"></div>
                    <Lock className={cn("w-16 h-16 mb-4 z-10 transition-transform group-hover:scale-110", pack.rarity === 'LEGENDARY' ? 'text-yellow-400' : pack.rarity === 'EPIC' ? 'text-purple-400' : 'text-cyan-400')} />
                    <span className="font-black uppercase tracking-widest text-center z-10 text-white drop-shadow-md">
                      {pack.name}
                    </span>
                    <span className="text-xs text-white/50 mt-2 font-bold uppercase z-10 tracking-[0.2em]">Hold to Decrypt</span>
                  </motion.div>
                ))}
                
                {packs.length === 0 && (
                  <div className="col-span-full flex flex-col items-center justify-center h-full text-slate-500 pt-20">
                    <PackageOpen className="w-16 h-16 mb-4 opacity-50" />
                    <h3 className="text-xl font-black uppercase tracking-widest">No Caches Found</h3>
                    <p className="font-medium mt-2">Complete more conquests to earn encrypted caches.</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'COLLECTION' && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                {collection.map((item) => (
                  <div
                    key={item.id}
                    className="relative flex flex-col items-center justify-center p-6 rounded-[2rem] border border-white/10 bg-black/40 backdrop-blur-md h-64 overflow-hidden group hover:border-white/30 transition-all duration-500"
                  >
                    <div className="absolute inset-0 bg-gradient-to-t from-indigo-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                    <div className="w-24 h-4 bg-white/5 rounded-[100%] absolute bottom-8 blur-md" />
                    
                    <Trophy className="w-16 h-16 mb-6 text-white/80 z-10 relative drop-shadow-2xl group-hover:scale-110 transition-transform duration-500" />
                    <span className="font-black uppercase tracking-widest text-center text-sm z-10 text-white leading-tight">
                      {item.name}
                    </span>
                    <span className={cn(
                      "text-[10px] mt-2 font-black uppercase tracking-[0.2em] z-10",
                      item.rarity === 'LEGENDARY' ? 'text-yellow-400' : 
                      item.rarity === 'EPIC' ? 'text-purple-400' :
                      item.rarity === 'RARE' ? 'text-cyan-400' : 'text-slate-400'
                    )}>
                      {item.rarity}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </section>
    </div>
  );
}

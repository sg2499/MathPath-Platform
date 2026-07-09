'use client';

import React from 'react';
import { Sparkles, Hammer, ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';

interface ForgeProps {
  fragments: number;
  onCraftComplete: () => void;
}

export function TheForge({ fragments, onCraftComplete }: ForgeProps) {
  // We'll keep this simple for Phase 4. Crafting hits an API to spend fragments and get a box.
  
  const handleCraft = async (cost: number, boxType: string) => {
    // Phase 5 will implement the actual Forge POST endpoint
    alert(`Crafting ${boxType} for ${cost} fragments! (API pending)`);
  };

  return (
    <div className="flex flex-col gap-6 w-full max-w-5xl mx-auto py-8">
      <div className="bg-gradient-to-r from-orange-500/20 to-rose-500/20 rounded-[2rem] border border-orange-500/30 p-8 flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-black text-orange-500 dark:text-orange-400 drop-shadow-md flex items-center gap-3">
            <Hammer /> The Forge
          </h2>
          <p className="text-slate-600 dark:text-slate-300 mt-2 font-medium max-w-2xl">
            Dismantled duplicates yield Quantum Fragments. Spend your fragments here to craft specific, high-tier Encrypted Caches.
          </p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-xl border border-slate-200 dark:border-slate-800 flex flex-col items-end">
          <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">Your Fragments</span>
          <span className="text-4xl font-black text-orange-500 flex items-center gap-2">
            <Sparkles size={24} /> {fragments}
          </span>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
        {/* Elite Chest Crafting */}
        <div className="bg-white dark:bg-slate-800 rounded-[2rem] border border-slate-200 dark:border-slate-700 p-8 flex flex-col gap-4 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-500/10 rounded-full blur-3xl -mr-10 -mt-10" />
          <h3 className="text-2xl font-black text-slate-900 dark:text-white">Elite Chest</h3>
          <p className="text-slate-500">Guarantees an Uncommon or higher rarity item. High chance for Legendaries.</p>
          <div className="flex items-center justify-between mt-auto pt-6">
            <span className="font-bold text-yellow-500 flex items-center gap-1">Cost: 1,000 <Sparkles size={14}/></span>
            <button 
              onClick={() => handleCraft(1000, 'ELITE_CHEST')}
              disabled={fragments < 1000}
              className="px-6 py-3 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold hover:scale-105 transition-transform disabled:opacity-50 disabled:hover:scale-100 flex items-center gap-2"
            >
              Craft <ArrowRight size={16} />
            </button>
          </div>
        </div>

        {/* Alpha Pack Crafting */}
        <div className="bg-white dark:bg-slate-800 rounded-[2rem] border border-slate-200 dark:border-slate-700 p-8 flex flex-col gap-4 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-3xl -mr-10 -mt-10" />
          <h3 className="text-2xl font-black text-slate-900 dark:text-white">Alpha Pack</h3>
          <p className="text-slate-500">Standard cache. Contains standard drop rates.</p>
          <div className="flex items-center justify-between mt-auto pt-6">
            <span className="font-bold text-cyan-500 flex items-center gap-1">Cost: 250 <Sparkles size={14}/></span>
            <button 
              onClick={() => handleCraft(250, 'ALPHA_PACK')}
              disabled={fragments < 250}
              className="px-6 py-3 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold hover:scale-105 transition-transform disabled:opacity-50 disabled:hover:scale-100 flex items-center gap-2"
            >
              Craft <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
